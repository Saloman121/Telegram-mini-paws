import { OnePrint, Coins, Map } from 'lucide-react';
export default function Header({ onBuy, onMap }) {
  return (
    <header className="header">
      <div className="row"><span className="logo-dot"><Oneprint size={18} /></span><b className="brand">OneGram</b></div>
      <div className="row">
        <button className="btn sm" onClick={onBuy}><Coins size={14} /> Buy Token</button>
        <button className="btn sm ghost" onClick={onMap}><Map size={14} /> Leaderboard</button>
      </div>
    </header>
  );
}
