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
import { fmt } from '../services/format';

export default function Home({ goLeaderboard }) {
  const { profile, refresh, toast } = useApp();
  // Safe defaults: the page never crashes even if the server omits a field
  const m = profile.mining || { energy: 0, max_energy: 500, per_tap: 1 };
  const cfg = profile.config || { max_level: 50, links: {} };
  const mode = cfg.mining_mode === 'manual' ? 'manual' : 'session';
  const symbol = cfg.symbol || 'PAWS';
  const hours = cfg.session_hours ?? 2;

  const [bal, setBal] = useState(profile.points ?? 0);
  const [energy, setEnergy] = useState(m.energy ?? 0);
  const [modal, setModal] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [skew, setSkew] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(0);
  const sending = useRef(false);

  // Server is the source of truth: re-sync whenever the profile reloads.
  useEffect(() => { setBal(profile.points ?? 0); setEnergy(m.energy ?? 0); }, [profile.points, m.energy]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // Use the server's clock so the countdown matches what the server enforces
  useEffect(() => { if (m.server_time) setSkew(m.server_time - Date.now()); }, [m.server_time]);

  // ---------- Manual tap mode ----------
  const flush = async () => {
    if (mode !== 'manual' || sending.current || pending.current === 0) return;
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
  useEffect(() => { const t = setInterval(flush, 1000); return () => clearInterval(t); }, [m.per_tap, mode]); // eslint-disable-line

  const onTap = () => {
    if (energy <= 0) return;
    pending.current += 1; // optimistic UI only; server validates and credits
    setBal((b) => b + m.per_tap); setEnergy((e) => e - 1);
    try { WebApp.HapticFeedback.impactOccurred('light'); } catch { /* no haptics */ }
  };

  // ---------- Session mode: tap the logo to start, tap it again to claim ----------
  const t = now + skew;
  const start = m.mine_start || 0;
  const end = m.mine_end || 0;
  const running = start > 0 && t < end;
  const ready = start > 0 && t >= end;
  const reward = start > 0 ? (m.mine_reward || 0) : (m.max_energy || 0) * (m.per_tap || 1);
  const frac = start > 0 ? Math.min(1, Math.max(0, (t - start) / Math.max(1, end - start))) : 0;
  const doneTaps = Math.floor(frac * (m.max_energy || 0));
  const left = Math.max(0, end - t);
  const timeTxt = `${Math.floor(left / 3600000)}h ${Math.floor((left % 3600000) / 60000)}m ${Math.floor((left % 60000) / 1000)}s`;

  const startMining = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.startMining();
      try { WebApp.HapticFeedback.impactOccurred('medium'); } catch { /* no haptics */ }
      await refresh();
      toast(`Mining started. Claim in ${hours}h`);
    } catch (e) { toast(e.message); }
    setBusy(false);
  };
  const collect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.collectMining();
      try { WebApp.HapticFeedback.notificationOccurred('success'); } catch { /* no haptics */ }
      toast(`Claimed ${fmt(r.claimed)} ${symbol}`);
      await refresh();
    } catch (e) { toast(e.message); }
    setBusy(false);
  };

  // One logo button: start -> (wait) -> claim
  let logo;
  if (mode === 'manual') {
    logo = { state: 'manual', label: 'TAP', sub: `+${m.per_tap} ${symbol} per tap`, onTap, disabled: energy <= 0 };
  } else if (start === 0) {
    logo = { state: 'idle', label: 'TAP TO START', sub: `Earn ${fmt(reward)} ${symbol} in ${hours}h`, onTap: startMining, disabled: busy };
  } else if (running) {
    logo = { state: 'running', label: timeTxt, sub: `Mining… ${fmt(reward)} ${symbol}`, onTap: () => toast(`Mining… ${timeTxt} left`), disabled: false };
  } else {
    logo = { state: 'ready', label: `CLAIM ${fmt(reward)} ${symbol}`, sub: 'Tap the logo to claim', onTap: collect, disabled: busy };
  }

  const links = cfg.links || {};
  const open = (url) => url && (url.startsWith('https://t.me') ? WebApp.openTelegramLink(url) : WebApp.openLink(url));

  return (
    <div className="stack gap-lg">
      <Header onBuy={() => setModal('buy')} onMap={goLeaderboard} />
      <TapButton
        state={logo.state}
        progress={frac}
        label={logo.label}
        sub={logo.sub}
        perTap={m.per_tap}
        disabled={logo.disabled}
        onTap={logo.onTap}
      />
      <BalanceCard balance={bal} rankTitle={profile.rank_title} level={profile.level} maxLevel={cfg.max_level}
        energy={mode === 'session' ? doneTaps : Math.max(0, energy)} maxEnergy={m.max_energy} perTap={m.per_tap} onUpgrade={() => setModal('level')} />
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
