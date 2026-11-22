import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Users, Star, Zap } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import Header from '../components/Header.jsx';
import TapButton from '../components/TapButton.jsx';
import VerifyWalletBanner from '../components/VerifyWalletBanner.jsx';
import LevelModal from '../components/LevelModal.jsx';
import BuyModal from '../components/BuyModal.jsx';
import { useUser, userStore } from '../hooks/useUser.js';
import { api } from '../lib/api.js';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { sendTon, submitWithRetry, errText, FEE_TON } from '../lib/tonconnect.js';

// Roll-up counter: eases from the previously shown value to the new one.
function RollNumber({ value }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now(), a = from.current, b = value;
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - start) / 250);
      setShown(Math.round(a + (b - a) * p));
      if (p < 1) raf = requestAnimationFrame(step); else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown.toLocaleString()}</>;
}

export default function Home() {
  const { user } = useUser();
  const [modal, setModal] = useState(null); // 'level' | 'buy'
  const [ui] = useTonConnectUI();

  // Energy regen: +1 every 3s (server recomputes the real value on each tap).
  useEffect(() => {
    const id = setInterval(() => {
      const u = userStore.get().user;
      if (u.tap_energy < u.max_energy) userStore.patch({ tap_energy: u.tap_energy + 1 });
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const enableAutoTap = async () => {
    try {
      const boc = await sendTon(ui, 0.05); // one-time fee
      await submitWithRetry(() => api.autoTapEnable(boc));
      await userStore.refresh();
    } catch (e) { WebApp.showAlert(errText(e)); }
  };

  return (
    <>
      <Header onBuy={() => setModal('buy')} />
      <VerifyWalletBanner />
      <div className="balance"><RollNumber value={Math.floor(user.points)} /></div>
      <div className="balance-label">$PAWS</div>

      <TapButton />

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn ghost" onClick={() => setModal('level')}>Level {user.level} <ChevronRight size={14} style={{ verticalAlign: -2 }} /></button>
        <span><Zap size={14} style={{ verticalAlign: -2 }} /> {user.tap_energy} / {user.max_energy}</span>
      </div>
      <div className="energy"><i style={{ width: `${(user.tap_energy / user.max_energy) * 100}%` }} /></div>

      {!user.auto_tap_enabled && (
        <button className="btn ghost block" style={{ marginTop: 8 }} onClick={enableAutoTap}>Enable Auto-Tap (0.05 TON, one-time)</button>
      )}

      <div className="grid2">
        <div className="card" onClick={() => WebApp.openTelegramLink?.('https://t.me/' + (import.meta.env.VITE_BOT_USERNAME || ''))}>
          <Users size={20} /><div style={{ marginTop: 6 }}>Join our community</div>
        </div>
        <div className="card"><Star size={20} /><div style={{ marginTop: 6 }}>Check your rewards</div></div>
      </div>

      {modal === 'level' && <LevelModal onClose={() => setModal(null)} />}
      {modal === 'buy' && <BuyModal onClose={() => setModal(null)} />}
    </>
  );
}
