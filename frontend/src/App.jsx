import { useState } from 'react';
import { AppProvider, useApp } from './store.jsx';
import { useWalletSync } from './services/tonconnect';
import BottomNavigation from './components/BottomNavigation.jsx';
import Home from './pages/Home.jsx';
import Friends from './pages/Friends.jsx';
import Earn from './pages/Earn.jsx';
import Wallet from './pages/Wallet.jsx';
import Leaderboard from './pages/Leaderboard.jsx';

function Shell() {
  const [tab, setTab] = useState('home');
  const { profile, error, refresh, toastMsg } = useApp();
  useWalletSync(refresh);

  if (!profile) {
    return (
      <div className="center-screen">
        <img src="/paws-logo.png" className="boot-logo" alt="" />
        {error ? <><p className="err">{error}</p><button className="btn" onClick={() => location.reload()}>Retry</button></> : <p className="muted">Loading…</p>}
      </div>
    );
  }
  if (profile.blocked) return <div className="center-screen"><p className="err">This account is blocked.</p></div>;

  return (
    <div className="app">
      <div className="page">
        {tab === 'home' && <Home goLeaderboard={() => setTab('leaderboard')} />}
        {tab === 'friends' && <Friends />}
        {tab === 'earn' && <Earn />}
        {tab === 'wallet' && <Wallet />}
        {tab === 'leaderboard' && <Leaderboard back={() => setTab('home')} />}
      </div>
      <BottomNavigation tab={tab === 'leaderboard' ? 'home' : tab} onChange={setTab} />
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}

export default function App() { return <AppProvider><Shell /></AppProvider>; }
