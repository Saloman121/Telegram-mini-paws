import express from 'express';
import crypto from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import adminRouter, { loadSettings } from './admin.js';

// ---- Firebase init ----
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
if (!getApps().length) initializeApp({ credential: cert(sa) });
const db = getFirestore();

const app = express();
app.use(express.json());

// Admin panel API (Firebase login + ADMIN_EMAILS). Must come before the Telegram-auth router.
app.use('/api/admin', adminRouter(db));

const MAX_LEVEL = 50;

// Settings come from Firestore (config/app), edited in the admin panel. Cached for 30s.
let cfgCache = { at: 0, v: null };
async function getConfig() {
  if (cfgCache.v && Date.now() - cfgCache.at < 30000) return cfgCache.v;
  cfgCache = { at: Date.now(), v: await loadSettings(db) };
  return cfgCache.v;
}
const publicConfig = (c) => ({
  max_level: MAX_LEVEL,
  links: { community: c.comm || '', rewards: '' },
  referral_percent: c.refpct,
  verification_fee_ton: c.vfee,
  auto_tap_fee_ton: c.afee,
  min_withdrawal: c.minwd,
  conversion_rate: c.rate,
});

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
        wallet: null, walletVerified: false, autoTap: false, lastSeen: Date.now(),
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
const sessionMs = (cfg) => cfg.dur * 60 * 60 * 1000;
function session(u, cfg) {
  const now = Date.now();
  if (now - (u.sessionStart || 0) > sessionMs(cfg)) return { taps: 0, start: now };
  return { taps: u.sessionTaps || 0, start: u.sessionStart };
}

const RANKS = ['Rookie', 'Cub', 'Hunter', 'Ranger', 'Alpha', 'Legend'];
const rankTitle = (lvl) => RANKS[Math.min(RANKS.length - 1, Math.floor((lvl - 1) / 10))];
const displayName = (d) => d.first_name || d.username || 'User';

// Level table: Level x 500 taps / session, Level x 1,000 PAWS holding (level 1 free)
const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => {
  const level = i + 1;
  return { level, max_taps: level * 500, required_holding: level === 1 ? 0 : level * 1000 };
});

function shapeProfile(u, cfg) {
  const s = session(u, cfg);
  const max = u.level * 500;
  return {
    id: u.id, username: u.username, first_name: u.first_name,
    blocked: !!u.blocked,
    points: u.balance, balance: u.balance, withdrawable: u.balance,
    level: u.level, rank_title: rankTitle(u.level),
    wallet: u.wallet || null,
    referral_code: u.id,
    mining: {
      energy: Math.max(0, max - s.taps), max_energy: max, per_tap: cfg.tap,
      auto_tap_active: !!u.autoTap, auto_claimable: 0,
    },
    config: publicConfig(cfg),
  };
}

