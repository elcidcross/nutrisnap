import React, { useState, useEffect, useRef } from 'react';
import AppShell from '../components/AppShell';
import { todayStr, fmtTime, fmtDate } from '../utils/date';

// Generic "simple log" app: a chronological list of entries grouped by day plus a
// floating add button that opens an entry sheet. Jog / Workout / Meditation / Body
// are all instances of this, differing only in their `config` (fields, summary,
// accent, and the db CRUD functions). Charts/trends are a deliberate future add —
// the structure leaves room for a second tab without reworking this.
//
// config: {
//   appName, accent, icon, emptyHint,
//   fields: [{ key, label, unit?, type: 'number'|'text', placeholder?, step? }],
//   summary: (entry) => string,
//   load:   (userId) => Promise<entry[]>,
//   create: (userId, entry) => Promise,
//   update: (userId, id, updates) => Promise,
//   remove: (userId, id) => Promise,
// }

// The activity / body_metrics tables use uuid primary keys, so generate a
// real UUID client-side (we send the id for the optimistic insert). Falls back to
// a manual v4 builder on the rare platform without crypto.randomUUID.
function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function toLocalInput(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Duration is stored as an integer number of seconds (exact, no rounding) but
// entered and displayed as clock time. `type: 'duration'` fields round-trip
// through these. Input is forgiving: "h:mm:ss", "mm:ss", or a bare number of
// minutes. Output omits the hours part when under an hour ("14:40" vs "1:02:30").
export function parseDuration(str) {
  if (str == null || str === '') return null;
  const parts = String(str).trim().split(':').map(p => parseInt(p, 10));
  if (parts.some(Number.isNaN)) return null;
  let secs;
  if (parts.length === 1) secs = parts[0] * 60;                       // bare number = minutes
  else if (parts.length === 2) secs = parts[0] * 60 + parts[1];       // mm:ss
  else secs = parts[0] * 3600 + parts[1] * 60 + parts[2];             // h:mm:ss
  return secs;
}

export function fmtDuration(secs) {
  if (secs == null || secs === '') return '';
  secs = Math.round(+secs);
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const p = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

export default function LogApp({ config, user, active, apps, activeApp, onSwitch }) {
  const { appName, accent, icon, emptyHint, fields, summary, load, create, update, remove } = config;
  const [logs, setLogs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const loadingRef = useRef(false);
  const [sheet, setSheet] = useState(null); // null | { id?, draft }

  // Lazy load: only fetch the first time this app becomes active. Because the
  // component stays mounted (it returns null when inactive) the data persists, so
  // switching away and back is instant — no reload.
  useEffect(() => {
    if (!active || loaded || loadingRef.current) return;
    loadingRef.current = true;
    load(user.id).then(setLogs).catch(console.error).finally(() => setLoaded(true));
  }, [active, loaded, user.id, load]);

  if (!active) return null;

  const openAdd = () => {
    const draft = { when: toLocalInput(Date.now()) };
    fields.forEach(f => { draft[f.key] = ''; });
    setSheet({ draft });
  };

  const openEdit = (entry) => {
    const draft = { when: toLocalInput(entry.timestamp) };
    fields.forEach(f => {
      draft[f.key] = f.type === 'duration' ? fmtDuration(entry[f.key]) : (entry[f.key] ?? '');
    });
    setSheet({ id: entry.id, draft });
  };

  const setField = (key, val) => setSheet(s => ({ ...s, draft: { ...s.draft, [key]: val } }));

  const saveSheet = () => {
    const d = sheet.draft;
    const ts = new Date(d.when).getTime() || Date.now();
    const vals = {};
    fields.forEach(f => {
      const v = d[f.key];
      if (f.type === 'duration') vals[f.key] = parseDuration(v);
      else vals[f.key] = f.type === 'number' ? (v === '' ? null : +v) : (v === '' ? null : v);
    });
    const byTs = (a, b) => b.timestamp - a.timestamp;
    if (sheet.id) {
      const updates = { timestamp: ts, ...vals };
      setLogs(p => p.map(l => l.id === sheet.id ? { ...l, ...updates } : l).sort(byTs));
      update(user.id, sheet.id, updates).catch(console.error);
    } else {
      const entry = { id: newId(), timestamp: ts, ...vals };
      setLogs(p => [entry, ...p].sort(byTs));
      create(user.id, entry).catch(console.error);
    }
    setSheet(null);
  };

  const del = (id) => {
    setLogs(p => p.filter(l => l.id !== id));
    remove(user.id, id).catch(console.error);
  };

  const grouped = {};
  logs.forEach(l => {
    const day = new Date(l.timestamp).toDateString();
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(l);
  });

  const subtitle = loaded ? (logs.length === 1 ? '1 entry' : `${logs.length} entries`) : '';

  return (
    <AppShell apps={apps} activeApp={activeApp} onSwitch={onSwitch} accent={accent}
      title={appName} subtitle={subtitle}
      fab={{ icon: 'ti-plus', label: `Add ${appName.toLowerCase()}`, onClick: openAdd }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {!loaded ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 30, height: 30, border: `3px solid ${accent}22`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        </div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 24px', color: '#aaa' }}>
          <i className={`ti ${icon}`} style={{ fontSize: 56, display: 'block', marginBottom: 12, color: `${accent}66` }} aria-hidden="true" />
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>{emptyHint}</p>
        </div>
      ) : (
        Object.entries(grouped).map(([day, entries]) => (
          <div key={day}>
            <div style={{ padding: '10px 16px 6px', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.5px', background: '#f5f5f0' }}>
              {day === todayStr() ? 'Today' : fmtDate(entries[0].timestamp)}
            </div>
            {entries.map(e => (
              <Row key={e.id} entry={e} icon={icon} accent={accent} summary={summary} appName={appName}
                onEdit={() => openEdit(e)} onDelete={del} />
            ))}
          </div>
        ))
      )}

      {sheet && (
        <EntrySheet appName={appName} accent={accent} fields={fields} sheet={sheet}
          editing={!!sheet.id} setField={setField} onSave={saveSheet} onClose={() => setSheet(null)} />
      )}
    </AppShell>
  );
}

function Row({ entry, icon, accent, summary, appName, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const text = summary(entry);
  return (
    <div style={{ padding: '14px 16px', borderBottom: '0.5px solid rgba(0,0,0,.07)', display: 'flex', gap: 14, alignItems: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: `${accent}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 20, color: accent }} aria-hidden="true" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {text || appName}
        </div>
        <div style={{ fontSize: 11, color: '#999' }}>{fmtTime(entry.timestamp)}{entry.notes ? <> · {entry.notes}</> : null}</div>
      </div>
      <button onClick={onEdit} aria-label="Edit entry"
        style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 17, padding: 4, flexShrink: 0, cursor: 'pointer' }}>
        <i className="ti ti-pencil" />
      </button>
      <button onClick={() => setConfirming(true)} aria-label="Delete entry"
        style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 17, padding: 4, flexShrink: 0, cursor: 'pointer' }}>
        <i className="ti ti-trash" />
      </button>
      {confirming && (
        <div onClick={() => setConfirming(false)} role="dialog" aria-modal="true" aria-label="Confirm delete"
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 320, background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Delete this entry?</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 18, lineHeight: 1.5 }}>This entry will be permanently removed.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirming(false)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: '#f0f0ea', color: 'inherit', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { setConfirming(false); onDelete(entry.id); }}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: '#e24b4a', color: '#fff', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EntrySheet({ appName, accent, fields, sheet, editing, setField, onSave, onClose }) {
  const inputStyle = {
    width: '100%', fontSize: 15, fontWeight: 600, border: 'none', borderBottom: `2px solid ${accent}`,
    background: 'transparent', outline: 'none', color: 'inherit', paddingBottom: 4, boxSizing: 'border-box', fontFamily: 'inherit',
  };
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={`${editing ? 'Edit' : 'Add'} ${appName.toLowerCase()}`}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 430, background: '#fff', borderRadius: '18px 18px 0 0',
          padding: '20px 20px calc(20px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 32px rgba(0,0,0,.2)',
        }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>{editing ? 'Edit' : 'Add'} {appName.toLowerCase()}</div>

        {fields.map(f => (
          <div key={f.key} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: '#888', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              {f.label}{f.unit ? ` (${f.unit})` : ''}
            </div>
            <input
              type={f.type === 'number' ? 'number' : 'text'}
              inputMode={f.type === 'number' ? 'decimal' : undefined}
              value={sheet.draft[f.key]}
              min={f.type === 'number' ? 0 : undefined}
              step={f.step || (f.type === 'number' ? 0.1 : undefined)}
              placeholder={f.placeholder || ''}
              onChange={e => setField(f.key, e.target.value)}
              style={inputStyle}
            />
          </div>
        ))}

        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 10, color: '#888', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>When</div>
          <input type="datetime-local" value={sheet.draft.when} onChange={e => setField('when', e.target.value)} style={inputStyle} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onSave} style={{ flex: 1, padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: accent, color: '#fff', cursor: 'pointer' }}>Save</button>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: '#f0f0ea', color: 'inherit', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
