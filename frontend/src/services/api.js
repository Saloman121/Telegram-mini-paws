import WebApp from '@twa-dev/sdk';

const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

// Every request carries Telegram's signed initData. The SERVER validates the
// HMAC signature + auth_date; the frontend never supplies user identity or balances.
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `tma ${WebApp.initData}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

export const api = {
  auth: () => request('/auth/telegram', { method: 'POST', body: { initData: WebApp.initData } }),
  profile: () => request('/user/profile'),
  balance: () => request('/user/balance'),
  level: () => request('/user/level'),
  upgradeLevel: (level) => request('/user/level/upgrade', { method: 'POST', body: { level } }),

  tap: (count) => request('/mining/tap', { method: 'POST', body: { count } }),
  miningStatus: () => request('/mining/status'),
  claim: () => request('/mining/claim', { method: 'POST' }),

  referrals: (cursor) => request(`/referrals${cursor ? `?cursor=${cursor}` : ''}`),
  referralStats: () => request('/referrals/stats'),
  processReferral: (code) => request('/referrals/process', { method: 'POST', body: { code } }),

  tasks: () => request('/tasks'),
  startTask: (task_id) => request('/tasks/start', { method: 'POST', body: { task_id } }),
  completeTask: (task_id) => request('/tasks/complete', { method: 'POST', body: { task_id } }),

  proofPayload: () => request('/wallet/proof-payload'),
  walletConnect: (payload) => request('/wallet/connect', { method: 'POST', body: payload }),
  walletStatus: () => request('/wallet/status'),

  // Server builds the transfer (address, amount, payload) so the client cannot alter it.
  paymentIntent: (body) => request('/ton/payment/intent', { method: 'POST', body }),
  paymentVerify: (body) => request('/ton/payment/verify', { method: 'POST', body }),
  paymentStatus: (id) => request(`/ton/payment/status?intent_id=${encodeURIComponent(id)}`),

  withdraw: (amount) => request('/withdrawals/request', { method: 'POST', body: { amount } }),
  withdrawals: () => request('/withdrawals/history'),

  leaderboard: (cursor) => request(`/leaderboard${cursor ? `?cursor=${cursor}` : ''}`),
};
