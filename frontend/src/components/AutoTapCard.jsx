import { Bot } from 'lucide-react';
import PaymentButton from './PaymentButton.jsx';
import { useApp } from '../store.jsx';
import { fmt, fmtTon } from '../services/format';
import { api } from '../services/api';

export default function AutoTapCard() {
  const { profile, refresh, toast } = useApp();
  const m = profile.mining;
  const claim = async () => { try { const r = await api.claim(); toast(`Claimed ${fmt(r.claimed)} PAWS`); refresh(); } catch (e) { toast(e.message); } };
  return (
    <article className="card stack">
      <div className="row"><span className="task-icon"><Bot size={20} /></span>
        <div className="grow"><b>Auto Tap</b><div className="small muted">Mines for you using your level limits</div></div>
        {m.auto_tap_active && <span className="pill ok">Active</span>}
      </div>
      {m.auto_tap_active
        ? (m.auto_claimable > 0 ? <button className="btn full" onClick={claim}>Claim {fmt(m.auto_claimable)} PAWS</button> : <p className="small muted">Nothing to claim yet.</p>)
        : <PaymentButton purpose="auto_tap" label={`Activate • ${fmtTon(profile.config.auto_tap_fee_ton)} GRAM (one-time)`} onConfirmed={refresh} />}
    </article>
  );
}
