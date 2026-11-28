import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { AggregateField, FieldValue } from 'firebase-admin/firestore';
import { loadLevels, resetLevelsCache, checkEligibility } from './rules.js';

export const DEFAULTS = {
  project: '$PAWS', token: 'PAWS', symbol: 'PAWS', jetton: '', adminw: '',
  vfee: 0.15, afee: 0.05, minwd: 10000, rate: '1,000 PAWS = 0.01 TON',
    refpct: 10, tap: 1, dur: 2, comm: '', mode: 'session',
  // Withdrawal eligibility rules
  wd_walletverified: true, wd_minpts: 0, wd_minlevel: 1, wd_mintasks: 0, wd_minrefs: 0, wd_minage: 0, hold_days: 7,
};
const NUM = ['vfee', 'afee', 'minwd', 'refpct', 'tap', 'dur', 'wd_minpts', 'wd_minlevel', 'wd_mintasks', 'wd_minrefs', 'wd_minage', 'hold_days'];
const INT = ['minwd', 'wd_minpts', 'wd_minlevel', 'wd_mintasks', 'wd_minrefs', 'wd_minage', 'hold_days'];
const STR = ['project', 'token', 'symbol', 'jetton', 'adminw', 'rate', 'comm'];
const CATS = ['in_game', 'partners', 'invite'];
const emails = () => (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export async function loadSettings(db) {
  const s = await db.collection('config').doc('app').get();
  return { ...DEFAULTS, ...(s.exists ? s.data() : {}) };
}

export default function adminRouter(db) {
  const r = express.Router();
  const wrap = (fn) => (req, res) =>
    Promise.resolve(fn(req, res)).catch((e) => res.status(500).json({ error: e.message }));
  const audit = (req, action, details = {}) =>
    db.collection('audit_logs').add({ admin: req.admin, action, details, at: FieldValue.serverTimestamp() });
  const count = async (q) => (await q.count().get()).data().count;
  const sum = async (col, field) =>
    (await db.collection(col).aggregate({ t: AggregateField.sum(field) }).get()).data().t || 0;

  // Every admin route needs a valid Firebase login whose email is in ADMIN_EMAILS
  r.use(async (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      if (!token) return res.status(401).json({ error: 'Login required' });
      const dec = await getAuth().verifyIdToken(token);
      const email = (dec.email || '').toLowerCase();
      if (!(dec.admin === true || emails().includes(email))) return res.status(403).json({ error: 'Not an admin' });
      req.admin = email || dec.uid;
      next();
    } catch { res.status(401).json({ error: 'Invalid login' }); }
  });

  // ---- Dashboard ----
  r.get('/stats', wrap(async (req, res) => {
    const cfg = await loadSettings(db);
    const users = db.collection('users');
    const wds = db.collection('withdrawals');
    const n = new Date();
    const today = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    const days = [6, 5, 4, 3, 2, 1, 0].map((i) => today - i * 86400000);
    const [total, active, distributed, verified, autotap, referrals, pend, done, ...chart] = await Promise.all([
      count(users),
      count(users.where('lastSeen', '>=', Date.now() - 86400000)),
      sum('users', 'balance'),
      count(users.where('walletVerified', '==', true)),
      count(users.where('autoTap', '==', true)),
      sum('users', 'referralCount'),
      count(wds.where('status', '==', 'pending')),
      count(wds.where('status', '==', 'completed')),
      ...days.map((d) => count(users.where('createdAt', '>=', new Date(d)).where('createdAt', '<', new Date(d + 86400000)))),
    ]);
    res.json({
      users: total, active24h: active, distributed, verified,
      verification_ton: verified * cfg.vfee, autotap, referrals,
      wd_pending: pend, wd_completed: done, chart,
    });
  }));

  // ---- Users ----
  const shape = (d) => {
    const u = d.data();
    return {
      id: d.id, username: u.username || '', name: u.first_name || '',
      balance: u.balance || 0, level: u.level || 1, blocked: !!u.blocked,
      wallet: u.wallet || '', verified: !!u.walletVerified,
    };
  };
  r.get('/users', wrap(async (req, res) => {
    const q = String(req.query.q || '').trim().replace(/^@/, '');
    let docs = [];
    if (/^\d+$/.test(q)) {
      const d = await db.collection('users').doc(q).get();
      if (d.exists) docs = [d];
    } else if (q) {
      docs = (await db.collection('users').where('username', '==', q).limit(20).get()).docs;
    } else {
      docs = (await db.collection('users').orderBy('balance', 'desc').limit(30).get()).docs;
    }
    res.json({ items: docs.map(shape) });
  }));
  r.post('/users/:id', wrap(async (req, res) => {
    const id = String(req.params.id);
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Bad user id' });
    const ref = db.collection('users').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });
    const b = req.body || {};
    const patch = {};
    if (b.balance !== undefined) {
      const n = Number(b.balance);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Invalid points' });
      patch.balance = Math.floor(n);
    }
    if (b.level !== undefined) {
      const maxLevel = (await loadLevels(db, true)).length;
      const n = Number(b.level);
      if (!Number.isInteger(n) || n < 1 || n > maxLevel) return res.status(400).json({ error: `Level must be 1-${maxLevel}` });
            patch.level = n;
      patch.levelFixed = true;
    }
    if (b.blocked !== undefined) patch.blocked = !!b.blocked;
    const u = snap.data();
    await ref.update(patch);
    const who = u.username || id;
    const text = patch.blocked !== undefined ? `${patch.blocked ? 'Blocked' : 'Unblocked'} ${who}`
      : patch.level !== undefined ? `Set level of ${who} to ${patch.level}`
      : `Set points of ${who} to ${patch.balance}`;
    await audit(req, text, { id, before: { balance: u.balance, level: u.level, blocked: !!u.blocked }, after: patch });
    res.json({ ok: true });
  }));

  // ---- Tasks + manual submissions ----
  r.get('/tasks', wrap(async (req, res) => {
    const [t, s] = await Promise.all([
      db.collection('tasks').get(),
      db.collection('task_submissions').where('status', '==', 'pending').limit(50).get(),
    ]);
    res.json({
      items: t.docs.map((d) => ({
        id: d.id, icon: d.data().icon || '', title: d.data().title || '', reward: d.data().reward || 0,
        category: d.data().category || 'in_game', verify: d.data().verify || 'auto',
        url: d.data().url || d.data().link || '', enabled: d.data().enabled !== false,
      })),
      subs: s.docs.map((d) => ({ id: d.id, username: d.data().username || d.data().user, title: d.data().title || '', status: d.data().status })),
    });
  }));
  r.post('/tasks', wrap(async (req, res) => {
    const b = req.body || {};
    const data = {};
    if (b.title !== undefined) data.title = String(b.title).trim().slice(0, 100);
    if (b.reward !== undefined) {
      const n = Number(b.reward);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Invalid reward' });
      data.reward = Math.floor(n);
    }
    if (b.category !== undefined && CATS.includes(b.category)) data.category = b.category;
    if (b.verify !== undefined) data.verify = b.verify === 'manual' ? 'manual' : 'auto';
    if (b.url !== undefined) data.url = String(b.url).trim().slice(0, 500);
    if (b.icon !== undefined) data.icon = String(b.icon).slice(0, 8);
    if (b.enabled !== undefined) data.enabled = !!b.enabled;
    if (!b.id) {
      if (!data.title || data.reward === undefined) return res.status(400).json({ error: 'Title and reward required' });
      await db.collection('tasks').add({ category: 'in_game', verify: 'auto', enabled: true, ...data });
      await audit(req, `Added task "${data.title}" (${data.reward} PAWS)`);
    } else {
      await db.collection('tasks').doc(String(b.id)).set(data, { merge: true });
      await audit(req, `Updated task ${b.id}`, data);
    }
    res.json({ ok: true });
  }));
  r.delete('/tasks/:id', wrap(async (req, res) => {
    await db.collection('tasks').doc(String(req.params.id)).delete();
    await audit(req, `Deleted task ${req.params.id}`);
    res.json({ ok: true });
  }));
  r.post('/submissions/:id', wrap(async (req, res) => {
    const status = String(req.body?.status || '');
    if (!['completed', 'rejected'].includes(status)) return res.status(400).json({ error: 'Bad status' });
    const ref = db.collection('task_submissions').doc(String(req.params.id));
    const out = await db.runTransaction(async (t) => {
      const s = await t.get(ref);
      if (!s.exists) return { code: 404, error: 'Not found' };
      const sub = s.data();
      if (sub.status !== 'pending') return { code: 400, error: 'Already reviewed' };
      const userRef = db.collection('users').doc(String(sub.user));
      const taskRef = userRef.collection('tasks').doc(String(sub.task_id));
      if (status === 'completed') {
        t.update(userRef, { balance: FieldValue.increment(sub.reward || 0) });
        t.set(taskRef, { completed: true, completedAt: Date.now(), submitted: false }, { merge: true });
      } else {
        t.set(taskRef, { submitted: false }, { merge: true });
      }
      t.update(ref, { status });
      return { ok: true, sub };
    });
    if (out.error) return res.status(out.code).json({ error: out.error });
    await audit(req, `${status === 'completed' ? 'Approved' : 'Rejected'} submission by ${out.sub.username || out.sub.user}`);
    res.json({ ok: true });
  }));

  // ---- Settings (also used by the Mining, Referrals and Eligibility tabs) ----
  r.get('/settings', wrap(async (req, res) => res.json(await loadSettings(db))));
  r.post('/settings', wrap(async (req, res) => {
    const b = req.body || {};
    const patch = {};
    for (const k of NUM) {
      if (b[k] === undefined || b[k] === '') continue;
      const n = Number(b[k]);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Invalid value for ' + k });
      patch[k] = INT.includes(k) ? Math.floor(n) : n;
    }
    if (patch.refpct !== undefined && patch.refpct > 100) return res.status(400).json({ error: 'Referral % max is 100' });
    if (patch.dur !== undefined && (patch.dur < 0.5 || patch.dur > 24)) return res.status(400).json({ error: 'Session hours must be 0.5-24' });
    if (patch.tap !== undefined) patch.tap = Math.max(1, Math.floor(patch.tap));
    if (patch.wd_minlevel !== undefined) patch.wd_minlevel = Math.max(1, patch.wd_minlevel);
    if (b.wd_walletverified !== undefined) patch.wd_walletverified = !!b.wd_walletverified;
    if (b.mode !== undefined) patch.mode = b.mode === 'manual' ? 'manual' : 'session';
    for (const k of STR) if (b[k] !== undefined) patch[k] = String(b[k]).trim().slice(0, 200);
    await db.collection('config').doc('app').set(patch, { merge: true });
    await audit(req, 'Saved configuration', { keys: Object.keys(patch) });
    res.json({ ok: true });
  }));

  // ---- Level table (taps per session + required holding per level) ----
  r.get('/levels', wrap(async (req, res) => res.json({ levels: await loadLevels(db, true) })));
  r.post('/levels', wrap(async (req, res) => {
    const arr = req.body?.levels;
    if (!Array.isArray(arr) || arr.length < 1 || arr.length > 200) return res.status(400).json({ error: 'Need 1-200 levels' });
    const clean = [];
    for (let i = 0; i < arr.length; i++) {
      const taps = Math.floor(Number(arr[i]?.max_taps));
      const hold = Number(arr[i]?.required_holding);
      if (!Number.isFinite(taps) || taps < 1 || taps > 1000000) return res.status(400).json({ error: `Level ${i + 1}: taps must be 1 to 1,000,000` });
      if (!Number.isFinite(hold) || hold < 0) return res.status(400).json({ error: `Level ${i + 1}: holding must be 0 or more` });
      clean.push({ level: i + 1, max_taps: taps, required_holding: Math.floor(hold) });
    }
    await db.collection('config').doc('levels').set({ levels: clean });
    resetLevelsCache();
    await audit(req, `Saved level table (${clean.length} levels)`, { first: clean[0], last: clean[clean.length - 1] });
    res.json({ ok: true });
  }));

  // ---- Withdrawal eligibility: who passes the current rules ----
  r.get('/eligibility/users', wrap(async (req, res) => {
    const cfg = await loadSettings(db);
    const onlyOk = req.query.filter !== 'all';
    const snap = await db.collection('users').where('balance', '>=', cfg.wd_minpts).orderBy('balance', 'desc').limit(100).get();
    const rows = [];
    for (let i = 0; i < snap.docs.length; i += 20) {
      const part = await Promise.all(snap.docs.slice(i, i + 20).map(async (d) => {
        const u = d.data();
        const e = await checkEligibility(db, d.id, u, cfg);
        return {
          id: d.id, username: u.username || u.first_name || d.id, balance: u.balance || 0, level: u.level || 1,
          tasks: e.tasks, refs: e.refs, ok: e.ok, reasons: e.reasons,
        };
      }));
      rows.push(...part);
    }
    res.json({ scanned: rows.length, eligible: rows.filter((x) => x.ok).length, items: onlyOk ? rows.filter((x) => x.ok) : rows });
  }));

  // ---- Referrals ----
  r.get('/referrals', wrap(async (req, res) => {
    const [total, top] = await Promise.all([
      sum('users', 'referralCount'),
      db.collection('users').orderBy('referralCount', 'desc').limit(15).get(),
    ]);
    const items = await Promise.all(top.docs.filter((d) => (d.data().referralCount || 0) > 0).map(async (d) => {
      const n = d.data().referralCount || 0;
      const verified = await count(db.collection('users').where('referredBy', '==', d.id).where('walletVerified', '==', true));
      return { id: d.id, name: d.data().username || d.data().first_name || 'User', count: n, verified, flag: n >= 20 && verified === 0 };
    }));
    res.json({ total, items });
  }));

  // ---- Wallets ----
  r.get('/wallets', wrap(async (req, res) => {
    const s = await db.collection('users').where('wallet', '!=', null).limit(100).get();
    res.json({ items: s.docs.map((d) => ({
      id: d.id, username: d.data().username || d.data().first_name || d.id,
      wallet: d.data().wallet, verified: !!d.data().walletVerified, autotap: !!d.data().autoTap,
    })) });
  }));
  r.post('/wallets/:id', wrap(async (req, res) => {
    const id = String(req.params.id);
    const verified = !!req.body?.verified;
    await db.collection('users').doc(id).update({ walletVerified: verified });
    await audit(req, `${verified ? 'Marked verified' : 'Removed verification of'} wallet for user ${id}`);
    res.json({ ok: true });
  }));

  // ---- Withdrawals ----
  r.get('/withdrawals', wrap(async (req, res) => {
    const s = await db.collection('withdrawals').orderBy('createdAt', 'desc').limit(50).get();
    res.json({ items: s.docs.map((d) => ({
      id: d.id, username: d.data().username || d.data().user, amount: d.data().amount || 0,
      status: d.data().status || 'pending', tx: d.data().tx || '', wallet: d.data().wallet || '',
    })) });
  }));
  r.post('/withdrawals/:id', wrap(async (req, res) => {
    const status = String(req.body?.status || '');
    const tx = String(req.body?.tx || '').trim().slice(0, 200);
    const ref = db.collection('withdrawals').doc(String(req.params.id));
    const out = await db.runTransaction(async (t) => {
      const s = await t.get(ref);
      if (!s.exists) return { code: 404, error: 'Not found' };
      const w = s.data();
      const ok = (w.status === 'pending' && ['approved', 'rejected'].includes(status))
        || (w.status === 'approved' && ['completed', 'rejected'].includes(status));
      if (!ok) return { code: 400, error: 'Invalid status change' };
      if (status === 'completed' && !tx) return { code: 400, error: 'Transaction hash required' };
      // Rejected requests give the held points back to the user
      if (status === 'rejected') t.update(db.collection('users').doc(String(w.user)), { balance: FieldValue.increment(w.amount) });
      t.update(ref, { status, ...(status === 'completed' ? { tx } : {}), updatedAt: FieldValue.serverTimestamp() });
      return { ok: true, w };
    });
    if (out.error) return res.status(out.code).json({ error: out.error });
    await audit(req, `${status} withdrawal of ${out.w.amount} for ${out.w.username || out.w.user}${tx ? ' (tx ' + tx + ')' : ''}`);
    res.json({ ok: true });
  }));

  // ---- Audit log ----
  r.get('/audit', wrap(async (req, res) => {
    const s = await db.collection('audit_logs').orderBy('at', 'desc').limit(60).get();
    res.json({ items: s.docs.map((d) => ({ at: d.data().at?.toMillis?.() || null, admin: d.data().admin, action: d.data().action })) });
  }));

  return r;
}