// ---- Auth / user ----
r.post('/auth/telegram', wrap(async (req, res) => {
  const cfg = await getConfig();
  await req.ref.update({ lastSeen: Date.now() });
  res.json({ ok: true, user: shapeProfile(req.user, cfg) });
}));
r.get('/user/profile', wrap(async (req, res) => res.json(shapeProfile(req.user, await getConfig()))));
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
  const cfg = await getConfig();
  const max = u.level * 500;
  const s = session(u, cfg);
  const want = Math.max(0, Math.min(Number(req.body.count) || 0, 100));
  const allowed = Math.max(0, Math.min(want, max - s.taps));
  const gain = allowed * cfg.tap;
  await req.ref.update({
    balance: FieldValue.increment(gain),
    sessionTaps: s.taps + allowed, sessionStart: s.start,
  });

  // Referral bonus: only credited if the referrer has a verified wallet
  if (u.referredBy && gain > 0) {
    const bonus = Math.floor((gain * cfg.refpct) / 100);
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
    added: gain,
    points: u.balance + gain,
    energy: Math.max(0, max - (s.taps + allowed)),
  });
}));
r.get('/mining/status', wrap(async (req, res) => {
  const cfg = await getConfig();
  const s = session(req.user, cfg);
  res.json({ sessionTaps: s.taps, maxTaps: req.user.level * 500,
             resetsAt: s.start + sessionMs(cfg), balance: req.user.balance });
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

// ---- Tasks (managed from the admin panel) ----
r.get('/tasks', wrap(async (req, res) => {
  const [all, mine] = await Promise.all([
    db.collection('tasks').get(),
    req.ref.collection('tasks').get(),
  ]);
  const state = new Map(mine.docs.map((d) => [d.id, d.data()]));
  res.json({
    items: all.docs.filter((d) => d.data().enabled !== false).map((d) => {
      const t = d.data();
      const m = state.get(d.id) || {};
      return {
        task_id: d.id,
        category: t.category || 'in_game',
        icon: t.icon || '',
        title: t.title || 'Task',
        description: t.description || '',
        reward: Number(t.reward) || 0,
        link: t.url || t.link || '',
        verify: t.verify || 'auto',
        status: m.completed ? 'completed' : m.submitted ? 'pending' : m.startedAt ? 'started' : 'available',
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
  if (req.user.blocked) return res.status(403).json({ error: 'Account blocked' });
  const id = String(req.body.task_id);
  const t = await db.collection('tasks').doc(id).get();
  if (!t.exists) return res.status(404).json({ error: 'Task not found' });
  const task = t.data();
  const mine = req.ref.collection('tasks').doc(id);
  const m = await mine.get();
  if (!m.exists || !m.data().startedAt) return res.status(400).json({ error: 'Start the task first' });
  if (m.data().completed) return res.status(400).json({ error: 'Already completed' });
  const reward = Number(task.reward) || 0;

  // Manual review: admin approves it in the panel, points are credited then
  if (task.verify === 'manual') {
    if (m.data().submitted) return res.status(400).json({ error: 'Already submitted for review' });
    await db.collection('task_submissions').add({
      user: req.uid, username: displayName(req.user), task_id: id, title: task.title || '',
      reward, status: 'pending', createdAt: FieldValue.serverTimestamp(),
    });
    await mine.set({ submitted: true }, { merge: true });
    return res.json({ ok: true, status: 'pending', reward });
  }

  await mine.set({ completed: true, completedAt: Date.now() }, { merge: true });
  await req.ref.update({ balance: FieldValue.increment(reward) });
  res.json({ ok: true, status: 'completed', reward });
}));

// ---- Wallet (basic; automatic TON proof verification comes later) ----
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

// ---- TON payments: not built yet ----
const soon = (req, res) => res.status(501).json({ error: 'Coming soon' });
r.post('/ton/payment/intent', soon);
r.post('/ton/payment/verify', soon);
r.get('/ton/payment/status', soon);

// ---- Withdrawals: points are held on request, admin approves/rejects in the panel ----
r.post('/withdrawals/request', wrap(async (req, res) => {
  const u = req.user;
  const cfg = await getConfig();
  const amount = Math.floor(Number(req.body.amount));
  if (u.blocked) return res.status(403).json({ error: 'Account blocked' });
  if (!u.wallet || !u.walletVerified) return res.status(400).json({ error: 'Verify your wallet first' });
  if (!Number.isFinite(amount) || amount < cfg.minwd) return res.status(400).json({ error: `Minimum withdrawal is ${cfg.minwd} PAWS` });
  const wref = db.collection('withdrawals').doc();
  const ok = await db.runTransaction(async (t) => {
    const s = await t.get(req.ref);
    if ((s.data().balance || 0) < amount) return false;
    t.update(req.ref, { balance: FieldValue.increment(-amount) });
    t.set(wref, {
      user: req.uid, username: displayName(u), amount, wallet: u.wallet,
      status: 'pending', tx: '', createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!ok) return res.status(400).json({ error: 'Insufficient balance' });
  res.json({ ok: true });
}));
r.get('/withdrawals/history', wrap(async (req, res) => {
  const s = await db.collection('withdrawals').where('user', '==', req.uid).limit(30).get();
  const items = s.docs.map((d) => ({ id: d.id, amount: d.data().amount, status: d.data().status, ts: d.data().createdAt?.toMillis?.() || 0 }))
    .sort((a, b) => b.ts - a.ts);
  res.json({ items });
}));

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
