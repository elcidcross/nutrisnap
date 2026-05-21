import React, { useState } from 'react';
import { supabase } from '../utils/supabase';

export default function LockScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    setInfo('');

    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) setError(err.message);
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) {
          setError(err.message);
        } else if (!data.session) {
          // Email confirmation required
          setInfo('Check your email for a confirmation link, then log in.');
          setMode('login');
        }
        // If data.session exists, onAuthStateChange in App.jsx handles the redirect
      }
    } catch {
      setError('Could not reach the server. Are you online?');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#fff', padding: 32,
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: 22, background: '#e1f5ee',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
      }}>
        <i className="ti ti-leaf" style={{ fontSize: 38, color: '#1d9e75' }} aria-hidden="true" />
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, letterSpacing: -0.5 }}>NutriSnap</h1>
      <p style={{ fontSize: 14, color: '#888', marginBottom: 32, textAlign: 'center', lineHeight: 1.6, maxWidth: 280 }}>
        {mode === 'login' ? 'Sign in to sync your meals across devices.' : 'Create an account to get started.'}
      </p>

      <form onSubmit={submit} style={{ width: '100%', maxWidth: 320 }}>
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError(''); }}
          placeholder="Email"
          autoFocus
          autoComplete="email"
          style={{
            width: '100%', padding: '14px 16px', fontSize: 16,
            border: `1.5px solid ${error ? '#e24b4a' : '#ddd'}`,
            borderRadius: 12, outline: 'none', marginBottom: 10,
            background: '#fafaf8', color: 'inherit', boxSizing: 'border-box',
          }}
        />
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(''); }}
          placeholder="Password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          style={{
            width: '100%', padding: '14px 16px', fontSize: 16,
            border: `1.5px solid ${error ? '#e24b4a' : '#ddd'}`,
            borderRadius: 12, outline: 'none', marginBottom: 12,
            background: '#fafaf8', color: 'inherit', boxSizing: 'border-box',
          }}
        />

        {error && (
          <div style={{ fontSize: 13, color: '#e24b4a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-alert-circle" style={{ fontSize: 15 }} />{error}
          </div>
        )}
        {info && (
          <div style={{ fontSize: 13, color: '#1d9e75', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-check" style={{ fontSize: 15 }} />{info}
          </div>
        )}

        <button type="submit" disabled={loading || !email.trim() || !password.trim()} style={{
          width: '100%', padding: 14, borderRadius: 12, fontSize: 15, fontWeight: 700,
          border: 'none', background: '#1d9e75', color: '#fff', cursor: 'pointer',
          opacity: loading || !email.trim() || !password.trim() ? 0.55 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginBottom: 16,
        }}>
          {loading
            ? <><span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />{mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
            : <><i className={`ti ${mode === 'login' ? 'ti-arrow-right' : 'ti-user-plus'}`} />{mode === 'login' ? 'Sign in' : 'Create account'}</>
          }
        </button>

        <button type="button" onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); }}
          style={{ width: '100%', background: 'none', border: 'none', fontSize: 13, color: '#888', cursor: 'pointer', padding: 4 }}>
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </form>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
