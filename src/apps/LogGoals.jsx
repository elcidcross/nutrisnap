import React, { useState } from 'react';

// Generic Goals editor for a LogApp. Each app declares its targets via
// `config.goals: [{ key, label, unit, placeholder? }]`. Values persist to the
// shared app_goals table; saved on blur (optimistically, via onSave).

function GoalRow({ goal, value, onSave, accent }) {
  const [draft, setDraft] = useState(value ?? '');

  const commit = () => {
    const v = draft === '' ? null : +draft;
    if (v !== (value ?? null)) onSave(goal.key, v);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '0.5px solid rgba(0,0,0,.07)' }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{goal.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <input
          type="number" inputMode="decimal" min={0} step={goal.step || 0.1}
          value={draft} placeholder={goal.placeholder || ''}
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          style={{
            width: 80, textAlign: 'right', fontSize: 15, fontWeight: 700, color: accent,
            border: 'none', borderBottom: `2px solid ${accent}`, background: 'transparent',
            outline: 'none', padding: '2px 0', fontFamily: 'inherit',
          }}
        />
        {goal.unit && <span style={{ fontSize: 12, color: '#999', width: 38 }}>{goal.unit}</span>}
      </div>
    </div>
  );
}

export default function LogGoals({ goals, values, onSave, accent }) {
  if (!goals || goals.length === 0) return null;
  return (
    <div style={{ padding: '8px 16px 24px' }}>
      <p style={{ fontSize: 12, color: '#999', margin: '8px 0 4px', lineHeight: 1.5 }}>
        Targets are shown on the Report charts. Leave blank to hide a goal line.
      </p>
      {goals.map(g => (
        <GoalRow key={g.key} goal={g} value={(values || {})[g.key]} onSave={onSave} accent={accent} />
      ))}
    </div>
  );
}
