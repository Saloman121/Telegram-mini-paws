import { useEffect, useState } from 'react';
import { Lock, Check } from 'lucide-react';
import Modal from './Modal.jsx';
import { api } from '../services/api';
import { fmt } from '../services/format';
import { useApp } from '../store.jsx';

export default function LevelModal({ onClose }) {
  const { refresh, toast, profile } = useApp();
  const symbol = profile.config?.symbol || 'PAWS';
  const hours = profile.config?.session_hours ?? 2;
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.level().then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const upgrade = async (level) => {
    setBusy(true);
    try { await api.upgradeLevel(level); toast(`Level ${level} unlocked!`); await refresh(); await load(); }
    catch (e) { toast(e.message); } // server rechecks on-chain holding before unlocking
    setBusy(false);
  };

  return (
    <Modal title="Mining Levels" onClose={onClose}>
      {err && <p className="err">{err}</p>}
      {!d && !err && <p className="muted">Loading…</p>}
      {d && (
        <div className="stack scroll">
          <p className="small muted">Verified {symbol} holding: <b className="mono">{fmt(d.jetton_balance)}</b>. Holding is rechecked on-chain before an upgrade.</p>
          {d.levels.map((l) => (
            <div key={l.level} className={`card level ${l.level === d.current ? 'cur' : ''}`}>
              <div className="grow"><b>Level {l.level}</b><div className="small muted">{fmt(l.max_taps)} taps / {hours}h • {l.required_holding ? `${fmt(l.required_holding)} ${symbol}` : 'Free'}</div></div>
              {l.unlocked ? <span className="pill ok"><Check size={14} /></span>
                : l.level === d.current + 1 ? <button className="btn sm" disabled={busy} onClick={() => upgrade(l.level)}>Upgrade</button>
                : <Lock size={16} className="muted" />}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
