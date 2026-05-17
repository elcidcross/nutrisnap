import React from 'react';

export default function ProgressBar({ label, color, value, goal }) {
  const pct = Math.min(100, (value / Math.max(1, goal)) * 100);
  const rem = Math.max(0, goal - value);
  const over = value > goal;
  const barColor = over ? '#e24b4a' : color;
  const isCalories = label === 'Calories';

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
        <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
          {label}
        </span>
        <span style={{ color: over ? '#e24b4a' : '#888' }}>
          {isCalories ? Math.round(value) : value.toFixed(1)} / {goal}{isCalories ? ' kcal' : 'g'}
          {!over && rem > 0 && (
            <span style={{ marginLeft: 6, opacity: .65 }}>
              {isCalories ? Math.round(rem) : rem.toFixed(1)} left
            </span>
          )}
          {over && <span style={{ marginLeft: 6 }}> over!</span>}
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: '#e8e8e4', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 4, background: barColor, width: `${pct}%`, transition: 'width .4s ease' }} />
      </div>
    </div>
  );
}
