import { Zap } from 'lucide-react';
import { fmt } from '../services/format';
export default function BalanceCard({ balance, rankTitle, level, maxLevel, energy, maxEnergy, perTap, onUpgrade }) {
  const pct = maxEnergy ? Math.max(0, Math.min(100, (energy / maxEnergy) * 100)) : 0;
  return (
    <>
      <div className="balance"><span className="display">{fmt(balance)}</span><span className="blue-txt">PAWS</span></div>
      <div className="row center">
        <span className="pill blue">✨ {rankTitle || 'NEWCOMER'} RANK</span>
        <span className="pill mono">LVL {level} / {maxLevel}</span>
      </div>
      <article className="card">
        <div className="between"><span className="row"><Zap size={18} className="blue-txt" /><b>Mining Session</b></span><span className="mono blue-txt">{fmt(energy)} / {fmt(maxEnergy)}</span></div>
        <div className="bar"><div style={{ width: `${pct}%` }} /></div>
        <div className="between small muted"><span>2h session • +{perTap} PAWS / tap</span><button className="link" onClick={onUpgrade}>Upgrade Level</button></div>
      </article>
    </>
  );
}
