import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import TaskCard from '../components/TaskCard.jsx';
import { api } from '../services/api';
import { useApp } from '../store.jsx';

const TABS = [['in_game', 'In-game'], ['partners', 'Partners'], ['invite', 'Invite Quest']];

export default function Earn() {
  const { refresh, toast } = useApp();
  const [tab, setTab] = useState('in_game');
  const [tasks, setTasks] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = () => api.tasks().then((r) => setTasks(r.items)).catch((e) => toast(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line

  const start = async (t) => {
    setBusy(t.task_id);
    try {
      const r = await api.startTask(t.task_id);
      if (r.link) (r.link.startsWith('https://t.me') ? WebApp.openTelegramLink(r.link) : WebApp.openLink(r.link));
      await load();
    } catch (e) { toast(e.message); }
    setBusy(null);
  };
  const check = async (t) => {
    setBusy(t.task_id);
    try {
      const r = await api.completeTask(t.task_id); // backend verifies; rewards once
      toast(r.status === 'completed' ? `+${r.reward} PAWS` : 'Submitted for review');
      await load(); refresh();
    } catch (e) { toast(e.message); }
    setBusy(null);
  };

  const shown = (tasks || []).filter((t) => t.category === tab);
  return (
    <div className="stack gap-lg">
      <div className="center"><h1 className="h1">TASKS</h1><p className="muted small">GET REWARDS FOR COMPLETING QUESTS.</p></div>
      <div className="tabs">{TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
      {!tasks && <p className="muted center">Loading…</p>}
      {tasks && shown.length === 0 && <p className="muted center">No tasks here yet.</p>}
      {shown.map((t) => <TaskCard key={t.task_id} task={t} busy={busy === t.task_id} onStart={start} onCheck={check} />)}
    </div>
  );
}
