import { X } from 'lucide-react';
export default function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="between"><b className="title">{title}</b><button className="icon-btn" onClick={onClose}><X size={20} /></button></div>
        {children}
      </div>
    </div>
  );
}
