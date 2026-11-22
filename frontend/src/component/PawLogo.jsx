import React from 'react';
export default function PawLogo({small=false}) {
  return <svg className={small?'paw-logo small':'paw-logo'} viewBox="0 0 180 150" role="img" aria-label="PAWS logo">
    <g fill="currentColor"><ellipse cx="43" cy="43" rx="19" ry="27" transform="rotate(25 43 43)"/><ellipse cx="83" cy="25" rx="20" ry="28" transform="rotate(-8 83 25)"/><ellipse cx="126" cy="39" rx="19" ry="27" transform="rotate(-25 126 39)"/><ellipse cx="25" cy="91" rx="19" ry="27" transform="rotate(30 25 91)"/><ellipse cx="153" cy="91" rx="19" ry="27" transform="rotate(-30 153 91)"/><path d="M47 111 Q88 67 133 111 Q150 133 126 145 Q109 153 89 130 Q68 153 49 144 Q27 133 47 111Z"/><ellipse cx="88" cy="144" rx="9" ry="6"/></g>
  </svg>;
}