import { useEffect, useState } from 'react';
import { useWallet } from '../lib/tonconnect';
import api from '../lib/api';
import { Copy } from 'lucide-react';

export default function Wallet() {
  const { tonConnectUI, address } = useWallet();
  const [txs, setTxs] = useState([]);
  const [amount, setAmount] = useState('');
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    api.get('/user/profile').then(({ data }) => setProfile(data));
    api.get('/transactions').then(({ data }) => setTxs(data));
  }, []);

  const verify = () => {
    alert('Send 0.15 TON to admin wallet, then call /wallet/verify with tx_hash');
  };

  const withdraw = async () => {
    await api.post('/withdraw', { amount: Number(amount), wallet_address: address });
    alert('Withdrawal submitted');
    setAmount('');
  };

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ margin: '8px 0', fontSize: 22 }}>WALLET</h1>
      {!address ? (
        <button className="btn-primary" style={{ width: '100%', marginTop: 16, padding: 14 }}
          onClick={() => tonConnectUI.openModal()}>
          Connect Wallet
        </button>
      ) : (
        <>
          <div className="card" style={{ marginTop: 16, display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }}>
              {address.slice(0, 6)}...{address.slice(-4)}
            </div>
            <button onClick={() => navigator.clipboard.writeText(address)}
              style={{ background: 'none', color: 'var(--accent)' }}>
              <Copy size={18} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div className="card">
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>$PAWS</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{profile?.points?.toLocaleString() || 0}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>TON</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>—</div>
            </div>
          </div>
          {!profile?.wallet_verified && (
            <button onClick={verify} className="btn-primary"
              style={{ width: '100%', marginTop: 12, padding: 12, background: '#ff2e63' }}>
              Verify Wallet (0.15 TON)
            </button>
          )}
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Withdraw</div>
            <input value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (PAWS)" type="number"
              style={{ width: '100%', padding: 12, borderRadius: 10, background: '#111',
                border: '1px solid #333', color: '#fff', marginBottom: 8 }} />
            <button className="btn-primary" style={{ width: '100%' }} onClick={withdraw}>
              Withdraw
            </button>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>History</div>
            {txs.map((tx) => (
              <div key={tx.id} style={{ padding: 12, background: 'var(--card)',
                borderRadius: 12, marginBottom: 8, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{tx.type}</span>
                  <span style={{ color: tx.amount > 0 ? '#3ddc84' : '#ff5c8a' }}>
                    {tx.amount} {tx.currency}
                  </span>
                </div>
                <div style={{ color: 'var(--muted)', fontFamily: 'monospace', marginTop: 4 }}>
                  {tx.tx_hash?.slice(0, 12)}…
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
    }
