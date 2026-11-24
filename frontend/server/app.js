import express from 'express';
import crypto from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ---- Firebase init ----
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
if (!getApps().length) initializeApp({ credential: cert(sa) });
const db = getFirestore();

const app = express();
app.use(express.json());

const SESSION_MS = 2 * 60 * 60 * 1000; // 2 hour tap session
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
  if (calc !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date')) > 86400) return null;
  try { return JSON.parse(p.get('user')); } catch { return null; }
}

async function auth(req, res, next) {
  try {
    const initData = (req.headers.authorization || '').replace(/^tma /, '');
    const tg = verifyInitData(initData);
    if (!tg) return res.status(401).json({
  error: `Invalid Telegram auth (token:${!!(process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN)}, initData:${initData.length})`,
});
    const ref = db.collection('users').doc(String(tg.id));
    let snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        id: String(tg.id), username: tg.username || '', first_name: tg.first_name || '',
        balance: 0, level: 1, sessionTaps: 0, sessionStart: 0,
        referredBy: null, referralCount: 0, wallet: null,
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

// ---- Auth / user ----
r.post('/auth/telegram', wrap((req, res) => res.json({ ok: true, user: req.user })));
r.get('/user/profile', wrap((req, res) => res.json(req.user)));
r.get('/user/balance', wrap((req, res) => res.json({ balance: req.user.balance })));
r.get('/user/level', wrap((req, res) =>
  res.json({ level: req.user.level, maxTaps: req.user.level * 500, holdRequired: req.user.level * 1000 })));
r.post('/user/level/upgrade', wrap((req, res) =>
  res.status(501).json({ error: 'Level upgrade needs TON payment (coming soon)' })));

// ---- Mining ----
function session(u) {
  const now = Date.now();
  if (now - (u.sessionStart || 0) > SESSION_MS) return { taps: 0, start: now };
  return { taps: u.sessionTaps || 0, start: u.sessionStart };
}
r.post('/mining/tap', wrap(async (req, res) => {
  const u = req.user;
  const max = u.level * 500;
  const s = session(u);
  const want = Math.max(0, Math.min(Number(req.body.count) || 0, 100));
  const allowed = Math.min(want, max - s.taps);
  await req.ref.update({
    balance: FieldValue.increment(allowed),
    sessionTaps: s.taps + allowed, sessionStart: s.start,
  });
  res.json({ added: allowed, balance: u.balance + allowed, sessionTaps: s.taps + allowed, maxTaps: max });
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
  res.json({ items: q.docs.map((d) => ({ id: d.id, name: d.data().first_name, username: d.data().username })), next: null });
}));
r.get('/referrals/stats', wrap((req, res) =>
  res.json({ code: req.uid, count: req.user.referralCount || 0 })));
r.post('/referrals/process', wrap(async (req, res) => {
  const code = String(req.body.code || '');
  if (req.user.referredBy || !code || code === req.uid)
    return res.status(400).json({ error: 'Referral not allowed' });
  const refUser = db.collection('users').doc(code);
  if (!(await refUser.get()).exists) return res.status(404).json({ error: 'Referrer not found' });
  await req.ref.update({ referredBy: code });
  await refUser.update({ referralCount: FieldValue.increment(1), balance: FieldValue.increment(500) });
  res.json({ ok: true });
}));

// ---- Tasks (admin adds docs in Firestore "tasks" collection: {title, reward, url}) ----
r.get('/tasks', wrap(async (req, res) => {
  const [all, done] = await Promise.all([
    db.collection('tasks').get(),
    req.ref.collection('tasks').get(),
  ]);
  const doneIds = new Set(done.docs.filter((d) => d.data().completed).map((d) => d.id));
  res.json({ items: all.docs.map((d) => ({ id: d.id, ...d.data(), completed: doneIds.has(d.id) })) });
}));
r.post('/tasks/start', wrap(async (req, res) => {
  await req.ref.collection('tasks').doc(String(req.body.task_id)).set({ startedAt: Date.now() }, { merge: true });
  res.json({ ok: true });
}));
r.post('/tasks/complete', wrap(async (req, res) => {
  const id = String(req.body.task_id);
  const t = await db.collection('tasks').doc(id).get();
  if (!t.exists) return res.status(404).json({ error: 'Task not found' });
  const mine = req.ref.collection('tasks').doc(id);
  const m = await mine.get();
  if (m.exists && m.data().completed) return res.status(400).json({ error: 'Already completed' });
  const reward = Number(t.data().reward) || 0;
  await mine.set({ completed: true, completedAt: Date.now() }, { merge: true });
  await req.ref.update({ balance: FieldValue.increment(reward) });
  res.json({ ok: true, reward });
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
r.get('/wallet/status', wrap((req, res) =>
  res.json({ connected: !!req.user.wallet, address: req.user.wallet, verified: false })));

// ---- Not built yet ----
const soon = (req, res) => res.status(501).json({ error: 'Coming soon' });
r.post('/ton/payment/intent', soon);
r.post('/ton/payment/verify', soon);
r.get('/ton/payment/status', soon);
r.post('/withdrawals/request', soon);
r.get('/withdrawals/history', wrap((req, res) => res.json({ items: [] })));

// ---- Leaderboard ----
r.get('/leaderboard', wrap(async (req, res) => {
  const q = await db.collection('users').orderBy('balance', 'desc').limit(50).get();
  res.json({ items: q.docs.map((d, i) => ({
    rank: i + 1, name: d.data().first_name || d.data().username || 'User', balance: d.data().balance })), next: null });
}));

app.use('/api', r);
export default app;
