import React from 'react';
import { supabase } from '../utils/supabase';
import PerfPanel from './PerfPanel';

const KEYS = {
  API_KEY: 'nutrisnap_api_key',
  API_PROVIDER: 'nutrisnap_api_provider',
};

const PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic (Claude)', placeholder: 'sk-ant-…', link: 'https://console.anthropic.com/settings/keys' },
  { value: 'openai',    label: 'OpenAI (GPT-4o)',    placeholder: 'sk-…',     link: 'https://platform.openai.com/api-keys' },
  { value: 'gemini',    label: 'Google Gemini',       placeholder: 'AIza…',    link: 'https://aistudio.google.com/app/apikey' },
];

const COLORS = { cal: '#1d9e75', protein: '#d4537e', carbs: '#378add', fat: '#ba7517' };

function GoalRow({ label, color, field, goals, unit, onSave }) {
  const [val, setVal] = React.useState(goals[field]);
  React.useEffect(() => setVal(goals[field]), [goals, field]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '12px 14px', background: '#f5f5f0', borderRadius: 10, border: '0.5px solid rgba(0,0,0,.07)' }}>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />{label}
      </span>
      <input type="number" value={val} min={0} onChange={e => setVal(e.target.value)} onBlur={() => onSave(field, +val)}
        style={{ width: 80, fontSize: 15, fontWeight: 700, border: 'none', borderBottom: '2px solid #1d9e75', background: 'transparent', textAlign: 'right', outline: 'none', color: 'inherit', paddingBottom: 2 }} />
      <span style={{ fontSize: 12, color: '#888', minWidth: 28 }}>{unit}</span>
    </div>
  );
}

