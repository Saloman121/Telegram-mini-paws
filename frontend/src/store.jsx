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

  return <Ctx.Provider value={{ profile, error, refresh, toast, toastMsg }}>{children}</Ctx.Provider>;
}
