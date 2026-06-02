import React from 'react';
import AppSwitcher from './AppSwitcher';

// Shared screen chrome for every app: the centered phone-width container, the
// sticky header (with the app-switcher title), the scrollable content, and either
// a NutriSnap-style bottom tab nav (`tabs`) or a single floating add button (`fab`).
// Reproduces the original NutriSnap header/nav exactly so the nutrition app stays
// visually identical; the accent color is now per-app.
export default function AppShell({
  apps, activeApp, onSwitch, accent = '#1d9e75',
  title, subtitle, headerRight,
  tabs, activeTab, onTabChange,
  fab,
  children,
}) {
  return (
    <div style={{
      maxWidth: 430, margin: '0 auto', minHeight: '100dvh',
      background: '#fff', display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(0,0,0,.1)',
        paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div>
          <AppSwitcher title={title} apps={apps} activeApp={activeApp} onSwitch={onSwitch} accent={accent} />
          {subtitle && <div style={{ fontSize: 12, color: '#888', marginTop: 1 }}>{subtitle}</div>}
        </div>
        {headerRight}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(110px + env(safe-area-inset-bottom))' }}>
        {children}
      </div>

      {/* Floating add button (single-view apps) */}
      {fab && (
        <div style={{
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 430, pointerEvents: 'none', zIndex: 20,
        }}>
          <button onClick={fab.onClick} aria-label={fab.label}
            style={{
              position: 'absolute', right: 20, bottom: 'calc(24px + env(safe-area-inset-bottom))',
              width: 56, height: 56, borderRadius: '50%', background: accent, border: 'none',
              color: '#fff', fontSize: 26, cursor: 'pointer', pointerEvents: 'auto',
              boxShadow: `0 4px 16px ${accent}59`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <i className={`ti ${fab.icon}`} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Bottom tab nav (multi-tab apps, e.g. NutriSnap) */}
      {tabs && tabs.length > 0 && (
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
            {tabs.map(t => (
              <button key={t.id} onClick={() => onTabChange(t.id)}
                aria-current={activeTab === t.id ? 'page' : undefined}
                style={{
                  flex: 1, padding: t.fab ? '0 8px 16px' : '12px 8px 16px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  border: 'none', background: 'none', cursor: 'pointer',
                  color: activeTab === t.id ? accent : '#aaa', fontSize: 10, fontWeight: 600,
                  transition: 'color .15s',
                }}>
                {t.fab ? (
                  <div style={{
                    width: 54, height: 54, borderRadius: '50%', background: accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 24, boxShadow: `0 2px 12px ${accent}59`,
                    transition: 'transform .15s', transform: activeTab === t.id ? 'scale(.93)' : 'scale(1)',
                  }} aria-hidden="true">
                    <i className={`ti ${t.icon}`} />
                  </div>
                ) : (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <i className={`ti ${t.icon}`} style={{ fontSize: 22 }} aria-hidden="true" />
                    {t.badge && (
                      <span style={{
                        position: 'absolute', top: -2, right: -3, width: 7, height: 7,
                        borderRadius: '50%', background: '#e24b4a', border: '1.5px solid #fff',
                      }} aria-label="Alert" />
                    )}
                  </div>
                )}
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
