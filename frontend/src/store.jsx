import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { api } from './services/api';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [toastMsg, setToast] = useState(null);

  const refresh = useCallback(async () => {
    try { setProfile(await api.profile()); setError(null); }
    catch (e) { setError(e.message); }
  }, []);

  const toast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); }, []);

  // Pulls admin-controlled settings (name, symbol, fees, session hours, per-tap, level limits, block status)
  // without touching points/energy, so taps in progress never jump.
  const syncConfig = useCallback(async () => {
    try {
      const c = await api.appConfig();
      setProfile((p) => p && ({
        ...p,
        level: c.level, rank_title: c.rank_title, blocked: c.blocked, config: c.config,
        mining: { ...p.mining, per_tap: c.per_tap, max_energy: c.max_energy },
      }));
    } catch { /* ignore, the next poll retries */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await api.auth(); // server validates initData and creates the user on first visit
        const start = WebApp.initDataUnsafe?.start_param;
        if (start) await api.processReferral(start).catch(() => {}); // server validates; idempotent
        await refresh();
      } catch (e) { setError(e.message); }
    })();
  }, [refresh]);

  // Live settings: every 60s while the app is visible, and when the user comes back to it
  useEffect(() => {
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - last < 15000) return;
      last = Date.now();
      syncConfig();
    };
    const t = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [syncConfig]);

  return <Ctx.Provider value={{ profile, error, refresh, toast, toastMsg }}>{children}</Ctx.Provider>;
}
