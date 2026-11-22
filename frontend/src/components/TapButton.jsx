import { useState, useRef } from 'react';
import { useTelegram } from '../hooks/useTelegram';

export default function TapButton({ onTap, disabled }) {
  const { haptic } = useTelegram();
  const [floats, setFloats] = useState([]);
  const idRef = useRef(0);

  const handleTap = (e) => {
    if (disabled) return;
    haptic('light');
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const id = idRef.current++;
    setFloats((f) => [...f, { id, x, y }]);
    setTimeout(() => setFloats((f) => f.filter((it) => it.id !== id)), 900);
    onTap();
  };

  return (
    <div style={{ position: 'relative', width: 240, height: 240, margin: '24px auto' }}>
      <button onClick={handleTap} style={{
        width: 240, height: 240, borderRadius: '50%', background:
          'radial-gradient(circle at 30% 30%, #00c2ff, #0088ff 60%, #004a88)',
        boxShadow: '0 0 60px rgba(0,136,255,.5)', border: '6px solid rgba(255,255,255,.1)',
        fontSize: 72, position: 'relative', overflow: 'hidden',
        transform: 'scale(1)', transition: 'transform .1s',
      }}
      onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(.95)')}
      onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        🐾
      </button>
      {floats.map(({ id, x, y }) => (
        <span key={id} style={{
          position: 'absolute', left: x, top: y, pointerEvents: 'none',
          animation: 'float 0.9s ease-out forwards', fontWeight: 800, color: '#fff',
        }}>+1</span>
      ))}
      <style>{`@keyframes float{to{transform:translateY(-80px);opacity:0}}`}</style>
    </div>
  );
                      }
