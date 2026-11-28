import { useEffect, useState } from 'react';
import { TonConnectButton, useTonWallet, useTonConnectUI } from '@tonconnect/ui-react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import PaymentButton from '../components/PaymentButton.jsx';
import AutoTapCard from '../components/AutoTapCard.jsx';
import { api } from '../services/api';
import { useApp } from '../store.jsx';
import { fmt, fmtTon, short } from '../services/format';

export default function Wallet() {
  const { profile, refresh, toast } = useApp();
  const wallet = useTonWallet();
  const [ui] = useTonConnectUI();
  const [st, setSt] = useState(null);
  const [hist, setHist] = useState([]);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const c = profile.config;
  const symbol = c.symbol || 'PAWS';

  const load = () => {
    api.walletStatus().then(setSt).catch((e) => toast(e.message));
    api.withdrawals().then((r) => setHist(r.items)).catch(() => {});
  };
  useEffect(() => { load(); }, [wallet?.account?.address]); // eslint-disable-line

  const onVerified = () => { refresh(); load(); };
  const submit = async () => {
    setBusy(true);
    try { await api.withdraw(Number(amount)); toast('Withdrawal requested'); setAmount(''); await refresh(); load(); }
    catch (e) { toast(e.message); }
    setBusy(false);
  };
  const verified = st?.verified;

  return (
    <div className="stack gap-lg">
      <div className="center"><h1 className="h1">WALLET</h1></div>
      <div className="card stack">
        <div className="between"><b>TON wallet</b>{verified ? <span className="pill ok"><ShieldCheck size={14} /> Verified</span> : <span className="pill warn"><ShieldAlert size={14} /> Unverified</span>}</div>
        {wallet ? <div className="between"><span className="mono">{short(st?.address || wallet.account.address)}</span><button className="link" onClick={() => ui.disconnect()}>Disconnect</button></div>
          : <TonConnectButton />}
        <div className="grid2">
          <div><div className="small muted">TON balance</div><b className="mono">{st ? fmtTon(st.ton_balance) : '—'}</b></div>
          <div><div className="small muted">{symbol} Jetton</div><b className="mono">{st ? fmt(st.jetton_balance) : '—'}</b></div>
        </div>
        {wallet && !verified && <PaymentButton purpose="wallet_verification" label={`Verify wallet • ${fmtTon(c.verification_fee_ton)} TON`} onConfirmed={onVerified} />}
        {st?.payments?.some((p) => p.status === 'failed') && <p className="err small">A previous payment failed. You can retry.</p>}
      </div>

      <AutoTapCard />

      <div className="card stack">
        <b>Withdraw</b>
        <div className="small muted">Available: <b className="mono">{fmt(profile.withdrawable)}</b> {symbol} • Min {fmt(c.min_withdrawal)} • Rate {c.conversion_rate}</div>
        <input className="input" inputMode="numeric" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        <button className="btn full" disabled={busy || !verified || !amount} onClick={submit}>{verified ? 'Request withdrawal' : 'Verify wallet to withdraw'}</button>
      </div>

      <div className="card stack">
        <b>History</b>
        {hist.length === 0 && <p className="muted small">No withdrawals yet.</p>}
        {hist.map((h) => <div key={h.id} className="between small"><span>{fmt(h.amount)} {symbol}</span><span className={`pill ${h.status === 'completed' ? 'ok' : h.status === 'rejected' ? 'bad' : 'warn'}`}>{h.status}</span></div>)}
        {st?.transactions?.map((t) => <div key={t.id} className="between small muted"><span>{t.type}</span><span>{t.status}</span></div>)}
      </div>
    </div>
  );
}
