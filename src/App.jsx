import React, { useState, useEffect } from 'react';
import LockScreen from './components/LockScreen';
import { supabase } from './utils/supabase';
import { APPS, APP_IDS } from './apps/registry';

// Multi-app shell. Owns only cross-app concerns: auth and which app is active.
// Every app stays mounted (so switching back is instant and NutriSnap's reminder
// timer keeps running app-wide); each app renders null when it isn't the active one.
const ACTIVE_APP_KEY = 'nutrisnap_active_app';

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeApp, setActiveApp] = useState(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_APP_KEY);
      if (saved && APP_IDS.includes(saved)) return saved;
    } catch { /* ignore */ }
    return 'nutrisnap';
  });

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

  const switchApp = (id) => {
    setActiveApp(id);
    try { localStorage.setItem(ACTIVE_APP_KEY, id); } catch { /* ignore */ }
  };

  if (authLoading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e0f5ed', borderTopColor: '#1d9e75', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!user) return <LockScreen />;

  return (
    <>
      <h1 className="sr-only">NutriSnap – AI nutrition & wellness tracker</h1>
      {APPS.map(app => {
        const AppComponent = app.Component;
        return (
          <AppComponent key={app.id} user={user} active={app.id === activeApp}
            apps={APPS} activeApp={activeApp} onSwitch={switchApp} />
        );
      })}
    </>
  );
}
