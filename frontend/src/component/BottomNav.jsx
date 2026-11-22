import React from 'react';
import { House, Trophy, Users, ClipboardList, Wallet } from 'lucide-react';
const items=[['Home',House],['Leaderboard',Trophy],['Friends',Users],['Earn',ClipboardList],['Wallet',Wallet]];
export default function BottomNav({active,onChange}) { return <nav className="bottom-nav">{items.map(([name,Icon])=><button key={name} className={active===name?'nav-item active':'nav-item'} onClick={()=>onChange(name)}><Icon size={27} strokeWidth={2.1}/><span>{name}</span></button>)}</nav>; }