import React, { useState } from 'react';

const TOKEN_KEY = 'ns_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export default function AuthGate({ children }) {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem(TOKEN_KEY));
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        localStorage.setItem(TOKEN_KEY, password);
        setAuthed(true);
      } else {
        setError('Wrong password.');
      }
    } catch {
      setError('Could not reach server.');
    } finally {
      setLoading(false);
    }
  }

  if (authed) return children;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh', gap: 24,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🥗</div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5 }}>NutriSnap</div>
        <div style={{ fontSize: 14, color: '#888', marginTop: 4 }}>AI nutrition tracker</div>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 240 }}>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{
            padding: '12px 16px', borderRadius: 10, border: '1.5px solid #ddd',
            fontSize: 16, outline: 'none',
          }}
        />
        {error && <div style={{ color: '#e24b4a', fontSize: 13, textAlign: 'center' }}>{error}</div>}
        <button
          type="submit"
          disabled={loading || !password}
          style={{
            background: '#1d9e75', color: '#fff', border: 'none',
            borderRadius: 12, padding: '14px', fontSize: 16,
            fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
