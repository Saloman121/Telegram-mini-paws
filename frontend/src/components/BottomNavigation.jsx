import { House, Users, ClipboardList, Wallet } from 'lucide-react';
const TABS = [
  { id: 'home', label: 'Home', Icon: House },
  { id: 'friends', label: 'Friends', Icon: Users },
  { id: 'earn', label: 'Earn', Icon: ClipboardList },
  { id: 'wallet', label: 'Wallet', Icon: Wallet },
];
export default function BottomNavigation({ tab, onChange }) {
  return (
    <nav className="bottom-nav">
      {TABS.map(({ id, label, Icon }) => (
        <button key={id} className={`nav-btn ${tab === id ? 'active' : ''}`} onClick={() => onChange(id)}>
          <Icon size={22} /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
