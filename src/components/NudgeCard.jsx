import React from 'react';

export default function NudgeCard({ nudge, loading, onDismiss, onRefresh }) {
  const allDone = nudge?.gaps && Object.keys(nudge.gaps).length === 0;

  return (
    <div style={{
      margin: '0 16px 16px',
      background: allDone ? 'var(--success-bg, #e1f5ee)' : 'var(--warn-bg, #faeeda)',
      border: `0.5px solid ${allDone ? 'rgba(29,158,117,.25)' : 'rgba(186,117,23,.25)'}`,
      borderRadius: 14,
      padding: 14,
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
    }}>
      <i
        className={`ti ${allDone ? 'ti-circle-check' : 'ti-bell-ringing'}`}
        style={{ fontSize: 22, color: allDone ? '#1d9e75' : '#ba7517', flexShrink: 0, marginTop: 1 }}
        aria-hidden="true"
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: allDone ? '#085041' : '#633806', marginBottom: 4 }}>
          {allDone ? 'Goals met today!' : "Today's nudge"}
        </div>
        {loading
          ? <div style={{ fontSize: 13, color: '#888' }}>Getting personalized advice…</div>
          : <div style={{ fontSize: 13, lineHeight: 1.55 }}>{nudge?.text}</div>}
        {!loading && !allDone && (
          <button onClick={onRefresh} style={{
            marginTop: 8, background: 'none', border: 'none', padding: 0,
            fontSize: 12, color: '#0f6e56', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer'
          }}>
            <i className="ti ti-refresh" style={{ fontSize: 13 }} />Refresh advice
          </button>
        )}
      </div>
      <button onClick={onDismiss} aria-label="Dismiss" style={{
        background: 'none', border: 'none', color: '#bbb', fontSize: 17, padding: 2, flexShrink: 0, cursor: 'pointer'
      }}>
        <i className="ti ti-x" />
      </button>
    </div>
  );
}
