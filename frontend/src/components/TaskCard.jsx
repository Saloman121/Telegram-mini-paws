export default function TaskCard({ task, onStart, onVerify, claimed }) {
  const label = claimed ? '✅ Claimed' : task.started ? 'Verify' : 'Start';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12,
      background: 'var(--card)', borderRadius: 12, marginBottom: 8 }}>
      <div style={{ fontSize: 24 }}>{task.icon || '🎯'}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{task.title}</div>
        <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>
          +{task.reward.toLocaleString()} PAWS
        </div>
      </div>
      <button disabled={claimed} onClick={task.started ? onVerify : onStart} style={{
        background: claimed ? '#333' : '#fff', color: claimed ? '#888' : '#000',
        borderRadius: 10, padding: '8px 14px', fontWeight: 700, opacity: claimed ? .6 : 1,
      }}>{label}</button>
    </div>
  );
      }
