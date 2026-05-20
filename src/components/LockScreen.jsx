import React, { useState } from 'react';

export default function LockScreen({ onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const attempt = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _password: password, _authOnly: true }),
      });

      if (res.status === 401) {
        setError('Wrong password. Try again.');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError('Server error. Try again later.');
        setLoading(false);
        return;
      }

      // Password is correct — persist it and unlock
      localStorage.setItem('nutrisnap_auth', password);
      onUnlock();
    } catch {
      setError('Could not reach the server. Are you online?');
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#fff', padding: 32,
    }}>
      {/* Icon */}
      <div style={{
        width: 80, height: 80, borderRadius: 22, background: '#e1f5ee',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
      }}>
        <i className="ti ti-lock" style={{ fontSize: 38, color: '#1d9e75' }} aria-hidden="true" />
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, letterSpacing: -0.5 }}>NutriSnap</h1>
      <p style={{ fontSize: 14, color: '#888', marginBottom: 32, textAlign: 'center', lineHeight: 1.6, maxWidth: 280 }}>
        Enter your app password to continue.
      </p>

      <form onSubmit={attempt} style={{ width: '100%', maxWidth: 320 }}>
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(''); }}
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          style={{
            width: '100%', padding: '14px 16px', fontSize: 16,
            border: `1.5px solid ${error ? '#e24b4a' : '#ddd'}`,
            borderRadius: 12, outline: 'none', marginBottom: 12,
            transition: 'border-color .15s', background: '#fafaf8', color: 'inherit',
          }}
          onFocus={e => { if (!error) e.target.style.borderColor = '#1d9e75'; }}
          onBlur={e => { if (!error) e.target.style.borderColor = '#ddd'; }}
        />

        {error && (
          <div style={{ fontSize: 13, color: '#e24b4a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-alert-circle" style={{ fontSize: 15 }} />{error}
          </div>
        )}

        <button type="submit" disabled={loading || !password.trim()} style={{
          width: '100%', padding: 14, borderRadius: 12, fontSize: 15, fontWeight: 700,
          border: 'none', background: '#1d9e75', color: '#fff', cursor: 'pointer',
          opacity: loading || !password.trim() ? 0.55 : 1, transition: 'opacity .15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {loading
            ? <><span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} /> Checking…</>
            : <><i className="ti ti-arrow-right" />Unlock</>
          }
        </button>
      </form>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
