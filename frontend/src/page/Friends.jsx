import { useEffect, useState } from 'react';
import api from '../lib/api';
import WebApp from '@twa-dev/sdk';
import { useUser } from '../hooks/useUser';

export default function Friends() {
  const { user } = useUser();
  const [stats, setStats] = useState({ invited: 0, verified: 0, earned: 0, pending: 0 });
  const [friends, setFriends] = useState([]);

  useEffect(() => {
    if (!user) return;
    api.get('/referral/stats').then(({ data }) => setStats(data));
    api.get('/referral/friends').then(({ data }) => setFriends(data));
  }, [user]);

  const invite = () => {
    const link = `https://t.me/PAWSBot?start=ref_${user.id}`;
    WebApp.openTelegramLink(link);
  };

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ margin: '8px 0', fontSize: 22 }}>INVITE FRIENDS</h1>
      <p style={{ color: 'var(--muted)', margin: 0, fontSize: 12 }}>
        SHARE YOUR INVITATION LINK & GET 10% OF FRIEND'S POINTS
      </p>
      <div className="card" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center' }}>
        <div><div style={{ fontSize: 22, fontWeight: 800 }}>{stats.invited}</div>
          <div style={{ color: 'var(--muted)', fontSize: 11 }}>Invited</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800 }}>{stats.verified}</div>
          <div style={{ color: 'var(--muted)', fontSize: 11 }}>Verified</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800 }}>{stats.earned.toLocaleString()}</div>
          <div style={{ color: 'var(--muted)', fontSize: 11 }}>Earned</div></div>
      </div>
      {stats.pending > 0 && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: '#332411', color: '#ffb84d', fontSize: 13 }}>
          ⚠️ {stats.pending} friends haven't verified — they must pay 0.15 TON to activate your 10%
        </div>
      )}
      <button className="btn-primary" onClick={invite}
        style={{ width: '100%', marginTop: 16, padding: 14 }}>
        Invite a friend
      </button>
      <div style={{ marginTop: 24 }}>
        {friends.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
            There is nothing else. Invite to get more rewards.
          </p>
        ) : friends.map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
            padding: 12, background: 'var(--card)', borderRadius: 12, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#0088ff',
              display: 'grid', placeItems: 'center', fontWeight: 700 }}>{f.first_name?.[0] || '?'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{f.first_name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {f.wallet_verified ? '✅ Verified' : '⏳ Pending'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>+10%</div>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{f.contribution}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
    }
