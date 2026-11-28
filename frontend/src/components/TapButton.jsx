import { useRef, useState } from 'react';

const BLUE = '#4da3f5';
const GREEN = '#22c55e';
const R = 104;
const C = 2 * Math.PI * R;

// state: 'manual' | 'idle' | 'running' | 'ready'
// The logo is the only button: tap to start, tap again to claim when the ring turns green.
export default function TapButton({ state = 'manual', progress = 0, label, sub, perTap = 1, disabled, onTap }) {
  const [floats, setFloats] = useState([]);
  const [pressed, setPressed] = useState(false);
  const idRef = useRef(0);

  const color = state === 'ready' ? GREEN : BLUE;
  const pct = state === 'running' ? Math.min(1, Math.max(0, progress)) : 1;
  const dim = state === 'running';

  const click = (e) => {
    if (disabled) return;
    if (state === 'manual') {
      const id = ++idRef.current;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX || rect.left + rect.width / 2) - rect.left + (Math.random() * 30 - 15);
      const y = (e.clientY || rect.top + rect.height / 2) - rect.top - 20;
      setFloats((f) => [...f.slice(-8), { id, x, y }]);
      setTimeout(() => setFloats((f) => f.filter((q) => q.id !== id)), 800);
    }
    onTap?.(e);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <style>{`
        @keyframes pawsFloat{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-70px)}}
        @keyframes pawsPulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}50%{box-shadow:0 0 0 18px rgba(34,197,94,0)}}
      `}</style>
      <button
        type="button"
        onClick={click}
        disabled={disabled}
        aria-label={label}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        style={{
          position: 'relative', width: 224, height: 224, borderRadius: '50%', border: 0, padding: 0,
          background: 'transparent', cursor: 'pointer', touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent', opacity: disabled ? 0.7 : 1,
          transform: pressed ? 'scale(.96)' : 'scale(1)', transition: 'transform .08s ease',
          animation: state === 'ready' ? 'pawsPulse 1.6s infinite' : 'none',
        }}
      >
        <svg width="224" height="224" viewBox="0 0 224 224" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
          <circle cx="112" cy="112" r={R} fill="none" stroke="#262626" strokeWidth="8" />
          <circle
            cx="112" cy="112" r={R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke .3s' }}
          />
        </svg>
        <img
          src="/paws-logo.png" alt=""
          style={{
            position: 'absolute', inset: 16, width: 192, height: 192, borderRadius: '50%', objectFit: 'cover',
            filter: dim ? 'brightness(.6)' : 'none', boxShadow: `0 0 40px ${color}55`,
            pointerEvents: 'none', userSelect: 'none',
          }}
        />
        {state === 'ready' && (
          <span style={{
            position: 'absolute', left: '50%', bottom: 34, transform: 'translateX(-50%)',
            background: GREEN, color: '#00210c', fontWeight: 800, fontSize: 15, letterSpacing: 1,
            padding: '6px 18px', borderRadius: 9999, pointerEvents: 'none',
          }}>CLAIM</span>
        )}
        {floats.map((f) => (
          <span key={f.id} style={{
            position: 'absolute', left: f.x, top: f.y, color: BLUE, fontWeight: 800, fontSize: 22,
            pointerEvents: 'none', animation: 'pawsFloat .8s ease-out forwards',
          }}>+{perTap}</span>
        ))}
      </button>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: state === 'ready' ? GREEN : '#fff' }}>{label}</div>
        {sub && <div style={{ fontSize: 13, color: '#adabaa', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}
