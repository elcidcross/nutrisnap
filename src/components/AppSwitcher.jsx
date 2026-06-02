import React, { useState, useEffect, useRef } from 'react';

// The header title doubles as an app switcher: tapping it opens a dropdown of the
// installed "apps" (NutriSnap, Jog, Workout, …). Selecting one swaps the whole UI.
// Kept deliberately self-contained so a swipe-to-switch gesture can be added later
// without touching individual apps.
export default function AppSwitcher({ title, apps, activeApp, onSwitch, accent = '#1d9e75' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>{title}</span>
        <i className="ti ti-chevron-down" aria-hidden="true"
          style={{ fontSize: 15, color: '#bbb', transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div role="menu" style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, minWidth: 210,
          background: '#fff', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.18)',
          border: '0.5px solid rgba(0,0,0,.08)', overflow: 'hidden', zIndex: 50,
        }}>
          {apps.map(app => {
            const isActive = app.id === activeApp;
            return (
              <button key={app.id} role="menuitem" onClick={() => { setOpen(false); if (!isActive) onSwitch(app.id); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px',
                  border: 'none', background: isActive ? '#f5f5f0' : 'transparent', cursor: 'pointer', textAlign: 'left',
                }}>
                <i className={`ti ${app.icon}`} aria-hidden="true" style={{ fontSize: 19, color: app.accent, width: 22, textAlign: 'center' }} />
                <span style={{ fontSize: 15, fontWeight: 600, flex: 1, color: 'inherit' }}>{app.name}</span>
                {isActive && <i className="ti ti-check" aria-hidden="true" style={{ fontSize: 16, color: app.accent }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
