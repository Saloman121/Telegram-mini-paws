import express from 'express';
import crypto from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import adminRouter from './admin.js';

// ---- Firebase init ----
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
if (!getApps().length) initializeApp({ credential: cert(sa) });
const db = getFirestore();

const app = express();
app.use(express.json());

// Admin panel API (protected by Firebase login + ADMIN_EMAILS). Must come before the Telegram-auth router.
app.use('/api/admin', adminRouter(db));

// ---- Config (placeholders: change to your real values) ----
const SESSION_MS = 2 * 60 * 60 * 1000; // 2 hour tap session
const MAX_LEVEL = 50;
const REFERRAL_PERCENT = 10;
const CONFIG = {
  max_level: MAX_LEVEL,
  links: { community: '', rewards: '' },
  referral_percent: REFERRAL_PERCENT,
  verification_fee_ton: 0.15,
  auto_tap_fee_ton: 0.05,
  min_withdrawal: 10000,
  conversion_rate: 1000,
};

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => res.status(500).json({ error: e.message }));

// ---- Telegram initData verification (HMAC) ----
function verifyInitData(initData) {
  if (!initData) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash');
  p.delete('hash');
  const check = [...p.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`).join('\n');
  const TOKEN = (process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (calc !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date')) > 86400) return null;
  try { return JSON.parse(p.get('user')); } catch { return null; }
}

async function auth(req, res, next) {
  try {
    const initData = (req.headers.authorization || '').replace(/^tma /, '');
    const tg = verifyInitData(initData);
    if (!tg) return res.status(401).json({ error: 'Invalid Telegram auth' });
    const ref = db.collection('users').doc(String(tg.id));
    let snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        id: String(tg.id), username: tg.username || '', first_name: tg.first_name || '',
        balance: 0, level: 1, sessionTaps: 0, sessionStart: 0,
        referredBy: null, referralCount: 0, referralEarnings: 0,
        wallet: null, walletVerified: false, autoTap: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      snap = await ref.get();
    }
    req.uid = String(tg.id);
    req.ref = ref;
    req.user = snap.data();
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

const r = express.Router();
r.use(auth);

// ---- Helpers ----
function session(u) {
  const now = Date.now();
  if (now - (u.sessionStart || 0) > SESSION_MS) return { taps: 0, start: now };
  return { taps: u.sessionTaps || 0, start: u.sessionStart };
}

const RANKS = ['Rookie', 'Cub', 'Hunter', 'Ranger', 'Alpha', 'Legend'];
const rankTitle = (lvl) => RANKS[Math.min(RANKS.length - 1, Math.floor((lvl - 1) / 10))];
const displayName = (d) => d.first_name || d.username || 'User';

// Level table: Level x 500 taps / 2h, Level x 1,000 PAWS holding (level 1 free)
const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => {
  const level = i + 1;
  return { level, max_taps: level * 500, required_holding: level === 1 ? 0 : level * 1000 };
});

function shapeProfile(u) {
  const s = session(u);
  const max = u.level * 500;
  return {
    id: u.id, username: u.username, first_name: u.first_name,
    blocked: !!u.blocked,
    points: u.balance, balance: u.balance, withdrawable: u.balance,
    level: u.level, rank_title: rankTitle(u.level),
    wallet: u.wallet || null,
    referral_code: u.id,
    mining: {
      energy: Math.max(0, max - s.taps), max_energy: max, per_tap: 1,
      auto_tap_active: !!u.autoTap, auto_claimable: 0,
    },
    config: CONFIG,
  };
}

// ---- Auth / user ----
r.post('/auth/telegram', wrap((req, res) => res.json({ ok: true, user: shapeProfile(req.user) })));
r.get('/user/profile', wrap((req, res) => res.json(shapeProfile(req.user))));
r.get('/user/balance', wrap((req, res) => res.json({ balance: req.user.balance })));

r.get('/user/level', wrap((req, res) => {
  const current = req.user.level;
  res.json({
    jetton_balance: 0,
    current,
    levels: LEVELS.map((l) => ({ ...l, unlocked: l.level <= current })),
  });
}));
r.post('/user/level/upgrade', wrap((req, res) =>
  res.status(501).json({ error: 'Upgrade needs verified PAWS holding (coming soon)' })));

// ---- Mining ----
r.post('/mining/tap', wrap(async (req, res) => {
  const u = req.user;
  if (u.blocked) return res.status(403).json({ error: 'Account blocked' });
  const max = u.level * 500;
  const s = session(u);
  const want = Math.max(0, Math.min(Number(req.body.count) || 0, 100));
  const allowed = Math.max(0, Math.min(want, max - s.taps));
  await req.ref.update({
    balance: FieldValue.increment(allowed),
    sessionTaps: s.taps + allowed, sessionStart: s.start,
  });

  // Referral bonus: only credited if the referrer has a verified wallet
  if (u.referredBy && allowed > 0) {
    const bonus = Math.floor((allowed * REFERRAL_PERCENT) / 100);
    if (bonus > 0) {
      const refRef = db.collection('users').doc(u.referredBy);
      const refSnap = await refRef.get();
      if (refSnap.exists && refSnap.data().walletVerified) {
        await refRef.update({
          balance: FieldValue.increment(bonus),
          referralEarnings: FieldValue.increment(bonus),
        });
      }
    }
  }

  res.json({
    added: allowed,
    points: u.balance + allowed,
    energy: Math.max(0, max - (s.taps + allowed)),
  });
}));
r.get('/mining/status', wrap((req, res) => {
  const s = session(req.user);
  res.json({ sessionTaps: s.taps, maxTaps: req.user.level * 500,
             resetsAt: s.start + SESSION_MS, balance: req.user.balance });
}));
r.post('/mining/claim', wrap((req, res) => res.json({ claimed: 0, balance: req.user.balance })));

// ---- Referrals ----
r.get('/referrals', wrap(async (req, res) => {
  const q = await db.collection('users').where('referredBy', '==', req.uid).limit(50).get();
  res.json({
    items: q.docs.map((d) => ({ id: d.id, name: displayName(d.data()), verified: !!d.data().walletVerified })),
    next_cursor: null,
  });
}));
r.get('/referrals/stats', wrap(async (req, res) => {
  const verified = await db.collection('users')
    .where('referredBy', '==', req.uid).where('walletVerified', '==', true).count().get();
  res.json({
    total_invited: req.user.referralCount || 0,
    verified: verified.data().count,
    earnings: req.user.referralEarnings || 0,
  });
}));
r.post('/referrals/process', wrap(async (req, res) => {
  const code = String(req.body.code || '');
  if (req.user.referredBy || !code || code === req.uid)
    return res.status(400).json({ error: 'Referral not allowed' });
  const refUser = db.collection('users').doc(code);
  if (!(await refUser.get()).exists) return res.status(404).json({ error: 'Referrer not found' });
  await req.ref.update({ referredBy: code });
  await refUser.update({ referralCount: FieldValue.increment(1) });
  res.json({ ok: true });
}));

// ---- Tasks ----
// Admin adds docs in Firestore "tasks": { title, description, reward (number), url, category }
// category must be one of: in_game | partners | invite
r.get('/tasks', wrap(async (req, res) => {
  const [all, mine] = await Promise.all([
    db.collection('tasks').get(),
    req.ref.collection('tasks').get(),
  ]);
  const state = new Map(mine.docs.map((d) => [d.id, d.data()]));
  res.json({
    items: all.docs.map((d) => {
      const t = d.data();
      const m = state.get(d.id) || {};
      return {
        task_id: d.id,
        category: t.category || 'in_game',
        title: t.title || 'Task',
        description: t.description || '',
        reward: Number(t.reward) || 0,
        link: t.url || t.link || '',
        status: m.completed ? 'completed' : m.startedAt ? 'started' : 'available',
      };
    }),
  });
}));
r.post('/tasks/start', wrap(async (req, res) => {
  const id = String(req.body.task_id);
  const t = await db.collection('tasks').doc(id).get();
  if (!t.exists) return res.status(404).json({ error: 'Task not found' });
  await req.ref.collection('tasks').doc(id).set({ startedAt: Date.now() }, { merge: true });
  res.json({ ok: true, link: t.data().url || t.data().link || '' });
}));
r.post('/tasks/complete', wrap(async (req, res) => {
  const id = String(req.body.task_id);
  const t = await db.collection('tasks').doc(id).get();
  if (!t.exists) return res.status(404).json({ error: 'Task not found' });
  const mine = req.ref.collection('tasks').doc(id);
  const m = await mine.get();
  if (!m.exists || !m.data().startedAt) return res.status(400).json({ error: 'Start the task first' });
  if (m.data().completed) return res.status(400).json({ error: 'Already completed' });
  const reward = Number(t.data().reward) || 0;
  await mine.set({ completed: true, completedAt: Date.now() }, { merge: true });
  await req.ref.update({ balance: FieldValue.increment(reward) });
  res.json({ ok: true, status: 'completed', reward });
}));

// ---- Wallet (basic; full TON proof verification comes later) ----
r.get('/wallet/proof-payload', wrap((req, res) =>
  res.json({ payload: crypto.randomBytes(16).toString('hex') })));
r.post('/wallet/connect', wrap(async (req, res) => {
  const address = req.body?.account?.address || req.body?.address;
  if (!address) return res.status(400).json({ error: 'Address missing' });
  await req.ref.update({ wallet: address });
  res.json({ ok: true });
}));
r.get('/wallet/status', wrap((req, res) => res.json({
  connected: !!req.user.wallet,
  address: req.user.wallet || null,
  verified: !!req.user.walletVerified,
  ton_balance: 0,
  jetton_balance: 0,
  payments: [],
  transactions: [],
})));

// ---- Not built yet (TON payments / withdrawals) ----
const soon = (req, res) => res.status(501).json({ error: 'Coming soon' });
r.post('/ton/payment/intent', soon);
r.post('/ton/payment/verify', soon);
r.get('/ton/payment/status', soon);
r.post('/withdrawals/request', soon);
r.get('/withdrawals/history', wrap((req, res) => res.json({ items: [] })));

// ---- Leaderboard ----
r.get('/leaderboard', wrap(async (req, res) => {
  const [top, total, ahead] = await Promise.all([
    db.collection('users').orderBy('balance', 'desc').limit(50).get(),
    db.collection('users').count().get(),
    db.collection('users').where('balance', '>', req.user.balance).count().get(),
  ]);
  res.json({
    total_users: total.data().count,
    me: { rank: ahead.data().count + 1, username: displayName(req.user), points: req.user.balance },
    items: top.docs.map((d, i) => ({ rank: i + 1, username: displayName(d.data()), points: d.data().balance })),
    next_cursor: null,
  });
}));

app.use('/api', r);
export default app;
