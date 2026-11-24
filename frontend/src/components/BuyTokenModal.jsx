import Modal from './Modal.jsx';
import PaymentButton from './PaymentButton.jsx';
import { useApp } from '../store.jsx';
import { short } from '../services/format';

export default function BuyTokenModal({ onClose }) {
  const { profile, refresh } = useApp();
  const c = profile.config;
  const ready = !!c.jetton_master;
  return (
    <Modal title="Buy $PAWS" onClose={onClose}>
      <div className="stack">
        <div className="card"><div className="small muted">Token</div><b>{c.token_name} ({c.token_symbol})</b></div>
        <div className="card"><div className="small muted">Contract address</div>
          <div className="mono small">{ready ? short(c.jetton_master) : 'Not configured yet'}</div></div>
        <div className="card"><div className="small muted">Price</div><b>{c.buy_price_ton ? `${c.buy_price_ton} TON per 1,000 PAWS` : 'Not configured yet'}</b></div>
        {ready && c.buy_price_ton
          ? <PaymentButton purpose="buy_token" params={{ units: 1000 }} label="Buy 1,000 PAWS" onConfirmed={refresh} />
          : <p className="muted small">Purchases open once the admin configures the Jetton and price.</p>}
        <p className="muted small">Tokens are credited only after the backend verifies your transaction on the TON blockchain.</p>
      </div>
    </Modal>
  );
}
