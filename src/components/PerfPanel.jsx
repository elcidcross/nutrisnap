import React, { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

// One analysis decomposes into four non-overlapping segments that sum to the
// user's total wait (encode + client_ms):
//   encode    — client-side JPEG encode before upload
//   network   — client_ms - server_ms: upload + download + cold start + queue
//   inference — upstream_ms: time the proxy waited on the AI provider
//   proxy     — server_ms - upstream_ms: JWT auth + proxy overhead
const SEGS = [
  { key: 'encode', label: 'Encode', color: '#ba7517' },
  { key: 'network', label: 'Upload + network', color: '#378add' },
  { key: 'inference', label: 'AI inference', color: '#d4537e' },
  { key: 'proxy', label: 'Proxy', color: '#888888' },
];

const DAY = 86400000;

function segments(r) {
  const encode = r.encode_ms || 0;
  const network = r.network_ms != null ? Math.max(0, r.network_ms) : 0;
  const inference = r.upstream_ms || 0;
  const proxy = (r.server_ms != null && r.upstream_ms != null) ? Math.max(0, r.server_ms - r.upstream_ms) : 0;
  return { encode, network, inference, proxy, total: encode + network + inference + proxy };
}

function pct(values, p) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[i];
}

const fmtMs = ms => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
const fmtKb = b => b == null ? '—' : b >= 1024 * 1024 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`;

function Stat({ label, value, sub }) {
  return (
    <div style={{ flex: 1, background: '#f5f5f0', borderRadius: 10, padding: '10px 12px', border: '0.5px solid rgba(0,0,0,.07)' }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: '#aaa', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

export default function PerfPanel({ onLoadPerf }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const load = () => {
    setLoading(true);
    setErr(null);
    onLoadPerf()
      .then(setRows)
      .catch(e => setErr(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };

  // Lazy: only query when the section is first expanded.
  useEffect(() => { if (open && rows === null && !loading) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-day stacked trend: average each segment across that day's successful calls.
  useEffect(() => {
    if (!open || !canvasRef.current || !rows) return;
    const ok = rows.filter(r => r.success && r.client_ms != null);
    const byDay = new Map();
    ok.forEach(r => {
      const day = new Date(r.created_at); day.setHours(0, 0, 0, 0);
      const k = day.getTime();
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(segments(r));
    });
    const days = [...byDay.keys()].sort((a, b) => a - b).slice(-14);
    const avg = (segs, key) => segs.reduce((s, x) => s + x[key], 0) / segs.length;
    const labels = days.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const datasets = SEGS.map(seg => ({
      label: seg.label,
      data: days.map(d => Math.round(avg(byDay.get(d), seg.key))),
      backgroundColor: seg.color,
      stack: 'wait',
      borderWidth: 0,
    }));
    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtMs(c.parsed.y)}` } } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 9 } } },
          y: { stacked: true, ticks: { font: { size: 9 }, callback: v => `${Math.round(v / 100) / 10}s` }, grid: { color: 'rgba(0,0,0,.05)' } },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [rows, open]);

  const section = (
    <div style={{ padding: '20px 16px 0' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.6px' }}>AI performance</span>
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ color: '#aaa', fontSize: 16 }} />
      </button>
      {open && renderBody()}
    </div>
  );

  function renderBody() {
    if (loading) return <p style={{ fontSize: 13, color: '#888', marginTop: 14 }}>Loading…</p>;
    if (err) return <p style={{ fontSize: 13, color: '#e24b4a', marginTop: 14 }}>{err} <button onClick={load} style={{ background: 'none', border: 'none', color: '#1d9e75', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button></p>;
    if (!rows || rows.length === 0) return <p style={{ fontSize: 13, color: '#888', marginTop: 14, lineHeight: 1.6 }}>No analyses recorded yet. Snap or describe a meal and timings will appear here.</p>;

    const ok = rows.filter(r => r.success && r.client_ms != null);
    const totals = ok.map(r => segments(r).total);
    const failRate = Math.round((1 - ok.length / rows.length) * 100);
    // Average each segment across all successful calls to find the dominant cost.
    const segAvg = SEGS.map(seg => ({ ...seg, ms: ok.length ? ok.reduce((s, r) => s + segments(r)[seg.key], 0) / ok.length : 0 }));
    const grandAvg = segAvg.reduce((s, x) => s + x.ms, 0) || 1;
    const bottleneck = [...segAvg].sort((a, b) => b.ms - a.ms)[0];
    const retried = rows.filter(r => (r.attempts || 1) > 1).length;
    const recent = ok.slice(0, 12); // already DESC by created_at
    const maxTotal = Math.max(...recent.map(r => segments(r).total), 1);

    return (
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Stat label="median wait" value={fmtMs(pct(totals, 50))} sub={`p90 ${fmtMs(pct(totals, 90))}`} />
          <Stat label="analyses" value={rows.length} sub={`${failRate}% failed`} />
          <Stat label="retried" value={retried} sub={retried ? 'slow/transient' : 'none'} />
        </div>

        {/* Where the time goes, on average */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 6 }}>
          Bottleneck: <span style={{ color: bottleneck.color }}>{bottleneck.label}</span> ({Math.round((bottleneck.ms / grandAvg) * 100)}% of avg wait)
        </div>
        <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
          {segAvg.map(s => s.ms > 0 && (
            <div key={s.key} title={`${s.label}: ${fmtMs(s.ms)}`} style={{ width: `${(s.ms / grandAvg) * 100}%`, background: s.color }} />
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 18 }}>
          {segAvg.map(s => (
            <span key={s.key} style={{ fontSize: 11, color: '#777', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
              {s.label} {fmtMs(s.ms)}
            </span>
          ))}
        </div>

        {/* Daily trend */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 8 }}>Avg wait per day</div>
        <div style={{ height: 150, marginBottom: 18 }}><canvas ref={canvasRef} /></div>

        {/* Per-call waterfall */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 8 }}>Recent analyses</div>
        {recent.map(r => {
          const s = segments(r);
          return (
            <div key={r.id} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#999', marginBottom: 2 }}>
                <span>{new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {r.model_used || r.model || '?'} · {r.kind === 'text' ? 'text' : fmtKb(r.req_bytes)}{(r.attempts || 1) > 1 ? ` · ${r.attempts}×` : ''}</span>
                <span style={{ fontWeight: 700, color: '#555' }}>{fmtMs(s.total)}</span>
              </div>
              <div style={{ display: 'flex', height: 12, borderRadius: 4, overflow: 'hidden', background: '#eee', width: `${(s.total / maxTotal) * 100}%` }}>
                {SEGS.map(seg => s[seg.key] > 0 && (
                  <div key={seg.key} title={`${seg.label}: ${fmtMs(s[seg.key])}`} style={{ width: `${(s[seg.key] / s.total) * 100}%`, background: seg.color }} />
                ))}
              </div>
            </div>
          );
        })}
        <p style={{ fontSize: 11, color: '#aaa', marginTop: 12, lineHeight: 1.55 }}>
          Last {rows.length} analyses (most recent {Math.min(200, rows.length)} stored). Timings are recorded per call in <code>perf_log</code>.
        </p>
      </div>
    );
  }

  return section;
}
