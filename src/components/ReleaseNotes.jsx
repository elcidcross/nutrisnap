import React, { useState, useEffect } from 'react';
import RELEASE_NOTES, { CURRENT_VERSION } from '../releaseNotes';

// "What's new" — a header button (top-right bell) that opens a panel of release
// notes. A small dot marks the button when the newest release hasn't been opened
// yet; opening the panel clears it. The "seen" version is remembered in
// localStorage so the dot only reappears after a genuinely new release.
const SEEN_KEY = 'nutrisnap_release_notes_seen';

export default function ReleaseNotes({ accent = '#1d9e75' }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => {
    try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
  });

  const hasUnseen = seen !== CURRENT_VERSION;

  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem(SEEN_KEY, CURRENT_VERSION); } catch {}
    setSeen(CURRENT_VERSION);
  }, [open]);

  // Close on Escape while the panel is open.
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="What's new" title="What's new"
        style={{ position: 'relative', background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1 }}>
        <i className="ti ti-bell" aria-hidden="true" />
        {hasUnseen && (
          <span aria-hidden="true" style={{
            position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%',
            background: '#e24b4a', border: '1.5px solid #fff',
          }} />
        )}
      </button>

      {open && (
        <div onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="What's new"
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 430, background: '#fff',
              borderTopLeftRadius: 20, borderTopRightRadius: 20,
              maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 -8px 32px rgba(0,0,0,.25)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 20px 12px', borderBottom: '0.5px solid rgba(0,0,0,.08)',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>What’s new</div>
              <button onClick={() => setOpen(false)} aria-label="Close"
                style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1 }}>
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: '4px 20px 24px' }}>
              {RELEASE_NOTES.map((rel, i) => (
                <div key={rel.version} style={{ paddingTop: 18, paddingBottom: i < RELEASE_NOTES.length - 1 ? 18 : 0, borderBottom: i < RELEASE_NOTES.length - 1 ? '0.5px solid rgba(0,0,0,.06)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 800, color: accent,
                      background: `${accent}14`, borderRadius: 999, padding: '2px 9px',
                    }}>v{rel.version}</span>
                    <span style={{ fontSize: 12, color: '#999' }}>{rel.date}</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {rel.notes.map((n, j) => (
                      <li key={j} style={{ fontSize: 13.5, lineHeight: 1.55, color: '#333' }}>{n}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
