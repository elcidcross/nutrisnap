import React, { useState, useEffect } from 'react';
import AppShell from '../components/AppShell';
import { getObjectives, addObjective, updateObjective, deleteObjective, getBodyMetrics } from '../utils/db';
import { appsWithKind, metricsByKind, findMetric, computeGoalState, goalTitle, dueLabel, currentReading, readingAt } from '../utils/goals';

// The Goals app holds the *ends*: app-measured outcomes with a deadline (e.g. 16%
// body fat by Jul 14), sourced from Body metrics. The *means* — recurring habits
// like "run 10 km/week" — live in their own apps and are graded by the Report Card
// app; they are deliberately not here. Goals are stored as 'reach' objectives whose
// verdict latches to achieved/missed.

const ACCENT = '#c2410c';
const APP_META = { body: { name: 'Body', icon: 'ti-scale', accent: '#d4537e' } };
const appMeta = id => APP_META[id] || { name: id, icon: 'ti-target', accent: ACCENT };

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const fmt = n => (n == null ? '—' : Number.isInteger(+n) ? String(+n) : (+n).toFixed(1));

function toDateInput(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const dueFromDate = str => (str ? new Date(`${str}T23:59:00`).getTime() : null);
const startFromDate = str => (str ? new Date(`${str}T00:00:00`).getTime() : null);
// The metric value to lock in as the starting point: the reading at the chosen start
// date, falling back to the latest reading.
const baselineFor = (app, metric, entries, startTs) =>
  (startTs != null ? readingAt(app, metric, entries, startTs) : null) ?? currentReading(app, metric, entries);

export default function GoalsApp({ user, active, apps, activeApp, onSwitch }) {
  const [objectives, setObjectives] = useState([]);
  const [bodyEntries, setBodyEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('active'); // 'active' | 'done'
  const [sheet, setSheet] = useState(null);     // null | { id?, draft }

  // Re-fetch on each activation: goal progress is measured against Body metrics that
  // are logged in the Body app, so a new measurement made this session must be picked
  // up on return rather than cached from first open.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    Promise.all([
      getObjectives(user.id),
      getBodyMetrics(user.id).catch(() => []),
    ]).then(([objs, body]) => {
      if (cancelled) return;
      setObjectives(objs.filter(o => o.type === 'reach')); // Goals app = outcomes only
      setBodyEntries(body);
    }).catch(console.error).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [active, user.id]);

  // Latch goal verdicts once decided. No-op after the local status update.
  useEffect(() => {
    if (!loaded) return;
    const now = Date.now();
    const toLatch = objectives
      .filter(o => o.status === 'active')
      .map(o => ({ o, st: computeGoalState(o, bodyEntries, now) }))
      .filter(({ st }) => st.done);
    if (toLatch.length === 0) return;
    setObjectives(prev => prev.map(o => {
      const m = toLatch.find(t => t.o.id === o.id);
      return m ? { ...o, status: m.st.status } : o;
    }));
    toLatch.forEach(({ o, st }) => updateObjective(user.id, o.id, { status: st.status }).catch(console.error));
  }, [loaded, objectives, bodyEntries]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null;

  const patch = obj => setSheet(s => ({ ...s, draft: { ...s.draft, ...obj } }));

  const openAdd = () => {
    const app = appsWithKind('goal')[0];
    const m = metricsByKind(app, 'goal')[0];
    setSheet({ draft: { title: '', app, metric: m.metric, target: '', startDate: toDateInput(Date.now()), dueDate: toDateInput(Date.now() + 30 * 86400000) } });
  };
  const openEdit = (o) => {
    setSheet({ id: o.id, draft: {
      title: o.title || '', app: o.app, metric: o.metric,
      target: o.target == null ? '' : String(o.target),
      startDate: toDateInput(o.startTs ?? (o.createdAt ? new Date(o.createdAt).getTime() : Date.now())),
      dueDate: o.dueTs ? toDateInput(o.dueTs) : toDateInput(Date.now() + 30 * 86400000),
    } });
  };

  const saveSheet = () => {
    const d = sheet.draft;
    const def = findMetric(d.app, d.metric);
    const target = d.target === '' ? null : +d.target;
    if (!target) return;
    const startTs = startFromDate(d.startDate);
    const fields = {
      title: d.title.trim() || null, app: d.app, metric: d.metric, type: 'reach', target,
      direction: def && def.lowerBetter ? 'down' : 'up',
      period: null, startTs, dueTs: dueFromDate(d.dueDate),
      baseline: baselineFor(d.app, d.metric, bodyEntries, startTs),
    };
    if (sheet.id) {
      setObjectives(p => p.map(o => o.id === sheet.id ? { ...o, ...fields } : o));
      updateObjective(user.id, sheet.id, fields).catch(console.error);
    } else {
      const obj = { id: newId(), ...fields, status: 'active', createdAt: new Date().toISOString() };
      setObjectives(p => [obj, ...p]);
      addObjective(user.id, obj).catch(console.error);
    }
    setSheet(null);
  };

  const del = (id) => {
    setObjectives(p => p.filter(o => o.id !== id));
    deleteObjective(user.id, id).catch(console.error);
  };

  const cards = objectives.map(o => ({ o, st: computeGoalState(o, bodyEntries), meta: appMeta(o.app) }));
  const activeCards = cards.filter(c => !c.st.done).sort((a, b) => (a.o.dueTs ?? Infinity) - (b.o.dueTs ?? Infinity));
  const doneCards = cards.filter(c => c.st.done).sort((a, b) => (b.o.dueTs || 0) - (a.o.dueTs || 0));
  const shown = view === 'done' ? doneCards : activeCards;

  let content;
  if (!loaded) {
    content = (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
        <div style={{ width: 30, height: 30, border: `3px solid ${ACCENT}22`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      </div>
    );
  } else if (shown.length === 0) {
    content = (
      <div style={{ textAlign: 'center', padding: '56px 24px', color: '#aaa' }}>
        <i className="ti ti-target" style={{ fontSize: 56, display: 'block', marginBottom: 12, color: `${ACCENT}66` }} aria-hidden="true" />
        <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
          {view === 'done' ? 'No finished goals yet.' : 'No goals yet.\nA goal is an outcome with a deadline\n— e.g. 16% body fat by a date.'}
        </p>
      </div>
    );
  } else {
    content = shown.map(c => <GoalCard key={c.o.id} card={c} onEdit={() => openEdit(c.o)} onDelete={del} />);
  }

  const tabs = [
    { id: 'active', icon: 'ti-target', label: 'Active' },
    { id: 'add', icon: 'ti-plus', label: 'Add', fab: true },
    { id: 'done', icon: 'ti-checkbox', label: 'Done' },
  ];
  const onTabChange = id => { if (id === 'add') openAdd(); else setView(id); };
  const subtitle = loaded ? (activeCards.length === 1 ? '1 active goal' : `${activeCards.length} active goals`) : '';

  return (
    <AppShell apps={apps} activeApp={activeApp} onSwitch={onSwitch} accent={ACCENT}
      title="Goals" subtitle={subtitle} tabs={tabs} activeTab={view} onTabChange={onTabChange}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {content}
      {sheet && <GoalSheet sheet={sheet} editing={!!sheet.id} patch={patch} bodyEntries={bodyEntries} onSave={saveSheet} onClose={() => setSheet(null)} />}
    </AppShell>
  );
}

// --- Card ---

function statusLine(o, st) {
  if (st.status === 'achieved') return { text: 'Achieved 🎉', color: '#1d9e75' };
  if (st.status === 'missed') return { text: `Missed · ${dueLabel(o)}`, color: '#e24b4a' };
  return { text: `${dueLabel(o)} · ${st.status === 'behind' ? 'behind' : 'on track'}`, color: st.status === 'behind' ? '#ba7517' : '#888' };
}

function GoalCard({ card, onEdit, onDelete }) {
  const { o, st, meta } = card;
  const [confirming, setConfirming] = useState(false);
  const line = statusLine(o, st);
  const def = findMetric(o.app, o.metric) || { unit: '' };
  const ringColor = st.done ? (st.status === 'achieved' ? '#1d9e75' : '#cbb8b0') : meta.accent;

  return (
    <div style={{ padding: '16px', borderBottom: '0.5px solid rgba(0,0,0,.07)', display: 'flex', gap: 14, alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: `${meta.accent}18`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className={`ti ${meta.icon}`} style={{ fontSize: 15, color: meta.accent }} aria-hidden="true" />
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{goalTitle(o)}</span>
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 7 }}>{`${fmt(st.current)} → ${fmt(st.target)} ${def.unit}`.trim()}</div>
        <div style={{ height: 7, borderRadius: 4, background: '#e8e8e4', overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ height: '100%', borderRadius: 4, background: ringColor, width: `${Math.round(st.pct * 100)}%`, transition: 'width .4s ease' }} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: line.color }}>{line.text}</div>
      </div>

      <button onClick={onEdit} aria-label="Edit goal" style={iconBtn}><i className="ti ti-pencil" /></button>
      <button onClick={() => setConfirming(true)} aria-label="Delete goal" style={iconBtn}><i className="ti ti-trash" /></button>

      {confirming && (
        <div onClick={() => setConfirming(false)} role="dialog" aria-modal="true" aria-label="Confirm delete"
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 320, background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Delete this goal?</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 18, lineHeight: 1.5 }}>The goal will be permanently removed. Your logged data is untouched.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirming(false)} style={{ flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: '#f0f0ea', color: 'inherit', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { setConfirming(false); onDelete(o.id); }} style={{ flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: '#e24b4a', color: '#fff', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn = { background: 'none', border: 'none', color: '#ccc', fontSize: 17, padding: 4, flexShrink: 0, cursor: 'pointer' };

// --- Add / edit sheet (goals only) ---

function GoalSheet({ sheet, editing, patch, bodyEntries, onSave, onClose }) {
  const d = sheet.draft;
  const appOptions = appsWithKind('goal');
  const metricsForApp = metricsByKind(d.app, 'goal');
  const def = metricsForApp.find(m => m.metric === d.metric) || metricsForApp[0];

  const changeApp = (app) => patch({ app, metric: metricsByKind(app, 'goal')[0].metric });
  const preview = goalTitle({ title: d.title.trim() || null, app: d.app, metric: d.metric, type: 'reach', target: d.target || 0 });
  const baselineVal = baselineFor(d.app, d.metric, bodyEntries, startFromDate(d.startDate));

  const label = txt => <div style={{ fontSize: 10, color: '#888', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>{txt}</div>;
  const selectStyle = { ...inputStyle, appearance: 'none', WebkitAppearance: 'none', paddingRight: 8 };

  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={editing ? 'Edit goal' : 'New goal'}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: '#fff', borderRadius: '18px 18px 0 0', padding: '20px 20px calc(20px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 32px rgba(0,0,0,.2)', maxHeight: '92dvh', overflowY: 'auto' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>{editing ? 'Edit goal' : 'New goal'}</div>
        <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>An outcome to reach by a date.</div>
        <div style={{ fontSize: 12, color: ACCENT, fontWeight: 600, marginBottom: 18 }}>{preview}</div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            {label('App')}
            <select value={d.app} onChange={e => changeApp(e.target.value)} style={selectStyle}>
              {appOptions.map(a => <option key={a} value={a}>{appMeta(a).name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            {label('Metric')}
            <select value={d.metric} onChange={e => patch({ metric: e.target.value })} style={selectStyle}>
              {metricsForApp.map(m => <option key={m.metric} value={m.metric}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            {label('Start date')}
            <input type="date" value={d.startDate} onChange={e => patch({ startDate: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            {label('Due date')}
            <input type="date" value={d.dueDate} onChange={e => patch({ dueDate: e.target.value })} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          {label(`Target${def ? ` (${def.unit})` : ''}`)}
          <input type="number" inputMode="decimal" min={0} step={0.1} value={d.target} placeholder="target value" onChange={e => patch({ target: e.target.value })} style={inputStyle} />
        </div>

        <div style={{ fontSize: 11, color: '#999', marginBottom: 16, lineHeight: 1.5 }}>
          {def && def.lowerBetter ? 'Lower is the win. ' : 'Higher is the win. '}
          Starting point (at start date): <strong>{fmt(baselineVal)}{def ? ` ${def.unit}` : ''}</strong>.
        </div>

        <div style={{ marginBottom: 20 }}>
          {label('Label (optional)')}
          <input type="text" value={d.title} placeholder={preview} onChange={e => patch({ title: e.target.value })} style={inputStyle} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onSave} style={{ flex: 1, padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: ACCENT, color: '#fff', cursor: 'pointer' }}>{editing ? 'Save' : 'Set goal'}</button>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: '#f0f0ea', color: 'inherit', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', fontSize: 15, fontWeight: 600, border: 'none', borderBottom: `2px solid ${ACCENT}`,
  background: 'transparent', outline: 'none', color: 'inherit', paddingBottom: 4, boxSizing: 'border-box', fontFamily: 'inherit',
};
