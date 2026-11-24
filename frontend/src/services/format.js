export const fmt = (n) => Number(n || 0).toLocaleString('en-US');
export const fmtTon = (n) => Number(n || 0).toFixed(2);
export const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
