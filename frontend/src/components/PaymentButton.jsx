import { usePayment } from '../services/tonconnect';
// Generic "pay X TON" button used for wallet verification, Auto Tap and token purchase.
export default function PaymentButton({ purpose, params, label, onConfirmed }) {
  const { status, error, pay, connected } = usePayment(onConfirmed);
  return (
    <div className="stack">
      <button className="btn full" disabled={status === 'pending'} onClick={() => pay(purpose, params)}>
        {!connected ? 'Connect Wallet' : status === 'pending' ? 'Waiting for confirmation…' : label}
      </button>
      {status === 'confirmed' && <p className="ok-txt small">Payment confirmed on-chain ✔</p>}
      {status === 'failed' && <p className="err small">{error}</p>}
      {status === 'pending' && error && <p className="muted small">{error}</p>}
    </div>
  );
}
