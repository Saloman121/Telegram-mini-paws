import { useState } from 'react';
export default function TapButton({ disabled, perTap, onTap }) {
  const [floats, setFloats] = useState([]);
  const handle = (e) => {
    if (disabled) return;
    const touches = e.changedTouches ? Array.from(e.changedTouches) : [e];
    const rect = e.currentTarget.getBoundingClientRect();
    touches.forEach((t) => {
      const id = Math.random();
      setFloats((f) => [...f, { id, x: t.clientX - rect.left, y: t.clientY - rect.top }]);
      setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 700);
      onTap();
    });
  };
  return (
    <div className="tap-wrap">
      <button className={`tap ${disabled ? 'off' : ''}`} onPointerDown={handle} aria-label="Tap to mine PAWS">
        <img src="/paws-logo.png" alt="" draggable="false" />
        {floats.map((f) => <span key={f.id} className="float" style={{ left: f.x, top: f.y }}>+{perTap}</span>)}
      </button>
    </div>
  );
}
