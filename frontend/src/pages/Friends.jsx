import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { PawPrint, UserPlus } from 'lucide-react';
import { api } from '../services/api';
import { useApp } from '../store.jsx';
import { fmt } from '../services/format';

export default function Friends() {
  const { profile, toast } = useApp();
  const [stats, setStats] = useState(null);
  const [list, setList] = useState([]);
  useEffect(() => {
    api.referralStats().then(setStats).catch((e) => toast(e.message));
    api.referrals().then((r) => setList(r.items)).catch(() => {});
  }, []); // eslint-disable-line

  const bot = import.meta.env.VITE_BOT_USERNAME;
  const link = profile.referral_link || (bot ? `https://t.me/${bot}?startapp=${profile.referral_code}` : '');
  const share = () => {
    if (!link) return toast('Referral link not configured');
    WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join me on $PAWS and start earning!')}`);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { toast(link); } };

  return (
    <div className="stack gap-lg">
      <div className="center"><h1 className="h1">INVITE FRIENDS</h1><p className="muted small">SHARE YOUR INVITATION LINK &amp; GET {profile.config.referral_percent}% OF FRIEND'S POINTS.</p></div>
      <div className="paws-pair"><PawPrint size={44} className="blue-txt" /><PawPrint size={44} className="blue-txt flip" /></div>
      {stats && (
        <div className="grid3">
          <div className="card center"><b>{fmt(stats.total_invited)}</b><div className="small muted">Invited</div></div>
          <div className="card center"><b>{fmt(stats.verified)}</b><div className="small muted">Verified</div></div>
          <div className="card center"><b className="blue-txt">{fmt(stats.earnings)}</b><div className="small muted">Earned</div></div>
        </div>
      )}
      <div className="card stack">
        {list.length === 0 ? <div className="center muted small pad">No friends yet. Invite someone to start earning.</div>
          : list.map((f) => <div key={f.id} className="between"><span>{f.name}</span><span className="small muted">{f.verified ? 'Verified' : 'Unverified'}</span></div>)}
      </div>
      <div className="mono small card break">{link || '—'}</div>
      <button className="btn full lg" onClick={share}><UserPlus size={18} /> Invite</button>
      <button className="btn full ghost" onClick={copy}>Copy link</button>
    </div>
  );
}
