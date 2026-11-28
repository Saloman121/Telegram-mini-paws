// Reads a user's Jetton (PAWS) balance and TON balance from the blockchain via toncenter
const net = () => ((process.env.TON_NETWORK || 'testnet').toLowerCase() === 'mainnet' ? 'mainnet' : 'testnet');
const base = () => (net() === 'mainnet' ? 'https://toncenter.com' : 'https://testnet.toncenter.com');
const headers = () => (process.env.TON_API_KEY ? { 'X-API-Key': process.env.TON_API_KEY } : {});
const validMaster = (a) =>
  /^[A-Za-z0-9_+/-]{48}$/.test(a) && (net() === 'mainnet' ? /^[EU]/.test(a) : /^[k0]/.test(a));

// Jetton decimals (Minter default is 9). Override with JETTON_DECIMALS env if you deployed with another value.
const DECIMALS = Math.max(0, Math.min(18, Math.floor(Number(process.env.JETTON_DECIMALS)) || 9));
export const pow10 = () => 10n ** BigInt(DECIMALS);

const cache = new Map();

// Returns { ok, configured, units (bigint, never send it in JSON), tokens (number), error }
export async function readHolding(cfg, owner, fresh = false) {
  const master = String(cfg.jetton || '').trim();
  const fail = (error, configured = true) => ({ ok: false, configured, units: 0n, tokens: 0, error });
  if (!master) return fail('Token is not configured yet', false);
  if (!validMaster(master)) return fail(`Jetton master is not a valid ${net()} address`);
  if (!owner) return { ok: true, configured: true, units: 0n, tokens: 0 };

  const key = `${master}|${owner}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 20000) return hit.v;
  try {
    const url = `${base()}/api/v3/jetton/wallets?owner_address=${encodeURIComponent(owner)}&jetton_address=${encodeURIComponent(master)}&limit=5&offset=0`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error('http ' + res.status);
    const j = await res.json();
    let units = 0n;
    for (const w of j.jetton_wallets || []) units += BigInt(w.balance || '0');
    const v = { ok: true, configured: true, units, tokens: Number((units * 100n) / pow10()) / 100 };
    cache.set(key, { at: Date.now(), v });
    return v;
  } catch {
    return fail('Could not read the blockchain. Try again in a moment.');
  }
}

const tonCache = new Map();

// TON balance of an address in TON (3 decimals). Returns 0 if it cannot be read.
export async function readTonBalance(owner) {
  if (!owner) return 0;
  const hit = tonCache.get(owner);
  if (hit && Date.now() - hit.at < 20000) return hit.v;
  try {
    const res = await fetch(`${base()}/api/v2/getAddressBalance?address=${encodeURIComponent(owner)}`, { headers: headers() });
    const j = await res.json();
    if (!j || !j.ok) throw new Error('bad response');
    const v = Number(BigInt(j.result) / 1000000n) / 1000;
    tonCache.set(owner, { at: Date.now(), v });
    return v;
  } catch {
    return 0;
  }
}
