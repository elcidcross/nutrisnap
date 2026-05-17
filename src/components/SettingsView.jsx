import React from 'react';
import { save, KEYS } from '../utils/storage';

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

export default function SettingsView({ goals, setGoals, notif, setNotif }) {
  const saveGoal = (field, val) => { const g = { ...goals, [field]: val }; setGoals(g); save(KEYS.GOALS, g); };
  const updateNotif = patch => { const n = { ...notif, ...patch }; setNotif(n); save(KEYS.NOTIF, n); };

  const requestAndEnable = async () => {
    if (!('Notification' in window)) { alert('This browser does not support notifications.'); return; }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') updateNotif({ enabled: true });
    else alert('Notification permission denied. Please enable it in your device settings.');
  };

  const timeOptions = Array.from({ length: 24 }, (_, h) => [`${h}:00`, `${h}:30`]).flat()
    .map(v => ({ value: v.padStart(5, '0'), label: new Date('2000-01-01T' + v.padStart(5, '0')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }));

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* Goals */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 14 }}>Daily nutrition goals</div>
        <GoalRow color={COLORS.cal} label="Calories" field="calories" goals={goals} unit="kcal" onSave={saveGoal} />
        <GoalRow color={COLORS.protein} label="Protein" field="protein" goals={goals} unit="g" onSave={saveGoal} />
        <GoalRow color={COLORS.carbs} label="Carbs" field="carbs" goals={goals} unit="g" onSave={saveGoal} />
        <GoalRow color={COLORS.fat} label="Fat" field="fat" goals={goals} unit="g" onSave={saveGoal} />
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
          <Toggle on={notif.enabled} onToggle={() => notif.enabled ? updateNotif({ enabled: false }) : requestAndEnable()} label="Toggle reminders" />
        </div>

        {notif.enabled && (
          <div style={{ paddingTop: 12, paddingBottom: 4 }}>
            {notif.times.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <i className="ti ti-clock" style={{ fontSize: 16, color: '#aaa' }} aria-hidden="true" />
                <select value={t} onChange={e => { const times = [...notif.times]; times[i] = e.target.value; updateNotif({ times }); }}
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
          <Toggle on={notif.nudgeEnabled} onToggle={() => updateNotif({ nudgeEnabled: !notif.nudgeEnabled })} label="Toggle AI nudges" />
        </div>
      </div>

      {/* Info box */}
      <div style={{ margin: '20px 16px 0', background: '#f5f5f0', borderRadius: 12, padding: 14, fontSize: 13, color: '#777', lineHeight: 1.65 }}>
        <i className="ti ti-info-circle" style={{ fontSize: 15, marginRight: 6, verticalAlign: -2 }} aria-hidden="true" />
        Nudges are generated by Claude AI based on your gap to daily goals. The more you log, the smarter the advice gets.
      </div>
    </div>
  );
}
