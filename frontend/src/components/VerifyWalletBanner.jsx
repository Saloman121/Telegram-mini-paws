export default function VerifyWalletBanner({ onVerify }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg,#ff6b00,#ff2e63)', borderRadius: 16,
      padding: 14, margin: 16, display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ fontSize: 22 }}>🔒</span>
      <div style={{ flex: 1, fontSize: 13 }}>
        <b>Verify wallet</b> — Pay 0.15 TON to activate referrals
      </div>
      <button onClick={onVerify} style={{
        background: '#fff', color: '#000', padding: '8px 14px',
        borderRadius: 10, fontWeight: 700,
      }}>Verify Now</button>
    </div>
  );
}
