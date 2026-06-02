import React, { useState, useEffect, useMemo, useRef } from 'react';
import AppShell from '../components/AppShell';
import LogView from '../components/LogView';
import SnapView from '../components/SnapView';
import ReportView from '../components/ReportView';
import SettingsView from '../components/SettingsView';
import { getLogs, getLogImages, addLog, updateLog, deleteLog, bulkAddLogs, getGoals, saveGoals, getGoalsHistory, addGoalsHistoryEntry, getNotifSettings, saveNotifSettings, getFoodLibrary, saveFoodToLibrary, updateFoodInLibrary, DEFAULT_GOALS, DEFAULT_NOTIF } from '../utils/db';
import { todayStr } from '../utils/date';

const ACCENT = '#1d9e75';

// The original NutriSnap nutrition tracker, now one app inside the multi-app shell.
// Behavior is unchanged: same 4 tabs, same single-tap camera FAB (the 'snap' tab),
// same optimistic writes. Only the surrounding chrome moved into AppShell and the
// header title became the app switcher.
export default function NutriSnapApp({ user, active, apps, activeApp, onSwitch }) {
  const [dataLoading, setDataLoading] = useState(true);
  const [tab, setTab] = useState('log');
  const [logs, setLogs] = useState([]);
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [goalsHistory, setGoalsHistory] = useState([]);
  const [notif, setNotif] = useState(DEFAULT_NOTIF);
  const [foodLibrary, setFoodLibrary] = useState([]);
  const loadedRef = useRef(false);

  // Load on first activation (NutriSnap is the default app, so this runs on mount).
  // The 5 queries run in parallel; getLogs excludes image_url and getLogImages
  // backfills thumbnails by id after first paint.
  useEffect(() => {
    if (!active || loadedRef.current) return;
    loadedRef.current = true;
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
      getLogImages(user.id).then(imgs => {
        const map = new Map(imgs.map(r => [r.id, r.image_url || null]));
        setLogs(prev => prev.map(x => map.has(x.id) ? { ...x, imageUrl: map.get(x.id) } : x));
      }).catch(console.error);
    }).catch(console.error).finally(() => setDataLoading(false));
  }, [active, user.id]);

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

  // Scheduled push notifications (run regardless of which app is active, so
  // reminders still fire when the user is in another app — the component stays
  // mounted across app switches).
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

  const handleRelog = (entry) => {
    handleAddLog({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      timestamp: Date.now(),
      name: entry.name,
      imageUrl: entry.imageUrl,
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
      fiber: entry.fiber || 0,
      amount: entry.amount ?? null,
      unit: entry.unit ?? null,
      refAmount: entry.refAmount ?? null,
      refUnit: entry.refUnit ?? null,
    });
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

  if (!active) return null;

  if (dataLoading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e0f5ed', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
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

  const headerRight = tab === 'snap' ? (
    <button onClick={() => setTab('log')} aria-label="Close"
      style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer', padding: 4 }}>
      <i className="ti ti-x" />
    </button>
  ) : null;

  return (
    <AppShell apps={apps} activeApp={activeApp} onSwitch={onSwitch} accent={ACCENT}
      title={TITLES[tab]} subtitle={SUBS[tab]} headerRight={headerRight}
      tabs={TABS} activeTab={tab} onTabChange={setTab}>
      {tab === 'log' && <LogView logs={logs} goals={goals} onDelete={handleDeleteLog} onEdit={handleEditLog} onRelog={handleRelog} />}
      {tab === 'snap' && <SnapView foodLibrary={foodLibrary} onSaved={entry => { handleAddLog(entry); setTab('log'); }} onSaveToLibrary={handleSaveToLibrary} onUpdateLibrary={handleUpdateLibrary} />}
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
    </AppShell>
  );
}
