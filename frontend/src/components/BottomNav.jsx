import { NavLink } from 'react-router-dom';
import { House, Users, Clipboard, Wallet } from 'lucide-react';

const items = [
  { to: '/', icon: House, label: 'Home' },
  { to: '/friends', icon: Users, label: 'Friends' },
  { to: '/earn', icon: Clipboard, label: 'Earn' },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
];

export default function BottomNav() {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: 64,
      background: 'rgba(15,15,15,.85)', backdropFilter: 'blur(16px)',
      display: 'flex', borderTop: '1px solid #222', maxWidth: 480, margin: '0 auto', zIndex: 50,
    }}>
      {items.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end style={({ isActive }) => ({
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 2, textDecoration: 'none',
          color: isActive ? 'var(--accent)' : 'var(--muted)', fontSize: 11, fontWeight: 600,
        })}>
          <Icon size={22} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
      }
