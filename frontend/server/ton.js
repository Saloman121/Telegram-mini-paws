import crypto from 'node:crypto';

// TON_NETWORK env: "testnet" (default, safe) or "mainnet"
const net = () => ((process.env.TON_NETWORK || 'testnet').toLowerCase() === 'mainnet' ? 'mainnet' : 'testnet');
const apiBase = () => (net() === 'mainnet' ? 'https://toncenter.com' : 'https://testnet.toncenter.com');
const CHAIN = { mainnet: '-239', testnet: '-3' };
const TTL_MS = 30 * 60 * 1000;
// Only wallet verification is payable for now. auto_tap / buy_token return "Coming soon".
const FEE_KEY = { wallet_verification: 'vfee' };

// Friendly (UQ.../kQ...) or raw address -> "workchain:hex"
export function toRaw(addr) {
  const a = String(addr || '').trim();
  if (/^-?\d+:[0-9a-fA-F]{64}$/.test(a)) return a.toLowerCase();
  try {
    const b = Buffer.from(a.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (b.length !== 36) return null;
    return `${b.readInt8(1)}:${b.subarray(2, 34).toString('hex')}`;
  } catch { return null; }
}

// Admin address must be a friendly address of the active network
const validAdmin = (a) =>
  /^[A-Za-z0-9_+/-]{48}$/.test(a) && (net() === 'mainnet' ? /^[EU]/.test(a) : /^[k0]/.test(a));

// Base64 BOC of one cell holding a text comment: 32-bit zero opcode + UTF-8 text
function commentPayload(text) {
  const data = Buffer.concat([Buffer.alloc(4), Buffer.from(text, 'utf8')]);
  if (data.length > 127) throw new Error('Comment too long');
  const cell = Buffer.concat([Buffer.from([0x00, data.length * 2]), data]);
  const boc = Buffer.concat([
    Buffer.from([0xb5, 0xee, 0x9c, 0x72, 0x01, 0x01, 0x01, 0x01, 0x00, cell.length, 0x00]),
    cell,
  ]);
  return boc.toString('base64');
}

// Look for the payment in the admin wallet's incoming transactions
async function findPayment(it) {
  try {
    const headers = process.env.TON_API_KEY ? { 'X-API-Key': process.env.TON_API_KEY } : {};
    const res = await fetch(`${apiBase()}/api/v2/getTransactions?address=${encodeURIComponent(it.admin)}&limit=50`, { headers });
    const j = await res.json();
    if (!j || !j.ok || !Array.isArray(j.result)) return null;
    const want = BigInt(it.amount);
    const wantFrom = toRaw(it.wallet);
    for (const tx of j.result) {
      const m = tx.in_msg;
      if (!m || m.message !== it.comment) continue;
      if (BigInt(m.value || '0') < want) continue;
      if (toRaw(m.source) !== wantFrom) continue;
      if (tx.out_msgs && tx.out_msgs.length) continue; // bounced, money went back
      if (tx.utime && tx.utime * 1000 < it.createdAt - 60000) continue;
      return tx.transaction_id?.hash || null;
    }
  } catch { /* treat as not found yet */ }
  return null;
}

async function confirm(db, ref, it, hash) {
  const txRef = db.collection('ton_txs').doc(String(hash).replace(/[\/+=]/g, '_'));
  await db.runTransaction(async (t) => {
    const userRef = db.collection('users').doc(it.user);
    const [cur, user, used] = await Promise.all([t.get(ref), t.get(userRef), t.get(txRef)]);
    if (!['created', 'submitted'].includes(cur.data().status)) return;
    if (used.exists) return t.update(ref, { status: 'failed', reason: 'Transaction already used' });
    if (toRaw(user.data().wallet) !== toRaw(it.wallet))
      return t.update(ref, { status: 'failed', reason: 'Wallet changed during payment' });
    t.set(txRef, { intent: ref.id, user: it.user, at: Date.now() });
    t.update(ref, { status: 'confirmed', tx: hash, confirmedAt: Date.now() });
    t.update(userRef, { walletVerified: true });
  });
}

export default function registerTon(r, { db, getConfig, wrap }) {
  const intents = db.collection('payment_intents');

  r.post('/ton/payment/intent', wrap(async (req, res) => {
    const u = req.user;
    if (u.blocked) return res.status(403).json({ error: 'Account blocked' });
    const purpose = String(req.body?.purpose || '');
    if (purpose === 'auto_tap' || purpose === 'buy_token') return res.status(501).json({ error: 'Coming soon' });
    if (!FEE_KEY[purpose]) return res.status(400).json({ error: 'Unknown payment type' });
    if (u.walletVerified) return res.status(400).json({ error: 'Wallet already verified' });
    if (!u.wallet) return res.status(400).json({ error: 'Connect your wallet first' });
    if (u.walletNetwork && String(u.walletNetwork) !== CHAIN[net()])
      return res.status(400).json({ error: `Switch your wallet to ${net()}` });

    const cfg = await getConfig();
    const admin = String(cfg.adminw || '').trim();
    if (!validAdmin(admin)) return res.status(400).json({ error: `Admin wallet is not set to a valid ${net()} address` });
    const ton = Number(cfg[FEE_KEY[purpose]]);
    if (!Number.isFinite(ton) || ton <= 0) return res.status(400).json({ error: 'Fee is not configured' });

    const amount = BigInt(Math.round(ton * 1e9));
    const id = crypto.randomBytes(8).toString('hex');
    const comment = `paws:${id}`;
    await intents.doc(id).set({
      user: req.uid, purpose, amount: amount.toString(), comment, admin, wallet: u.wallet,
      network: net(), status: 'created', createdAt: Date.now(), expiresAt: Date.now() + TTL_MS, lastCheck: 0,
    });
    res.json({ intent_id: id, address: admin, amount_nano: amount.toString(), payload: commentPayload(comment) });
  }));

  r.post('/ton/payment/verify', wrap(async (req, res) => {
    const ref = intents.doc(String(req.body?.intent_id || '_'));
    const s = await ref.get();
    if (!s.exists || s.data().user !== req.uid) return res.status(404).json({ error: 'Payment not found' });
    if (s.data().status === 'created')
      await ref.update({ status: 'submitted', boc: String(req.body?.boc || '').slice(0, 4000), submittedAt: Date.now() });
    res.json({ ok: true });
  }));

  r.get('/ton/payment/status', wrap(async (req, res) => {
    const ref = intents.doc(String(req.query.intent_id || '_'));
    const s = await ref.get();
    if (!s.exists || s.data().user !== req.uid) return res.status(404).json({ error: 'Payment not found' });
    const it = s.data();
    if (it.status === 'confirmed') return res.json({ status: 'confirmed' });
    if (it.status === 'failed') return res.json({ status: 'failed', reason: it.reason || 'Payment failed' });
    if (Date.now() < (it.lastCheck || 0) + 3000) return res.json({ status: 'pending' });

    await ref.update({ lastCheck: Date.now() });
    const hash = await findPayment(it);
    if (hash) {
      await confirm(db, ref, it, hash);
      const f = (await ref.get()).data();
      return res.json(f.status === 'confirmed' ? { status: 'confirmed' } : { status: 'failed', reason: f.reason });
    }
    if (Date.now() > it.expiresAt) {
      await ref.update({ status: 'failed', reason: 'Payment not found. If you already paid, contact support.' });
      return res.json({ status: 'failed', reason: 'Payment not found. If you already paid, contact support.' });
    }
    res.json({ status: 'pending' });
  }));
}
