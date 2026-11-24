import { useEffect, useState } from 'react';
import { Trophy, ChevronLeft, User } from 'lucide-react';
import { api } from '../services/api';
import { useApp } from '../store.jsx';
import { fmt } from '../services/format';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function Leaderboard({ back }) {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const load = async (c) => {
    try { const r = await api.leaderboard(c); setD(r); setItems((p) => [...p, ...r.items]); setCursor(r.next_cursor); }
    catch (e) { toast(e.message); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const Row = ({ u }) => (
    <div className={`card row lb ${u.me ? 'me' : ''}`}>
      <span className="rank">{MEDAL[u.rank - 1] || `#${u.rank}`}</span>
      <span className="logo-dot"><User size={16} /></span>
      <b className="grow">{u.username}</b><span className="mono blue-txt">{fmt(u.points)}</span>
    </div>
  );

  return (
    <div className="stack gap-lg">
      <button className="link row" onClick={back}><ChevronLeft size={18} /> Back</button>
      <div className="center"><Trophy size={40} className="gold" /><h1 className="h1">LEADERBOARD</h1>
        {d && <p className="muted small">{fmt(d.total_users)} registered users</p>}</div>
      {d?.me && <Row u={{ ...d.me, me: true }} />}
      {items.map((u) => <Row key={u.rank} u={u} />)}
      {cursor && <button className="btn full ghost" onClick={() => load(cursor)}>Load more</button>}
    </div>
  );
}
