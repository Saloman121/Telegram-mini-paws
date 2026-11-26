// Shared rules: level table (Firestore config/levels) and withdrawal eligibility
export const defaultLevels = () =>
  Array.from({ length: 50 }, (_, i) => ({
    level: i + 1, max_taps: (i + 1) * 500, required_holding: i === 0 ? 0 : (i + 1) * 1000,
  }));

let cache = { at: 0, v: null };
export const resetLevelsCache = () => { cache = { at: 0, v: null }; };

export async function loadLevels(db, fresh = false) {
  if (!fresh && cache.v && Date.now() - cache.at < 30000) return cache.v;
  const s = await db.collection('config').doc('levels').get();
  const arr = s.exists && Array.isArray(s.data().levels) && s.data().levels.length ? s.data().levels : defaultLevels();
  cache = { at: Date.now(), v: arr };
  return arr;
}

// Level n from the table (users above the last level use the last one)
export const levelOf = (levels, n) => levels[Math.min(Math.max(1, Number(n) || 1), levels.length) - 1];

export async function checkEligibility(db, id, u, cfg) {
  const reasons = [];
  if (u.blocked) reasons.push('Account blocked');
  if (cfg.wd_walletverified && !(u.wallet && u.walletVerified)) reasons.push('Wallet not verified');
  if ((u.balance || 0) < cfg.wd_minpts) reasons.push(`Needs ${cfg.wd_minpts} points`);
  if ((u.level || 1) < cfg.wd_minlevel) reasons.push(`Needs level ${cfg.wd_minlevel}`);
  if (cfg.wd_minage > 0) {
    const created = u.createdAt?.toMillis?.() ?? 0;
    if ((Date.now() - created) / 86400000 < cfg.wd_minage) reasons.push(`Account must be ${cfg.wd_minage} days old`);
  }
  let tasks = null;
  let refs = null;
  if (cfg.wd_mintasks > 0) {
    tasks = (await db.collection('users').doc(String(id)).collection('tasks').where('completed', '==', true).count().get()).data().count;
    if (tasks < cfg.wd_mintasks) reasons.push(`Needs ${cfg.wd_mintasks} completed tasks (has ${tasks})`);
  }
  if (cfg.wd_minrefs > 0) {
    refs = (await db.collection('users').where('referredBy', '==', String(id)).where('walletVerified', '==', true).count().get()).data().count;
    if (refs < cfg.wd_minrefs) reasons.push(`Needs ${cfg.wd_minrefs} verified referrals (has ${refs})`);
  }
  return { ok: reasons.length === 0, reasons, tasks, refs };
}
