import React, { useState, useCallback, useEffect, useRef } from 'react';
import Ring from './Ring';
import ProgressBar from './ProgressBar';
import NudgeCard from './NudgeCard';
import { getNudge, analyzeFood } from '../utils/api';
import { todayStr, fmtTime, fmtDate } from '../utils/date';

const COLORS = { cal: '#1d9e75', protein: '#d4537e', carbs: '#378add', fat: '#ba7517' };

// An entry saved from a photo without running the AI (e.g. analysis failed) has
// an image but no macros. These can be analyzed later from the log.
function isPendingAnalysis(entry) {
  return !!entry.imageUrl && !entry.calories && !entry.protein && !entry.carbs && !entry.fat;
}

export default function LogView({ logs, goals, onDelete, onEdit }) {
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
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
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
              {entries.map(entry => <LogEntry key={entry.id} entry={entry} onDelete={onDelete} onEdit={onEdit} />)}
            </div>
          ))
      }
    </div>
  );
}

function toLocalInput(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function r1(n) { return Math.round(n * 10) / 10; }

function LogEntry({ entry, onDelete, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [zoomed, setZoomed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState(null);
  const pending = isPendingAnalysis(entry);
  // Fixed anchor for proportional rescaling: macros at a known amount.
  // Anchoring on this (rather than the previous amount) means clearing the
  // amount field to empty doesn't lose the reference, so retyping recomputes.
  const base = useRef({ amount: 0, calories: 0, protein: 0, carbs: 0, fat: 0 });

  const startEdit = () => {
    setDraft({
      name: entry.name,
      amount: entry.amount ?? '',
      timestamp: toLocalInput(entry.timestamp),
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
    });
    base.current = {
      amount: +entry.amount || 0,
      calories: +entry.calories || 0,
      protein: +entry.protein || 0,
      carbs: +entry.carbs || 0,
      fat: +entry.fat || 0,
    };
    setEditing(true);
  };

  // Changing amount rescales all macros proportionally from the fixed base.
  const changeAmount = (newAmt) => {
    const next = +newAmt;
    const b = base.current;
    if (newAmt !== '' && next >= 0 && !Number.isNaN(next) && b.amount > 0) {
      const ratio = next / b.amount;
      setDraft(d => ({
        ...d,
        amount: newAmt,
        calories: Math.round(b.calories * ratio),
        protein: r1(b.protein * ratio),
        carbs: r1(b.carbs * ratio),
        fat: r1(b.fat * ratio),
      }));
    } else {
      setDraft(d => ({ ...d, amount: newAmt }));
    }
  };

  // Editing a macro directly re-anchors the base so subsequent amount
  // changes scale from the corrected value.
  const changeMacro = (key, val) => {
    setDraft(d => {
      const nd = { ...d, [key]: val };
      base.current = {
        amount: nd.amount === '' ? base.current.amount : (+nd.amount || 0),
        calories: +nd.calories || 0,
        protein: +nd.protein || 0,
        carbs: +nd.carbs || 0,
        fat: +nd.fat || 0,
      };
      return nd;
    });
  };

  // Re-run analysis on a saved photo (for entries saved without analysis).
  // The stored thumbnail is a data URL, so we recover base64 + mime from it.
  const reanalyze = async () => {
    if (!localStorage.getItem('nutrisnap_api_key')) {
      setAnalyzeErr('No API key set. Add one in Goals & Settings.');
      return;
    }
    const m = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(entry.imageUrl || '');
    if (!m) { setAnalyzeErr('No photo to analyze.'); return; }
    setAnalyzing(true);
    setAnalyzeErr(null);
    try {
      const a = await analyzeFood(m[2], m[1]);
      const unit = a.unit || 'g';
      onEdit(entry.id, {
        name: a.name || 'Meal',
        amount: a.amount || 0,
        unit,
        refAmount: unit === 'g' ? 100 : 1,
        refUnit: unit,
        calories: a.calories || 0,
        protein: a.protein || 0,
        carbs: a.carbs || 0,
        fat: a.fat || 0,
        fiber: a.fiber || 0,
        model: a._modelUsed || null,
      });
    } catch (e) {
      setAnalyzeErr(e.message || 'Could not analyze. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const save = () => {
    const updates = {
      name: draft.name,
      calories: +draft.calories,
      protein: +draft.protein,
      carbs: +draft.carbs,
      fat: +draft.fat,
      timestamp: new Date(draft.timestamp).getTime(),
    };
    if (entry.amount != null && draft.amount !== '') updates.amount = +draft.amount;
    onEdit(entry.id, updates);
    setEditing(false);
  };

  const field = (label, key, color) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color, fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <input type="number" value={draft[key]} min={0} step={0.1}
        onChange={e => changeMacro(key, e.target.value)}
        style={{ width: '100%', fontSize: 14, fontWeight: 700, border: 'none', borderBottom: `2px solid ${color}`, background: 'transparent', outline: 'none', color: 'inherit', paddingBottom: 2 }} />
    </div>
  );

  if (editing) return (
    <div style={{ padding: '14px 16px', borderBottom: '0.5px solid rgba(0,0,0,.07)', background: '#fafaf8' }}>
      <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
        style={{ width: '100%', fontSize: 15, fontWeight: 700, border: 'none', borderBottom: '2px solid #1d9e75', background: 'transparent', outline: 'none', color: 'inherit', paddingBottom: 4, marginBottom: 14, boxSizing: 'border-box' }} />

      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        {entry.amount != null && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#888', fontWeight: 700, marginBottom: 3 }}>AMOUNT ({entry.unit || 'g'})</div>
            <input type="number" value={draft.amount} min={0} step={0.1}
              onChange={e => changeAmount(e.target.value)}
              style={{ width: '100%', fontSize: 14, fontWeight: 700, border: 'none', borderBottom: '2px solid #888', background: 'transparent', outline: 'none', color: 'inherit', paddingBottom: 2 }} />
          </div>
        )}
        <div style={{ flex: entry.amount != null ? 1.5 : 1 }}>
          <div style={{ fontSize: 10, color: '#888', fontWeight: 700, marginBottom: 3 }}>WHEN</div>
          <input type="datetime-local" value={draft.timestamp}
            onChange={e => setDraft(d => ({ ...d, timestamp: e.target.value }))}
            style={{ width: '100%', fontSize: 13, fontWeight: 600, border: 'none', borderBottom: '2px solid #888', background: 'transparent', outline: 'none', color: 'inherit', paddingBottom: 2, fontFamily: 'inherit' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        {field('CALORIES', 'calories', '#1d9e75')}
        {field('PROTEIN', 'protein', '#d4537e')}
        {field('CARBS', 'carbs', '#378add')}
        {field('FAT', 'fat', '#ba7517')}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', background: '#1d9e75', color: '#fff', cursor: 'pointer' }}>Save</button>
        <button onClick={() => setEditing(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', background: '#f0f0ea', cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '14px 16px', borderBottom: '0.5px solid rgba(0,0,0,.07)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      {entry.imageUrl ? (
        <button onClick={() => setZoomed(true)} aria-label="Expand photo"
          style={{ width: 54, height: 54, borderRadius: 10, overflow: 'hidden', background: '#f0f0ea', flexShrink: 0, border: 'none', padding: 0, cursor: 'pointer' }}>
          <img src={entry.imageUrl} alt={entry.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </button>
      ) : (
        <div style={{ width: 54, height: 54, borderRadius: 10, overflow: 'hidden', background: '#f0f0ea', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-salad" style={{ fontSize: 20, color: '#ccc' }} aria-hidden="true" />
        </div>
      )}
      {zoomed && (
        <div onClick={() => setZoomed(false)} role="dialog" aria-label="Photo"
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <img src={entry.imageUrl} alt={entry.name} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, objectFit: 'contain' }} />
          <button onClick={() => setZoomed(false)} aria-label="Close"
            style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 16px)', right: 20, background: 'rgba(0,0,0,.5)', border: 'none', color: '#fff', fontSize: 24, width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-x" />
          </button>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
          {entry.amount && entry.unit ? <>{entry.amount} {entry.unit} · </> : null}{fmtTime(entry.timestamp)}{entry.model && <> · <span style={{ fontFamily: 'monospace' }}>{entry.model}</span></>}
        </div>
        {pending ? (
          <>
            {analyzing ? (
              <span style={{ fontSize: 12, color: '#888', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 13, height: 13, border: '2px solid #e0f5ed', borderTopColor: '#1d9e75', borderRadius: '50%', animation: 'spin .8s linear infinite', display: 'inline-block' }} />
                Analyzing…
              </span>
            ) : (
              <button onClick={reanalyze}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#fff', background: '#1d9e75', border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>
                <i className="ti ti-sparkles" style={{ fontSize: 13 }} />Analyze photo
              </button>
            )}
            {analyzeErr && <p style={{ color: '#e24b4a', fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>{analyzeErr}</p>}
          </>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[['#d4537e','P',entry.protein,'g'],['#378add','C',entry.carbs,'g'],['#ba7517','F',entry.fat,'g']].map(([c,l,v,u]) => (
              <span key={l} style={{ fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block' }} />
                {l} {v}{u}
              </span>
            ))}
          </div>
        )}
      </div>
      {!pending && <span style={{ fontSize: 14, fontWeight: 700, color: '#888', marginLeft: 'auto', flexShrink: 0 }}>{entry.calories} kcal</span>}
      {!pending && (
        <button onClick={startEdit} aria-label="Edit entry"
          style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 17, padding: 4, flexShrink: 0, cursor: 'pointer' }}>
          <i className="ti ti-pencil" />
        </button>
      )}
      <button onClick={() => setConfirmingDelete(true)} aria-label="Delete entry"
        style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 17, padding: 4, flexShrink: 0, cursor: 'pointer' }}>
        <i className="ti ti-trash" />
      </button>
      {confirmingDelete && (
        <div onClick={() => setConfirmingDelete(false)} role="dialog" aria-modal="true" aria-label="Confirm delete"
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 320, background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Delete this entry?</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 18, lineHeight: 1.5 }}>
              "{entry.name}" will be permanently removed from your log.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmingDelete(false)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: '#f0f0ea', color: 'inherit', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { setConfirmingDelete(false); onDelete(entry.id); }}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: '#e24b4a', color: '#fff', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
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
