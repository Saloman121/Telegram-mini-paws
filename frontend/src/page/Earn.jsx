import { useEffect, useState } from 'react';
import api from '../lib/api';
import TaskCard from '../components/TaskCard';

const TABS = ['In-game', 'Partners', 'Invite Quest'];

export default function Earn() {
  const [tasks, setTasks] = useState([]);
  const [tab, setTab] = useState('In-game');

  useEffect(() => { api.get('/tasks').then(({ data }) => setTasks(data)); }, []);

  const filtered = tasks.filter((t) => t.type === tab);
  const start = (id) => api.post('/task/start', { taskId: id }).then(() => reload());
  const verify = (id) => api.post('/task/verify', { taskId: id }).then(() => reload());
  const reload = () => api.get('/tasks').then(({ data }) => setTasks(data));

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ margin: '8px 0', fontSize: 22 }}>TASKS</h1>
      <p style={{ color: 'var(--muted)', margin: 0, fontSize: 12 }}>GET REWARDS FOR COMPLETING QUESTS</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: t === tab ? '#fff' : 'var(--card)',
            color: t === tab ? '#000' : '#fff',
            padding: '8px 14px', borderRadius: 999, fontWeight: 700, whiteSpace: 'nowrap',
          }}>{t}</button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        {filtered.map((task) => (
          <TaskCard key={task.id} task={task}
            onStart={() => start(task.id)} onVerify={() => verify(task.id)}
            claimed={task.claimed} />
        ))}
      </div>
    </div>
  );
}
