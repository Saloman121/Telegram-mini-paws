import { useState } from 'react';
import Header from '../components/Header';
import TapButton from '../components/TapButton';
import VerifyWalletBanner from '../components/VerifyWalletBanner';
import { useUser } from '../hooks/useUser';
import { useTelegram } from '../hooks/useTelegram';
import { useWallet } from '../lib/tonconnect';
import api from '../lib/api';
import { ChevronRight } from 'lucide-react';

export default function Home() {
  const { user, setUser, refresh } = useUser();
  const { hapticNotif } = useTelegram();
  const { tonConnectUI } = useWallet();
  const [taps, setTaps] = useState([]);

  if (!user) return <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div>;

  const tap = async () => {
    if (user.tap_energy <= 0) return;
    const next = {
      ...user,
      points: user.points + user.tap_reward,
      tap_energy: user.tap_energy - 1,
    };
    setUser(next);
    setTaps((t) => [...t, Date.now()]);
    // Batch to server every 10 taps
    if (taps.length >= 9) {
      try { await api.post('/tap', { taps: 10 }); } catch {}
      setTaps([]);
    }
  };

  const enableAutoTap = async () => {
    try {
      // In production: trigger TON 0.05 transfer via tonConnectUI then call /auto-tap/enable with tx hash
      hapticNotif('warning');
      alert('Auto-Tap requires 0.05 TON — implement transfer via tonConnectUI.sendTransaction');
    } catch (e) { console.error(e); }
  };

  const verifyWallet = async () => {
    // In production: trigger 0.15 TON transfer via tonConnectUI, then POST /wallet/verify
    alert('Send 0.15 TON to admin wallet, then call /wallet/verify with tx_hash');
  };

  return (
    <>
      <Header user={user} onBuy={() => alert('Buy modal')} />
      {!user.wallet_verified && <VerifyWalletBanner onVerify={verifyWallet} />}
      <div style={{ textAlign: 'center', padding: '0 16px' }}>
        <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -2 }}>
          {user.points.toLocaleString()}
        </div>
        <div style={{ color: 'var(--muted)', fontWeight: 600 }}>$PAWS</div>
      </div>
      <TapButton onTap={tap} disabled={user.tap_energy <= 0} />
      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
          <span>⚡ {user.tap_energy}/{user.max_energy}</span>
          <button onClick={enableAutoTap} style={{ background: 'none', color: 'var(--accent)', fontWeight: 600 }}>
            Enable Auto-Tap (0.05 TON)
          </button>
        </div>
        <div style={{ height: 8, background: '#222', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${(user.tap_energy / user.max_energy) * 100}%`, height: '100%',
            background: 'linear-gradient(90deg,#0088ff,#00c2ff)' }} />
        </div>
        <div className="card" style={{ marginTop: 16, display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Level {user.level} ⚡</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Tap to level up</div>
          </div>
          <ChevronRight color="#666" />
        </div>
      </div>
    </>
  );
}
