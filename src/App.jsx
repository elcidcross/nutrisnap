import React, { useState, useEffect, useMemo } from 'react';
import LogView from './components/LogView';
import SnapView from './components/SnapView';
import ReportView from './components/ReportView';
import SettingsView from './components/SettingsView';
import { load, save, KEYS, DEFAULT_GOALS, DEFAULT_NOTIF } from './utils/storage';
import { todayStr } from './utils/date';

export default function App() {
  const [tab, setTab] = useState('log');
  const [logs, setLogs] = useState(() => load(KEYS.LOGS, []));
  const [goals, setGoals] = useState(() => load(KEYS.GOALS, DEFAULT_GOALS));
  const [notif, setNotif] = useState(() => load(KEYS.NOTIF, DEFAULT_NOTIF));

  useEffect(() => save(KEYS.LOGS, logs), [logs]);

  const todayTotals = useMemo(() => {
    return logs
      .filter(l => new Date(l.timestamp).toDateString() === todayStr())
      .reduce((a, l) => ({
        calories: a.calories + (l.calories || 0),
        protein: a.protein + (l.protein || 0),
        carbs: a.carbs + (l.carbs || 0),
        fat: a.fat + (l.fat || 0),
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  }, [logs]);

  const hasAlert = notif.nudgeEnabled && (
    goals.protein - todayTotals.protein > 10 ||
    goals.calories - todayTotals.calories > 200
  );

  // Scheduled push notifications (fires once per minute check)
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !notif.enabled) return;
    const interval = setInterval(() => {
      const now = new Date();
      const cur = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      notif.times.forEach(t => {
        if (t === cur) {
          const rem = Math.max(0, Math.round(goals.calories - todayTotals.calories));
          new Notification('NutriSnap', {
            body: rem > 0 ? `${rem} kcal left to reach your goal today!` : "You've hit your calorie goal today! 🎉",
            icon: '/icon-192.png',
            tag: 'nutrisnap-reminder',
          });
        }
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [notif, goals, todayTotals]);

  const TABS = [
    { id: 'log', icon: 'ti-list', label: 'Log' },
    { id: 'snap', icon: 'ti-camera', label: 'Snap', fab: true },
    { id: 'report', icon: 'ti-chart-bar', label: 'Report' },
    { id: 'settings', icon: 'ti-target', label: 'Goals', badge: hasAlert },
  ];

  const TITLES = { log: 'NutriSnap', snap: 'Log a meal', report: 'Reports', settings: 'Goals & settings' };
  const SUBS = { log: "Today's meals", snap: '', report: 'Your intake overview', settings: '' };

  return (
    <div style={{
      maxWidth: 430, margin: '0 auto', minHeight: '100dvh',
      background: '#fff', display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      <h1 className="sr-only">NutriSnap – AI nutrition tracker</h1>

      {/* Header */}
      <div style={{
        padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(0,0,0,.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>{TITLES[tab]}</div>
          {SUBS[tab] && <div style={{ fontSize: 12, color: '#888', marginTop: 1 }}>{SUBS[tab]}</div>}
        </div>
        {tab === 'snap' && (
          <button onClick={() => setTab('log')} aria-label="Close"
            style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer', padding: 4 }}>
            <i className="ti ti-x" />
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
        {tab === 'log' && <LogView logs={logs} goals={goals} onDelete={id => setLogs(p => p.filter(l => l.id !== id))} />}
        {tab === 'snap' && <SnapView onSaved={entry => { setLogs(p => [entry, ...p]); setTab('log'); }} />}
        {tab === 'report' && <ReportView logs={logs} goals={goals} />}
        {tab === 'settings' && <SettingsView goals={goals} setGoals={setGoals} notif={notif} setNotif={setNotif} />}
      </div>

      {/* Bottom nav */}
      <nav style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430, background: '#fff',
        borderTop: '0.5px solid rgba(0,0,0,.1)', display: 'flex', zIndex: 20,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }} aria-label="Main navigation">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            style={{
              flex: 1, padding: t.fab ? '0 8px 16px' : '12px 8px 16px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              border: 'none', background: 'none', cursor: 'pointer',
              color: tab === t.id ? '#1d9e75' : '#aaa', fontSize: 10, fontWeight: 600,
              transition: 'color .15s',
            }}>
            {t.fab ? (
              <div style={{
                width: 54, height: 54, borderRadius: '50%', background: '#1d9e75',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 24, boxShadow: '0 2px 12px rgba(29,158,117,.35)',
                transition: 'transform .15s', transform: tab === 'snap' ? 'scale(.93)' : 'scale(1)',
              }} aria-hidden="true">
                <i className="ti ti-camera" />
              </div>
            ) : (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <i className={`ti ${t.icon}`} style={{ fontSize: 22 }} aria-hidden="true" />
                {t.badge && (
                  <span style={{
                    position: 'absolute', top: -2, right: -3, width: 7, height: 7,
                    borderRadius: '50%', background: '#e24b4a',
                    border: '1.5px solid #fff',
                  }} aria-label="Nudge available" />
                )}
              </div>
            )}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
