import { ShoppingCart } from 'lucide-react';

export default function Header({ user, onBuy }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'linear-gradient(135deg,#0088ff,#00c2ff)',
          display: 'grid', placeItems: 'center', fontWeight: 800,
        }}>
          {user?.first_name?.[0] || 'P'}
        </div>
        <div>
          <div style={{ fontWeight: 700 }}>{user?.first_name || 'Player'}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Level {user?.level || 1} ⚡</div>
        </div>
      </div>
      <button onClick={onBuy} style={{
        background: 'var(--card)', border: '1px solid #333', borderRadius: 12,
        padding: 10, color: '#fff', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <ShoppingCart size={18} /> Buy
      </button>
    </header>
  );
      }
