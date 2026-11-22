import React,{useEffect,useMemo,useState} from 'react';
import { TonConnectButton, useTonWallet } from '@tonconnect/ui-react';
import { ArrowLeft, ArrowRight, Star, Users, Zap, Send, CheckCircle2, Clock3, Copy, ExternalLink, ShieldCheck, CircleDollarSign, Footprints } from 'lucide-react';
import BottomNav from './components/BottomNav.jsx';
import TopBanner from './components/TopBanner.jsx';
import PawLogo from './components/PawLogo.jsx';
import { initTelegram,getTelegramUser,haptic,inviteFriends } from './lib/telegram.js';

const initialTasks=[
 {id:'name',title:'Put 🐾 in your name',reward:5000,category:'In-game',icon:'🐾'},
 {id:'tweet',title:'Tweet about PAWS',reward:2000,category:'In-game',icon:'🐾'},
 {id:'boost',title:'Boost PAWS channel',reward:2500,category:'In-game',icon:'⚡'},
 {id:'follow',title:'Follow channel',reward:1000,category:'In-game',icon:'➤'},
 {id:'partner1',title:'Explore our partner',reward:1500,category:'Partners',icon:'🤝'}
];
export default function App(){
 const [tab,setTab]=useState('Home'),[page,setPage]=useState(''),[points,setPoints]=useState(4646),[level,setLevel]=useState(1),[energy,setEnergy]=useState(500),[done,setDone]=useState([]),[category,setCategory]=useState('In-game'),[tasks]=useState(initialTasks),[referrals]=useState(0),[toast,setToast]=useState(''),[history,setHistory]=useState([]),[walletVerified,setWalletVerified]=useState(false);
 const user=getTelegramUser(), wallet=useTonWallet();
 useEffect(()=>{initTelegram()},[]);
 const referralLink=useMemo(()=>`https://t.me/${import.meta.env.VITE_BOT_USERNAME||'YOUR_BOT_USERNAME'}?startapp=${user.id}`,[user.id]);
 function notify(message){setToast(message);setTimeout(()=>setToast(''),2600)}
 function go(name){setPage(name);haptic()}
 function tap(){if(energy<=0){notify('Energy is empty. Come back after recharge.');return;} setPoints(p=>p+1);setEnergy(e=>e-1);setHistory(h=>[{type:'Tap reward',amount:1,date:new Date().toLocaleTimeString()},...h].slice(0,10));haptic('light')}
 function claim(task){if(done.includes(task.id))return;setDone(d=>[...d,task.id]);setPoints(p=>p+task.reward);setHistory(h=>[{type:task.title,amount:task.reward,date:new Date().toLocaleTimeString()},...h].slice(0,10));notify(`+${task.reward.toLocaleString()} PAWS added`)}
 function copy(){navigator.clipboard?.writeText(referralLink);notify('Invitation link copied');}
 const header=<TopBanner onClick={()=>go('Footprint map')}/>;
 return <div className="app-shell">
  {header}
  {!page && tab==='Home' && <main className="screen home-screen">
   <div className="home-actions"><button className="buy-link" onClick={()=>go('Buy Token')}>＋ Buy Token</button><span className="home-spacer"/></div>
   <button className="connect-pill" onClick={()=>go('Wallet')}><span className="wallet-glyph">▣</span> Connect wallet</button>
   <button className="mining-core" onClick={tap} aria-label="Tap PAWS to earn"><PawLogo/><strong>{points.toLocaleString()}<small> PAWS</small></strong><span className="rank">NEWCOMER ✨ RANK <Chevron/></span></button>
   <div className="energy-card"><div><b>Energy</b><span>{energy}/{level*500}</span></div><div className="energy-track"><i style={{width:`${energy/(level*500)*100}%`}}/></div><small>Recharge cycle: 2 hours</small></div>
   <button className="wide-row" onClick={()=>window.open(import.meta.env.VITE_COMMUNITY_URL||'https://t.me/','_blank')}><Users/>Join our community <Chevron/></button>
   <button className="wide-row" onClick={()=>go('Rewards')}><Star fill="currentColor"/>Check your rewards <Chevron/></button>
   <div className="level-strip"><span>LEVEL {level}</span><span>Tap capacity: {level*500}</span><button onClick={()=>go('Levels')}>Upgrade <ArrowRight size={16}/></button></div>
  </main>}
  {!page && tab==='Friends' && <main className="screen friends-screen"><h1>INVITE FRIENDS</h1><p className="lead"><b>SHARE</b> YOUR INVITATION<br/> LINK &amp; <b>GET 10%</b> OF<br/> FRIEND'S POINTS</p><div className="invite-card"><div className="paw-pair"><PawLogo/><PawLogo/></div><p>There is nothing else.<br/>Invite to get more rewards.</p><small>{referrals} invited friends</small></div><button className="primary full" onClick={()=>inviteFriends(referralLink)}>Invite</button><button className="outline full" onClick={copy}><Copy size={18}/> Copy invitation link</button></main>}
  {!page && tab==='Earn' && <main className="screen tasks-screen"><h1>TASKS</h1><p className="lead"><b>GET REWARDS</b> FOR<br/> COMPLETING QUESTS</p><div className="segmented">{['In-game','Partners','Invite Quest'].map(c=><button className={category===c?'selected':''} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="task-list">{tasks.filter(t=>t.category===category).map(t=><div className="task-row" key={t.id}><div className="task-icon">{t.icon}</div><div className="task-info"><b>{t.title}</b><span>+ {t.reward.toLocaleString()} PAWS</span></div><button className={done.includes(t.id)?'done-btn':'start-btn'} onClick={()=>claim(t)}>{done.includes(t.id)?'Done':'Start'}</button></div>)}{category==='Invite Quest'&&[3,5,10,25,50].map(n=><div className="task-row"><div className="task-icon">👥</div><div className="task-info"><b>Invite {n} friends</b><span>Referral milestone</span></div><button className="start-btn" onClick={()=>setTab('Friends')}>Invite</button></div>)}</div></main>}
  {!page && tab==='Leaderboard' && <main className="screen"><h1>LEADERBOARD</h1><p className="lead">TOP PAWS COMMUNITY MEMBERS</p><div className="leader-card"><div className="leader-head">RANK <span>USER</span><span>PAWS</span></div>{['Paws Master','Crypto Paw','Blue Foot','Newcomer'].map((n,i)=><div className="leader-row"><b>#{i+1}</b><span>{n}</span><strong>{(98500-i*14200).toLocaleString()}</strong></div>)}</div><p className="muted center">Preview rankings — live leaderboard requires backend data.</p></main>}
  {!page && tab==='Wallet' && <main className="screen"><h1>WALLET</h1><p className="lead">CONNECT YOUR TON WALLET</p><div className="wallet-card"><div className="wallet-top"><ShieldCheck/><b>{wallet?'Wallet connected':'Wallet not connected'}</b></div><TonConnectButton/><p className="muted break">{wallet?.account?.address||'Connect a compatible TON wallet to view its address.'}</p><div className="wallet-stat"><span>Wallet verification</span><b>{walletVerified?'Verified':'Not verified'}</b></div><button className="primary full" onClick={()=>notify('Backend TON payment verification must be configured before activation.')}>Verify wallet · 0.15 TON</button></div><div className="wallet-card"><div className="wallet-stat"><span>PAWS points</span><b>{points.toLocaleString()}</b></div><div className="wallet-stat"><span>Withdrawable tokens</span><b>0 PAWS</b></div><button className="outline full" onClick={()=>go('Withdraw')}>Withdraw</button></div></main>}
  {page && <main className="screen subpage"><button className="back-btn" onClick={()=>setPage('')}><ArrowLeft/> Back</button><h1>{page.toUpperCase()}</h1>{page==='Footprint map'?<div className="map-card"><Footprints size={64}/><h2>PAWS footprint map</h2><p>Explore community growth and global activity.</p><div className="stats-grid"><Stat label="Total users" value="—"/><Stat label="Verified wallets" value="—"/><Stat label="Referrals" value="—"/></div><small className="muted">Live aggregated statistics will appear after backend connection.</small></div>:page==='Buy Token'?<div className="wallet-card"><PawLogo small/><h2>$PAWS Token</h2><p className="muted">TON Jetton purchase details will be configured by the administrator.</p><button className="primary full" onClick={()=>notify('Token purchase is not configured yet.')}>Buy Token</button></div>:page==='Levels'?<div className="wallet-card"><h2>Level {level} → {Math.min(level+1,50)}</h2><p>Tap capacity: {level*500}</p><p>Required holding: {level===1?0:(level+1)*1000} PAWS</p><button className="primary full" onClick={()=>notify('Level upgrade requires verified on-chain token holdings.')}>Upgrade level</button></div>:page==='Rewards'?<div className="wallet-card">{history.length?history.map((h,i)=><div className="history-row" key={i}><span>{h.type}<small>{h.date}</small></span><b>+{h.amount} PAWS</b></div>):<p className="muted">No rewards yet. Start tapping or complete a task.</p>}</div>:page==='Withdraw'?<div className="wallet-card"><p>Available token balance: 0 PAWS</p><input className="dark-input" placeholder="Withdrawal amount"/><button className="primary full" onClick={()=>notify('Withdrawals will be enabled after treasury setup.')}>Submit withdrawal</button></div>:<div className="wallet-card">Coming soon</div>}</main>}
  {!page&&<BottomNav active={tab} onChange={setTab}/>}
  {toast&&<div className="toast">{toast}</div>}
 </div>;
}
function Chevron(){return <ArrowRight size={22} className="chevron"/>}
function Stat({label,value}){return <div className="stat"><b>{value}</b><span>{label}</span></div>}