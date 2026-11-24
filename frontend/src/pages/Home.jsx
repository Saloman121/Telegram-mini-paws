import { useEffect, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { Users, Gift } from 'lucide-react';
import Header from '../components/Header.jsx';
import TapButton from '../components/TapButton.jsx';
import BalanceCard from '../components/BalanceCard.jsx';
import AutoTapCard from '../components/AutoTapCard.jsx';
import LevelModal from '../components/LevelModal.jsx';
import BuyTokenModal from '../components/BuyTokenModal.jsx';
import { useApp } from '../store.jsx';
import { api } from '../services/api';

export default function Home({ goLeaderboard }) {
  const { profile, refresh, toast } = useApp();
  const m = profile.mining;
  const [bal, setBal] = useState(profile.points);
  const [energy, setEnergy] = useState(m.energy);
  const [modal, setModal] = useState(null);
  const pending = useRef(0);
  const sending = useRef(false);

  // Server is the source of truth: re-sync whenever the profile reloads.
  useEffect(() => { setBal(profile.points); setEnergy(m.energy); }, [profile.points, m.energy]);

  const flush = async () => {
    if (sending.current || pending.current === 0) return;
    sending.current = true;
    const count = pending.current; pending.current = 0;
    try {
      const r = await api.tap(count);
      // keep taps made while the request was in flight
      setBal(r.points + pending.current * m.per_tap);
      setEnergy(r.energy - pending.current);
    } catch (e) { toast(e.message); pending.current = 0; refresh(); }
    sending.current = false;
  };
  useEffect(() => { const t = setInterval(flush, 1000); return () => clearInterval(t); }, [m.per_tap]); // eslint-disable-line

  const onTap = () => {
    if (energy <= 0) return;
    pending.current += 1; // optimistic UI only; server validates and credits
    setBal((b) => b + m.per_tap); setEnergy((e) => e - 1);
    try { WebApp.HapticFeedback.impactOccurred('light'); } catch { /* no haptics */ }
  };

  const links = profile.config.links || {};
  const open = (url) => url && (url.startsWith('https://t.me') ? WebApp.openTelegramLink(url) : WebApp.openLink(url));

  return (
    <div className="stack gap-lg">
      <Header onBuy={() => setModal('buy')} onMap={goLeaderboard} />
      <TapButton disabled={energy <= 0} perTap={m.per_tap} onTap={onTap} />
      <BalanceCard balance={bal} rankTitle={profile.rank_title} level={profile.level} maxLevel={profile.config.max_level}
        energy={Math.max(0, energy)} maxEnergy={m.max_energy} perTap={m.per_tap} onUpgrade={() => setModal('level')} />
      <AutoTapCard />
      <div className="grid2">
        <button className="btn ghost" onClick={() => open(links.community)}><Users size={16} /> Join our community</button>
        <button className="btn ghost" onClick={() => open(links.rewards)}><Gift size={16} /> Check your rewards</button>
      </div>
      {modal === 'level' && <LevelModal onClose={() => setModal(null)} />}
      {modal === 'buy' && <BuyTokenModal onClose={() => setModal(null)} />}
    </div>
  );
}
