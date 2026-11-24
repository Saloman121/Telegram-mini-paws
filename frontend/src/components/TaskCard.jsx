import { Check, Clock } from 'lucide-react';
import { fmt } from '../services/format';
export default function TaskCard({ task, busy, onStart, onCheck }) {
  const s = task.status; // idle | started | pending_review | completed | rejected
  return (
    <div className="card task">
      <span className="task-icon">{task.icon || '🐾'}</span>
      <div className="grow"><b>{task.title}</b><div className="small blue-txt">+{fmt(task.reward)} PAWS</div></div>
      {s === 'completed' ? <span className="pill ok"><Check size={14} /> Done</span>
        : s === 'pending_review' ? <span className="pill warn"><Clock size={14} /> In review</span>
        : s === 'started' ? <button className="btn sm" disabled={busy} onClick={() => onCheck(task)}>{busy ? '…' : 'Check'}</button>
        : <button className="btn sm" disabled={busy} onClick={() => onStart(task)}>{s === 'rejected' ? 'Retry' : 'Start'}</button>}
    </div>
  );
}
