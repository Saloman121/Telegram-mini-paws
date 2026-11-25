import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { AggregateField, FieldValue } from 'firebase-admin/firestore';

const emails = () => (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CATS = ['in_game', 'partners', 'invite'];

export default function adminRouter(db) {
  const r = express.Router();
  const wrap = (fn) => (req, res) =>
    Promise.resolve(fn(req, res)).catch((e) => res.status(500).json({ error: e.message }));
  const audit = (req, action, details = {}) =>
    db.collection('audit_logs').add({ admin: req.admin, action, details, at: FieldValue.serverTimestamp() });

  // Every admin route requires a valid Firebase login whose email is in ADMIN_EMAILS
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

  const shape = (d) => {
    const u = d.data();
    return { id: d.id, name: u.first_name || u.username || 'User', username: u.username || '',
      balance: u.balance || 0, level: u.level || 1, blocked: !!u.blocked,
      wallet: u.wallet || null, walletVerified: !!u.walletVerified, referralCount: u.referralCount || 0 };
  };

  r.get('/stats', wrap(async (req, res) => {
    const [users, tasks, agg] = await Promise.all([
      db.collection('users').count().get(),
      db.collection('tasks').count().get(),
      db.collection('users').aggregate({ total: AggregateField.sum('balance') }).get(),
    ]);
    res.json({ users: users.data().count, tasks: tasks.data().count, total_points: agg.data().total || 0 });
  }));

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
      const n = Number(b.level);
      if (!Number.isInteger(n) || n < 1 || n > 50) return res.status(400).json({ error: 'Level must be 1-50' });
      patch.level = n;
    }
    if (b.blocked !== undefined) patch.blocked = !!b.blocked;
    const before = snap.data();
    await ref.update(patch);
    await audit(req, 'user.update', { id, before: { balance: before.balance, level: before.level, blocked: !!before.blocked }, after: patch });
    res.json({ ok: true });
  }));

  r.get('/tasks', wrap(async (req, res) => {
    const s = await db.collection('tasks').get();
    res.json({ items: s.docs.map((d) => ({ id: d.id, ...d.data() })) });
  }));
  r.post('/tasks', wrap(async (req, res) => {
    const b = req.body || {};
    const title = String(b.title || '').trim().slice(0, 100);
    const reward = Number(b.reward);
    if (!title || !Number.isFinite(reward) || reward < 0) return res.status(400).json({ error: 'Title and valid reward required' });
    const data = {
      title, reward: Math.floor(reward),
      description: String(b.description || '').slice(0, 300),
      url: String(b.url || '').trim().slice(0, 500),
      category: CATS.includes(b.category) ? b.category : 'in_game',
    };
    if (b.id) await db.collection('tasks').doc(String(b.id)).set(data, { merge: true });
    else await db.collection('tasks').add(data);
    await audit(req, 'task.save', { id: b.id || null, title });
    res.json({ ok: true });
  }));
  r.delete('/tasks/:id', wrap(async (req, res) => {
    await db.collection('tasks').doc(String(req.params.id)).delete();
    await audit(req, 'task.delete', { id: req.params.id });
    res.json({ ok: true });
  }));

  r.get('/withdrawals', wrap(async (req, res) => {
    const s = await db.collection('withdrawals').orderBy('createdAt', 'desc').limit(50).get();
    res.json({ items: s.docs.map((d) => ({ id: d.id, user: d.data().user, amount: d.data().amount, wallet: d.data().wallet, status: d.data().status || 'pending' })) });
  }));
  r.post('/withdrawals/:id', wrap(async (req, res) => {
    const status = String(req.body?.status || '');
    if (!['pending', 'completed', 'rejected'].includes(status)) return res.status(400).json({ error: 'Bad status' });
    await db.collection('withdrawals').doc(String(req.params.id)).update({ status });
    await audit(req, 'withdrawal.' + status, { id: req.params.id });
    res.json({ ok: true });
  }));

  r.post('/broadcast', wrap(async (req, res) => {
    const text = String(req.body?.text || '').trim().slice(0, 1000);
    if (!text) return res.status(400).json({ error: 'Message is empty' });
    const token = (process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (!token) return res.status(500).json({ error: 'Bot token not set' });
    const ids = (await db.collection('users').limit(500).get()).docs.map((d) => d.id);
    let sent = 0, failed = 0;
    for (let i = 0; i < ids.length; i += 20) {
      const out = await Promise.allSettled(ids.slice(i, i + 20).map((id) =>
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: id, text }),
        }).then((x) => x.ok)));
      out.forEach((o) => (o.status === 'fulfilled' && o.value ? sent++ : failed++));
      await sleep(1000);
    }
    await audit(req, 'broadcast', { sent, failed });
    res.json({ sent, failed });
  }));

  r.get('/audit', wrap(async (req, res) => {
    const s = await db.collection('audit_logs').orderBy('at', 'desc').limit(50).get();
    res.json({ items: s.docs.map((d) => ({ admin: d.data().admin, action: d.data().action, details: d.data().details, at: d.data().at?.toMillis?.() || null })) });
  }));

  return r;
}
