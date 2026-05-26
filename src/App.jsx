import React, { useState, useEffect, useMemo } from 'react';
import LockScreen from './components/LockScreen';
import LogView from './components/LogView';
import SnapView from './components/SnapView';
import ReportView from './components/ReportView';
import SettingsView from './components/SettingsView';
import { supabase } from './utils/supabase';
import { getLogs, getLogImages, addLog, updateLog, deleteLog, bulkAddLogs, getGoals, saveGoals, getGoalsHistory, addGoalsHistoryEntry, getNotifSettings, saveNotifSettings, getFoodLibrary, saveFoodToLibrary, updateFoodInLibrary, DEFAULT_GOALS, DEFAULT_NOTIF } from './utils/db';
import { todayStr } from './utils/date';

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [tab, setTab] = useState('log');
  const [logs, setLogs] = useState([]);
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [goalsHistory, setGoalsHistory] = useState([]);
  const [notif, setNotif] = useState(DEFAULT_NOTIF);
  const [foodLibrary, setFoodLibrary] = useState([]);

  // Auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load data when user logs in
  useEffect(() => {
    if (!user) {
      setLogs([]); setGoals(DEFAULT_GOALS); setGoalsHistory([]); setNotif(DEFAULT_NOTIF); setFoodLibrary([]);
      return;
    }
    setDataLoading(true);
    Promise.all([
      getLogs(user.id),
      getGoals(user.id),
      getGoalsHistory(user.id),
      getNotifSettings(user.id),
      getFoodLibrary(user.id),
    ]).then(([l, g, gh, n, fl]) => {
      setLogs(l);
      setGoals(g);
      setGoalsHistory(gh.length ? gh : [{ timestamp: 0, ...g }]);
      setNotif(n);
      setFoodLibrary(fl);
      // Backfill thumbnails off the critical path: the UI is already usable
      // with imageless logs; merge images in by id once they arrive. New logs
      // added meanwhile already carry their own thumbnail, so only overwrite
      // ids present in the fetched set.
      getLogImages(user.id).then(imgs => {
        const map = new Map(imgs.map(r => [r.id, r.image_url || null]));
        setLogs(prev => prev.map(x => map.has(x.id) ? { ...x, imageUrl: map.get(x.id) } : x));
      }).catch(console.error);
    }).catch(console.error).finally(() => setDataLoading(false));
  }, [user]);

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

  // Scheduled push notifications
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !notif.enabled) return;
    const interval = setInterval(() => {
      const now = new Date();
      const cur = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      notif.times.forEach(t => {
        if (t === cur) {
          const rem = Math.max(0, Math.round(goals.calories - todayTotals.calories));
          new Notification('NutriSnap', {
            body: rem > 0 ? `${rem} kcal left to reach your goal today!` : "You've hit your calorie goal today!",
            icon: '/icon-192.png',
            tag: 'nutrisnap-reminder',
          });
        }
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [notif, goals, todayTotals]);

  const handleAddLog = (entry) => {
    setLogs(p => [entry, ...p]);
    addLog(user.id, entry).catch(console.error);
  };

  const handleDeleteLog = (id) => {
    setLogs(p => p.filter(l => l.id !== id));
    deleteLog(user.id, id).catch(console.error);
  };

  const handleEditLog = (id, updates) => {
    setLogs(p => p.map(l => l.id === id ? { ...l, ...updates } : l));
    updateLog(user.id, id, updates).catch(console.error);
  };

  const handleGoalSave = (field, val) => {
    const newGoals = { ...goals, [field]: val };
    setGoals(newGoals);
    saveGoals(user.id, newGoals).catch(console.error);
    const snap = { timestamp: Date.now(), ...newGoals };
    setGoalsHistory(p => [...p, snap]);
    addGoalsHistoryEntry(user.id, snap).catch(console.error);
  };

  const handleNotifChange = (patch) => {
    const newNotif = { ...notif, ...patch };
    setNotif(newNotif);
    saveNotifSettings(user.id, newNotif).catch(console.error);
  };

  const handleSaveToLibrary = (entry) => {
    setFoodLibrary(p => {
      const idx = p.findIndex(f => f.name.toLowerCase() === entry.name.toLowerCase());
      return idx >= 0 ? p.map((f, i) => i === idx ? { ...f, ...entry } : f) : [...p, entry];
    });
    saveFoodToLibrary(user.id, entry).catch(console.error);
  };

  const handleUpdateLibrary = (name, macros) => {
    setFoodLibrary(p => p.map(f => f.name.toLowerCase() === name.toLowerCase() ? { ...f, ...macros } : f));
    updateFoodInLibrary(user.id, name, macros).catch(console.error);
  };

  const handleImport = (entries) => {
    const existingIds = new Set(logs.map(l => l.id));
    const toAdd = entries.filter(e => !existingIds.has(e.id));
    setLogs(p => [...p, ...toAdd].sort((a, b) => b.timestamp - a.timestamp));
    bulkAddLogs(user.id, toAdd).catch(console.error);
  };

  if (authLoading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e0f5ed', borderTopColor: '#1d9e75', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!user) return <LockScreen />;

  if (dataLoading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e0f5ed', borderTopColor: '#1d9e75', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <p style={{ fontSize: 14, color: '#888' }}>Loading your data…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

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
      maxWidth: 430, margin: '0 auto', height: '100dvh', overflow: 'hidden',
      background: '#fff', display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      <h1 className="sr-only">NutriSnap – AI nutrition tracker</h1>

      {/* Header */}
      <div style={{
        padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(0,0,0,.1)',
        paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
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
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 'calc(110px + env(safe-area-inset-bottom))' }}>
        {tab === 'log' && <LogView logs={logs} goals={goals} onDelete={handleDeleteLog} onEdit={handleEditLog} />}
        {tab === 'snap' && <SnapView logs={logs} foodLibrary={foodLibrary} onSaved={entry => { handleAddLog(entry); setTab('log'); }} onSaveToLibrary={handleSaveToLibrary} onUpdateLibrary={handleUpdateLibrary} />}
        {tab === 'report' && <ReportView logs={logs} goalsHistory={goalsHistory} />}
        {tab === 'settings' && (
          <SettingsView
            goals={goals}
            notif={notif}
            goalsHistory={goalsHistory}
            logs={logs}
            onGoalSave={handleGoalSave}
            onNotifChange={handleNotifChange}
            onImport={handleImport}
          />
        )}
      </div>

      {/* Bottom nav */}
      <nav style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430, background: '#fff',
        borderTop: '0.5px solid rgba(0,0,0,.1)', display: 'flex', flexDirection: 'column',
        zIndex: 20, paddingBottom: 'env(safe-area-inset-bottom)',
      }} aria-label="Main navigation">
        <div style={{ textAlign: 'center', fontSize: 10, color: '#aaa', padding: '3px 0 0', fontWeight: 500 }}>
          v{process.env.REACT_APP_VERSION || '0.0.0'} · {process.env.REACT_APP_BUILD_TIME || 'dev'}
        </div>
        <div style={{ display: 'flex' }}>
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
        </div>
      </nav>
    </div>
  );
}