function Toggle({ on, onToggle, label }) {
  return (
    <button onClick={onToggle} aria-label={label} aria-pressed={on}
      style={{ width: 44, height: 26, borderRadius: 13, background: on ? '#1d9e75' : '#ccc', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', width: 20, height: 20, borderRadius: '50%', background: '#fff', top: 3, left: on ? 21 : 3, transition: 'left .2s' }} />
    </button>
  );
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (const ch of line) {
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

export default function SettingsView({ goals, notif, goalsHistory, logs, onGoalSave, onNotifChange, onImport, onLoadPerf }) {
  const [importMsg, setImportMsg] = React.useState(null);

  const exportCSV = () => {
    const rows = [['date', 'time', 'name', 'calories', 'protein', 'carbs', 'fat', 'fiber']];
    [...logs].sort((a, b) => a.timestamp - b.timestamp).forEach(l => {
      const d = new Date(l.timestamp);
      rows.push([
        d.toISOString().slice(0, 10),
        d.toTimeString().slice(0, 5),
        `"${(l.name || '').replace(/"/g, '""')}"`,
        l.calories || 0, l.protein || 0, l.carbs || 0, l.fat || 0, l.fiber || 0,
      ]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `nutrisnap-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const importCSV = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const lines = ev.target.result.split('\n').filter(Boolean);
      if (lines.length < 2) { setImportMsg('No data found in file.'); return; }
      const header = lines[0].toLowerCase().split(',').map(h => h.trim());
      const idx = name => header.indexOf(name);
      const entries = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const dateStr = cols[idx('date')]; const timeStr = cols[idx('time')] || '12:00';
        if (!dateStr) continue;
        const timestamp = new Date(`${dateStr}T${timeStr}`).getTime();
        if (isNaN(timestamp)) continue;
        entries.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2) + i,
          timestamp,
          name: cols[idx('name')] || 'Meal',
          calories: parseFloat(cols[idx('calories')]) || 0,
          protein: parseFloat(cols[idx('protein')]) || 0,
          carbs: parseFloat(cols[idx('carbs')]) || 0,
          fat: parseFloat(cols[idx('fat')]) || 0,
          fiber: parseFloat(cols[idx('fiber')]) || 0,
        });
      }
      onImport(entries);
      setImportMsg(`Imported ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}.`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const [provider, setProvider] = React.useState(() => localStorage.getItem(KEYS.API_PROVIDER) || 'anthropic');
  const [apiKey, setApiKey] = React.useState(() => localStorage.getItem(KEYS.API_KEY) || '');
  const [showKey, setShowKey] = React.useState(false);
  const [keySaved, setKeySaved] = React.useState(false);

  const saveApiKey = () => {
    localStorage.setItem(KEYS.API_KEY, apiKey.trim());
    localStorage.setItem(KEYS.API_PROVIDER, provider);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const providerInfo = PROVIDERS.find(p => p.value === provider);

  const requestAndEnable = async () => {
    if (!('Notification' in window)) { alert('This browser does not support notifications.'); return; }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') onNotifChange({ enabled: true });
    else alert('Notification permission denied. Please enable it in your device settings.');
  };

  const timeOptions = Array.from({ length: 24 }, (_, h) => [`${h}:00`, `${h}:30`]).flat()
    .map(v => ({ value: v.padStart(5, '0'), label: new Date('2000-01-01T' + v.padStart(5, '0')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }));

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* Targets */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 14 }}>Daily nutrition targets</div>
        <GoalRow color={COLORS.cal} label="Calories" field="calories" goals={goals} unit="kcal" onSave={onGoalSave} />
        <GoalRow color={COLORS.protein} label="Protein" field="protein" goals={goals} unit="g" onSave={onGoalSave} />
        <GoalRow color={COLORS.carbs} label="Carbs" field="carbs" goals={goals} unit="g" onSave={onGoalSave} />
        <GoalRow color={COLORS.fat} label="Fat" field="fat" goals={goals} unit="g" onSave={onGoalSave} />
      </div>

      <div style={{ height: '0.5px', background: 'rgba(0,0,0,.08)', margin: '20px 0 0' }} />

      {/* Notifications */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 14 }}>Reminders</div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '0.5px solid rgba(0,0,0,.07)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Daily reminders</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Push alerts to log your meals</div>
          </div>
          <Toggle on={notif.enabled} onToggle={() => notif.enabled ? onNotifChange({ enabled: false }) : requestAndEnable()} label="Toggle reminders" />
        </div>

        {notif.enabled && (
          <div style={{ paddingTop: 12, paddingBottom: 4 }}>
            {notif.times.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <i className="ti ti-clock" style={{ fontSize: 16, color: '#aaa' }} aria-hidden="true" />
                <select value={t} onChange={e => { const times = [...notif.times]; times[i] = e.target.value; onNotifChange({ times }); }}
                  style={{ fontSize: 13, border: '0.5px solid rgba(0,0,0,.2)', borderRadius: 7, padding: '5px 8px', background: 'transparent', color: 'inherit', flex: 1 }}
                  aria-label={`Reminder ${i + 1} time`}>
                  {timeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <span style={{ fontSize: 12, color: '#888', minWidth: 70 }}>{i === 0 ? 'Morning' : i === 1 ? 'Afternoon' : 'Evening'}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '0.5px solid rgba(0,0,0,.07)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>AI nutrition nudges</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Smart food suggestions to hit your goals</div>
          </div>
          <Toggle on={notif.nudgeEnabled} onToggle={() => onNotifChange({ nudgeEnabled: !notif.nudgeEnabled })} label="Toggle AI nudges" />
        </div>
      </div>

      <div style={{ margin: '20px 16px 0', background: '#f5f5f0', borderRadius: 12, padding: 14, fontSize: 13, color: '#777', lineHeight: 1.65 }}>
        <i className="ti ti-info-circle" style={{ fontSize: 15, marginRight: 6, verticalAlign: -2 }} aria-hidden="true" />
        Nudges are generated by AI based on your gap to daily goals. The more you log, the smarter the advice gets.
      </div>

      <div style={{ height: '0.5px', background: 'rgba(0,0,0,.08)', margin: '20px 0 0' }} />

      {/* AI Provider */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 14 }}>AI provider</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {PROVIDERS.map(p => (
            <button key={p.value} onClick={() => { setProvider(p.value); setKeySaved(false); }}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${provider === p.value ? '#1d9e75' : 'rgba(0,0,0,.12)'}`,
                background: provider === p.value ? '#e1f5ee' : 'transparent',
                color: provider === p.value ? '#1d9e75' : '#666',
                transition: 'all .15s',
              }}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => { setApiKey(e.target.value); setKeySaved(false); }}
            placeholder={providerInfo.placeholder}
            style={{
              width: '100%', padding: '12px 44px 12px 14px', fontSize: 13,
              border: '1.5px solid rgba(0,0,0,.15)', borderRadius: 10,
              background: '#fafaf8', outline: 'none', color: 'inherit', boxSizing: 'border-box',
              fontFamily: apiKey && !showKey ? 'monospace' : 'inherit',
            }}
          />
          <button onClick={() => setShowKey(s => !s)}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 16, padding: 2 }}
            aria-label={showKey ? 'Hide key' : 'Show key'}>
            <i className={`ti ${showKey ? 'ti-eye-off' : 'ti-eye'}`} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button onClick={saveApiKey} disabled={!apiKey.trim()}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
              border: 'none', background: keySaved ? '#1d9e75' : '#222', color: '#fff',
              cursor: apiKey.trim() ? 'pointer' : 'not-allowed', opacity: apiKey.trim() ? 1 : 0.4,
              transition: 'background .2s',
            }}>
            {keySaved ? <><i className="ti ti-check" /> Saved</> : 'Save key'}
          </button>
          {apiKey && (
            <button onClick={() => { setApiKey(''); localStorage.removeItem(KEYS.API_KEY); }}
              style={{ padding: '11px 14px', borderRadius: 10, fontSize: 13, border: '1.5px solid rgba(0,0,0,.12)', background: 'none', cursor: 'pointer', color: '#e24b4a', fontWeight: 600 }}>
              Clear
            </button>
          )}
        </div>

        <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>
          Your key is stored only on this device and sent directly to the AI provider via our proxy.{' '}
          <a href={providerInfo.link} target="_blank" rel="noopener noreferrer" style={{ color: '#1d9e75' }}>
            Get a {providerInfo.label} key →
          </a>
        </div>
      </div>

      {onLoadPerf && <div style={{ height: '0.5px', background: 'rgba(0,0,0,.08)', margin: '20px 0 0' }} />}
      {onLoadPerf && <PerfPanel onLoadPerf={onLoadPerf} />}

      <div style={{ height: '0.5px', background: 'rgba(0,0,0,.08)', margin: '20px 0 0' }} />

      {/* Data */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 14 }}>Data</div>
        <button onClick={exportCSV} disabled={logs.length === 0}
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', background: '#f0f0ea', cursor: logs.length ? 'pointer' : 'not-allowed', opacity: logs.length ? 1 : 0.45, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
          <i className="ti ti-download" />Export meals to CSV
        </button>
        <label style={{ width: '100%', display: 'block', marginBottom: 10 }}>
          <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={importCSV} />
          <div style={{ width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: '1.5px solid rgba(0,0,0,.12)', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', boxSizing: 'border-box' }}>
            <i className="ti ti-upload" />Import meals from CSV
          </div>
        </label>
        {importMsg && <p style={{ fontSize: 12, color: '#1d9e75', textAlign: 'center', marginTop: 4 }}>{importMsg}</p>}
      </div>

      <div style={{ height: '0.5px', background: 'rgba(0,0,0,.08)', margin: '20px 0 0' }} />

      {/* Account */}
      <div style={{ padding: '20px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 14 }}>Account</div>
        <button onClick={() => supabase.auth.signOut()}
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: '1.5px solid rgba(0,0,0,.12)', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', color: '#e24b4a' }}>
          <i className="ti ti-logout" />Sign out
        </button>
      </div>
    </div>
  );
}
