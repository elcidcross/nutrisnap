import React, { useState, useCallback, useEffect } from 'react';
import Ring from './Ring';
import ProgressBar from './ProgressBar';
import NudgeCard from './NudgeCard';
import { getNudge } from '../utils/api';
import { todayStr, fmtTime, fmtDate } from '../utils/date';

const COLORS = { cal: '#1d9e75', protein: '#d4537e', carbs: '#378add', fat: '#ba7517' };

export default function LogView({ logs, goals, onDelete }) {
  const todayLogs = logs.filter(l => new Date(l.timestamp).toDateString() === todayStr());
  const totals = todayLogs.reduce((a, l) => ({
    calories: a.calories + (l.calories || 0),
    protein: a.protein + (l.protein || 0),
    carbs: a.carbs + (l.carbs || 0),
    fat: a.fat + (l.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const [nudge, setNudge] = useState(null);
  const [nudgeLoading, setNudgeLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const fetchNudge = useCallback(async () => {
    setNudgeLoading(true);
    try {
      const n = await getNudge(totals, goals);
      setNudge(n);
    } catch {
      setNudge({ text: 'Log your meals to get personalized advice!', gaps: {} });
    }
    setNudgeLoading(false);
  }, [totals, goals]);

  useEffect(() => {
    if (!dismissed && goals.calories > 0 && todayLogs.length > 0) {
      const t = setTimeout(fetchNudge, 1000);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line

  const grouped = {};
  [...logs].sort((a, b) => b.timestamp - a.timestamp).forEach(l => {
    const d = new Date(l.timestamp).toDateString();
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(l);
  });

  return (
    <div>
      {/* Rings */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px 20px 10px', gap: 20 }}>
        <Ring size={88} value={totals.calories} max={goals.calories} color={COLORS.cal} label="kcal" sub="calories" />
        <Ring size={72} value={totals.protein} max={goals.protein} color={COLORS.protein} label="protein" sub="grams" />
        <Ring size={72} value={totals.carbs} max={goals.carbs} color={COLORS.carbs} label="carbs" sub="grams" />
        <Ring size={72} value={totals.fat} max={goals.fat} color={COLORS.fat} label="fat" sub="grams" />
      </div>

      {/* Progress bars */}
      <div style={{ padding: '0 16px 14px' }}>
        <ProgressBar label="Calories" color={COLORS.cal} value={totals.calories} goal={goals.calories} />
        <ProgressBar label="Protein" color={COLORS.protein} value={totals.protein} goal={goals.protein} />
        <ProgressBar label="Carbs" color={COLORS.carbs} value={totals.carbs} goal={goals.carbs} />
        <ProgressBar label="Fat" color={COLORS.fat} value={totals.fat} goal={goals.fat} />
      </div>

      {/* Nudge */}
      {!dismissed && (nudge || nudgeLoading) && (
        <NudgeCard nudge={nudge} loading={nudgeLoading} onDismiss={() => setDismissed(true)} onRefresh={fetchNudge} />
      )}
      {!dismissed && !nudge && !nudgeLoading && todayLogs.length > 0 && (
        <div style={{ padding: '0 16px 14px' }}>
          <button onClick={fetchNudge} style={{
            width: '100%', padding: '12px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700,
            border: 'none', background: '#f0f0ea', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
          }}>
            <i className="ti ti-bell" style={{ fontSize: 16 }} />Get a nutrition nudge
          </button>
        </div>
      )}

      {/* Meal log */}
      {logs.length === 0
        ? <EmptyState />
        : Object.entries(grouped).map(([day, entries]) => (
            <div key={day}>
              <div style={{ padding: '10px 16px 6px', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.5px', background: '#f5f5f0' }}>
                {day === todayStr() ? 'Today' : fmtDate(entries[0].timestamp)}
              </div>
              {entries.map(entry => <LogEntry key={entry.id} entry={entry} onDelete={onDelete} />)}
            </div>
          ))
      }
    </div>
  );
}

function LogEntry({ entry, onDelete }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: '0.5px solid rgba(0,0,0,.07)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ width: 54, height: 54, borderRadius: 10, overflow: 'hidden', background: '#f0f0ea', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {entry.imageUrl
          ? <img src={entry.imageUrl} alt={entry.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <i className="ti ti-salad" style={{ fontSize: 20, color: '#ccc' }} aria-hidden="true" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>{fmtTime(entry.timestamp)}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[['#d4537e','P',entry.protein,'g'],['#378add','C',entry.carbs,'g'],['#ba7517','F',entry.fat,'g']].map(([c,l,v,u]) => (
            <span key={l} style={{ fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block' }} />
              {l} {v}{u}
            </span>
          ))}
        </div>
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#888', marginLeft: 'auto', flexShrink: 0 }}>{entry.calories} kcal</span>
      <button onClick={() => onDelete(entry.id)} aria-label="Delete entry"
        style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 17, padding: 4, flexShrink: 0, cursor: 'pointer' }}>
        <i className="ti ti-trash" />
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: '#aaa' }}>
      <i className="ti ti-salad" style={{ fontSize: 56, display: 'block', marginBottom: 12, color: '#c0ddd0' }} aria-hidden="true" />
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>No meals logged yet.<br />Tap the camera to snap your first meal!</p>
    </div>
  );
}
