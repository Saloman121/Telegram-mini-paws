import express from 'express';
import crypto from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import adminRouter, { loadSettings } from './admin.js';
import registerTon, { toRaw } from './ton.js';
import { loadLevels, levelOf, checkEligibility } from './rules.js';

// ---- Firebase init ----
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
if (!getApps().length) initializeApp({ credential: cert(sa) });
const db = getFirestore();

const app = express();
app.use(express.json());

// Admin panel API (Firebase login + ADMIN_EMAILS). Must come before the Telegram-auth router.
app.use('/api/admin', adminRouter(db));

// Settings come from Firestore (config/app), edited in the admin panel. Cached for 10s.
let cfgCache = { at: 0, v: null };
async function getConfig() {
  if (cfgCache.v && Date.now() - cfgCache.at < 10000) return cfgCache.v;
  cfgCache = { at: Date.now(), v: await loadSettings(db) };
  return cfgCache.v;
}
const ctx = async () => {
  const [cfg, levels] = await Promise.all([getConfig(), loadLevels(db)]);
  return { cfg, levels };
};
const publicConfig = (c, levels) => ({
  project: c.project,
  symbol: c.symbol,
  session_hours: c.dur,
  mining_mode: c.mode,
  max_level: levels.length,
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
        mineStart: 0, mineEnd: 0, mineReward: 0,
        referredBy: null, referralCount: 0, referralEarnings: 0,
        wallet: null, walletVerified: false, autoTap: false, autoStart: 0, lastSeen: Date.now(),
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

// Auto Tap: one full session's taps (from the level table x points per tap) accrue over one session duration
function autoClaimable(u, cfg, levels) {
  if (!u.autoTap || !u.autoStart) return 0;
  const frac = Math.min(1, Math.max(0, (Date.now() - u.autoStart) / sessionMs(cfg)));
  return Math.floor(frac * levelOf(levels, u.level).max_taps) * cfg.tap;
}

// Referral bonus: only credited if the referrer has a verified wallet
async function creditReferral(u, gain, cfg) {
  if (!u.referredBy || gain <= 0) return;
  const bonus = Math.floor((gain * cfg.refpct) / 100);
  if (bonus <= 0) return;
  const refRef = db.collection('users').doc(u.referredBy);
  const refSnap = await refRef.get();
  if (refSnap.exists && refSnap.data().walletVerified) {
    await refRef.update({
      balance: FieldValue.increment(bonus),
      referralEarnings: FieldValue.increment(bonus),
    });
  }
}

const RANKS = ['Rookie', 'Cub', 'Hunter', 'Ranger', 'Alpha', 'Legend'];
const rankTitle = (lvl) => RANKS[Math.min(RANKS.length - 1, Math.floor((lvl - 1) / 10))];
const displayName = (d) => d.first_name || d.username || 'User';

function shapeProfile(u, cfg, levels) {
  const s = session(u, cfg);
  const lvl = Math.min(u.level || 1, levels.length);
  const max = levelOf(levels, lvl).max_taps;
  return {
    id: u.id, username: u.username, first_name: u.first_name,
    blocked: !!u.blocked,
    points: u.balance, balance: u.balance, withdrawable: u.balance,
    level: lvl, rank_title: rankTitle(lvl),
    wallet: u.wallet || null,
    referral_code: u.id,
    mining: {
      energy: Math.max(0, max - s.taps), max_energy: max, per_tap: cfg.tap,
      auto_tap_active: !!u.autoTap, auto_claimable: autoClaimable(u, cfg, levels), auto_start: u.autoStart || 0,
      mine_start: u.mineStart || 0, mine_end: u.mineEnd || 0, mine_reward: u.mineReward || 0,
      server_time: Date.now(),
    },
    config: publicConfig(cfg, levels),
  };
}

// ---- Auth / user ----
r.post('/auth/telegram', wrap(async (req, res) => {
  const { cfg, levels } = await ctx();
  await req.ref.update({ lastSeen: Date.now() });
  res.json({ ok: true, user: shapeProfile(req.user, cfg, levels) });
}));
r.get('/user/profile', wrap(async (req, res) => {
  const { cfg, levels } = await ctx();
  res.json(shapeProfile(req.user, cfg, levels));
}));
r.get('/user/balance', wrap((req, res) => res.json({ balance: req.user.balance })));

// Lightweight settings sync for the open app (does not touch points/energy)
r.get('/app/config', wrap(async (req, res) => {
  const { cfg, levels } = await ctx();
  const p = shapeProfile(req.user, cfg, levels);
  res.json({
    config: p.config, per_tap: p.mining.per_tap, max_energy: p.mining.max_energy,
    level: p.level, rank_title: p.rank_title, blocked: p.blocked,
  });
}));

r.get('/user/level', wrap(async (req, res) => {
  const levels = await loadLevels(db);
  const current = Math.min(req.user.level || 1, levels.length);
  res.json({
    jetton_balance: 0,
    current,
    levels: levels.map((l) => ({ ...l, unlocked: l.level <= current })),
  });
}));
r.post('/user/level/upgrade', wrap((req, res) =>
  res.status(501).json({ error: 'Upgrade needs verified PAWS holding (coming soon)' })));

// ---- Mining: manual taps ----
r.post('/mining/tap', wrap(async (req, res) => {
  const u = req.user;
  if (u.blocked) return res.status(403).json({ error: 'Account blocked' });
  const { cfg, levels } = await ctx();
  if (cfg.mode === 'session') return res.status(400).json({ error: 'Tap to start a mining session instead' });
  const max = levelOf(levels, u.level).max_taps;
  const s = session(u, cfg);
  const want = Math.max(0, Math.min(Number(req.body.count) || 0, 100));
  const allowed = Math.max(0, Math.min(want, max - s.taps));
  const gain = allowed * cfg.tap;
  await req.ref.update({
    balance: FieldValue.increment(gain),
    sessionTaps: s.taps + allowed, sessionStart: s.start,
  });
  await creditReferral(u, gain, cfg);

  res.json({
    added: gain,
    points: u.balance + gain,
    energy: Math.max(0, max - (s.taps + allowed)),
  });
}));
r.get('/mining/status', wrap(async (req, res) => {
  const { cfg, levels } = await ctx();
  const s = session(req.user, cfg);
  res.json({ sessionTaps: s.taps, maxTaps: levelOf(levels, req.user.level).max_taps,
             resetsAt: s.start + sessionMs(cfg), balance: req.user.balance });
}));

// ---- Mining: 1 tap starts a session, claim the whole reward when it ends ----
r.post('/mining/start', wrap(async (req, res) => {
  if (req.user.blocked) return res.status(403).json({ error: 'Account blocked' });
  const { cfg, levels } = await ctx();
  if (cfg.mode !== 'session') return res.status(400).json({ error: 'Session mining is off' });
  const out = await db.runTransaction(async (t) => {
    const snap = await t.get(req.ref);
    const u = snap.data();
    if (u.mineStart) return { error: Date.now() >= (u.mineEnd || 0) ? 'Claim your reward first' : 'Session already running' };
    const now = Date.now();
    // Reward is fixed at start, so later admin changes do not affect a running session
    const reward = levelOf(levels, u.level).max_taps * cfg.tap;
    t.update(req.ref, { mineStart: now, mineEnd: now + sessionMs(cfg), mineReward: reward });
    return { ok: true };
  });
  if (out.error) return res.status(400).json({ error: out.error });
  res.json({ ok: true });
}));
r.post('/mining/collect', wrap(async (req, res) => {
  if (req.user.blocked) return res.status(403).json({ error: 'Account blocked' });
  const { cfg } = await ctx();
  const out = await db.runTransaction(async (t) => {
    const snap = await t.get(req.ref);
    const u = snap.data();
    if (!u.mineStart) return { error: 'No active session. Tap to start one.' };
    if (Date.now() < (u.mineEnd || 0)) return { error: 'Session is not finished yet' };
    const reward = u.mineReward || 0;
    t.update(req.ref, { balance: FieldValue.increment(reward), mineStart: 0, mineEnd: 0, mineReward: 0 });
    return { claimed: reward, balance: (u.balance || 0) + reward, user: u };
  });
  if (out.error) return res.status(400).json({ error: out.error });
  await creditReferral(out.user, out.claimed, cfg);
  res.json({ claimed: out.claimed, points: out.balance });
}));

// ---- Auto Tap (paid with TON): claim pays what has accrued and restarts the accrual clock ----
r.post('/mining/claim', wrap(async (req, res) => {
  if (req.user.blocked) return res.status(403).json({ error: 'Account blocked' });
  const { cfg, levels } = await ctx();
  const out = await db.runTransaction(async (t) => {
    const snap = await t.get(req.ref);
    const u = snap.data();
    if (!u.autoTap) return { error: 'Auto Tap is not active' };
    if (!u.autoStart) {
      t.update(req.ref, { autoStart: Date.now() });
      return { error: 'Auto Tap started. Come back later to claim.' };
    }
    const amount = autoClaimable(u, cfg, levels);
    if (amount <= 0) return { error: 'Nothing to claim yet' };
    t.update(req.ref, { balance: FieldValue.increment(amount), autoStart: Date.now() });
    return { claimed: amount, balance: (u.balance || 0) + amount, user: u };
  });
  if (out.error) return res.status(400).json({ error: out.error });
  await creditReferral(out.user, out.claimed, cfg);
  res.json({ claimed: out.claimed, balance: out.balance });
}));

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

// ---- Wallet ----
r.get('/wallet/proof-payload', wrap((req, res) =>
  res.json({ payload: crypto.randomBytes(16).toString('hex') })));
r.post('/wallet/connect', wrap(async (req, res) => {
  const address = req.body?.account?.address || req.body?.address;
  if (!address) return res.status(400).json({ error: 'Address missing' });
  const raw = toRaw(address);
  if (!raw) return res.status(400).json({ error: 'Invalid address' });
  const patch = { wallet: address, walletNetwork: String(req.body?.network || '') };
  // A different wallet needs its own verification
  if (toRaw(req.user.wallet) !== raw) patch.walletVerified = false;
  await req.ref.update(patch);
  res.json({ ok: true });
}));
r.get('/wallet/status', wrap(async (req, res) => {
  let payments = [];
  if (!req.user.walletVerified) {
    const s = await db.collection('payment_intents').where('user', '==', req.uid).limit(10).get();
    payments = s.docs
      .map((d) => ({ id: d.id, status: d.data().status, at: d.data().createdAt || 0 }))
      .filter((p) => p.at > Date.now() - 3600000);
  }
  res.json({
    connected: !!req.user.wallet,
    address: req.user.wallet || null,
    verified: !!req.user.walletVerified,
    ton_balance: 0,
    jetton_balance: 0,
    payments,
    transactions: [],
  });
}));

// ---- TON payments: wallet verification + Auto Tap. Buy Token: Coming soon ----
registerTon(r, { db, getConfig, wrap });

// ---- Withdrawals: eligibility rules (admin panel) are enforced here; points are held on request ----
r.post('/withdrawals/request', wrap(async (req, res) => {
  const u = req.user;
  const cfg = await getConfig();
  const amount = Math.floor(Number(req.body.amount));
  if (u.blocked) return res.status(403).json({ error: 'Account blocked' });
  if (!u.wallet) return res.status(400).json({ error: 'Connect your wallet first' });
  const e = await checkEligibility(db, req.uid, u, cfg);
  if (!e.ok) return res.status(400).json({ error: 'Not eligible: ' + e.reasons.join('; ') });
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
