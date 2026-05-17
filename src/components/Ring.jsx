import React from 'react';

export default function Ring({ size, value, max, color, label, sub }) {
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, value / Math.max(1, max));
  const dash = pct * circ;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} style={{ overflow: 'visible' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="#e8e8e4" strokeWidth={5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={5}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray .5s ease' }} />
        <text x={size/2} y={size/2 - 4} textAnchor="middle"
          fontSize="13" fontWeight="600" fill="currentColor">{Math.round(value)}</text>
        <text x={size/2} y={size/2 + 11} textAnchor="middle"
          fontSize="9" fill="#888">/{max}</text>
      </svg>
      <div style={{ fontSize: 11, fontWeight: 600, color }}>{label}</div>
      <div style={{ fontSize: 10, color: '#888' }}>{sub}</div>
    </div>
  );
}
