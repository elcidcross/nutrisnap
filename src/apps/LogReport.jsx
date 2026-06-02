import React, { useRef, useEffect } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

// Generic, config-driven trends view for a LogApp. Each app declares what to plot
// via `config.report`:
//   report: {
//     series: [{ key, label, unit, color, value: (entry) => number|null,
//                goalKey?, lowerBetter?, fmt?: (v) => string }],
//     summary?: (entries, goals) => [{ label, value, sub? }],
//   }
// One line chart per series over time, with an optional dashed goal line when the
// series names a `goalKey` that the user has set.

function hexToRgba(hex, a) {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const shortDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });

function SeriesChart({ series, entries, goal }) {
  const ref = useRef(null);
  const inst = useRef(null);
  const fmt = series.fmt || (v => (Math.round(v * 10) / 10).toString());

  // Chronological points that actually have a value for this series.
  const points = entries
    .map(e => ({ ts: e.timestamp, v: series.value(e) }))
    .filter(p => p.v != null && !Number.isNaN(p.v))
    .sort((a, b) => a.ts - b.ts);

  const latest = points.length ? points[points.length - 1].v : null;
  const prev = points.length > 1 ? points[points.length - 2].v : null;
  const delta = latest != null && prev != null ? latest - prev : null;
  const avg = points.length ? points.reduce((s, p) => s + p.v, 0) / points.length : null;

  useEffect(() => {
    if (!ref.current || points.length === 0) return;
    if (inst.current) inst.current.destroy();
    const isDark = matchMedia('(prefers-color-scheme:dark)').matches;
    const datasets = [{
      label: series.label,
      data: points.map(p => p.v),
      borderColor: series.color,
      backgroundColor: hexToRgba(series.color, 0.12),
      borderWidth: 2, pointRadius: points.length > 30 ? 0 : 3, pointBackgroundColor: series.color,
      tension: 0.25, fill: true,
    }];
    if (goal != null) {
      datasets.push({
        label: 'Goal', data: points.map(() => goal), type: 'line',
        borderColor: 'rgba(150,150,150,.7)', borderDash: [5, 3], borderWidth: 1.5, pointRadius: 0, fill: false,
      });
    }
    inst.current = new Chart(ref.current, {
      type: 'line',
      data: { labels: points.map(p => shortDate(p.ts)), datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: v => `${v.dataset.label}: ${fmt(v.raw)} ${series.unit}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: isDark ? '#666' : '#aaa', font: { size: 10 }, maxTicksLimit: 8, autoSkip: true } },
          y: { grid: { color: isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)' }, ticks: { color: isDark ? '#666' : '#aaa', font: { size: 10 } } },
        },
      },
    });
    return () => { if (inst.current) inst.current.destroy(); };
  }, [series, entries, goal]); // eslint-disable-line react-hooks/exhaustive-deps

  const deltaColor = delta == null ? '#aaa' : (series.lowerBetter ? (delta <= 0 ? '#1d9e75' : '#e24b4a') : (delta >= 0 ? '#1d9e75' : '#e24b4a'));
  const deltaStr = delta == null ? '' : `${delta > 0 ? '+' : ''}${fmt(delta)}`;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: series.color }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: series.color, display: 'inline-block' }} />
          {series.label}
        </span>
        {latest != null && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>
            {fmt(latest)} {series.unit}
            {delta != null && <span style={{ color: deltaColor, marginLeft: 6 }}>{deltaStr}</span>}
            {avg != null && <span style={{ color: '#aaa', fontWeight: 600, marginLeft: 6 }}>avg {fmt(avg)}</span>}
          </span>
        )}
      </div>
      <div style={{ height: 200, position: 'relative' }}>
        {points.length === 0
          ? <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 13 }}>No data yet</div>
          : <canvas ref={ref} role="img" aria-label={`${series.label} over time`} />}
      </div>
    </div>
  );
}

export default function LogReport({ logs, report, goals, accent }) {
  if (!report) return null;
  const cards = report.summary ? report.summary(logs, goals || {}) : [];

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      {cards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cards.length, 3)}, 1fr)`, gap: 8, marginBottom: 18 }}>
          {cards.map((c, i) => (
            <div key={i} style={{ background: `${accent}0f`, borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: accent, lineHeight: 1.1 }}>{c.value}</div>
              <div style={{ fontSize: 10.5, color: '#888', fontWeight: 600, marginTop: 3 }}>{c.label}</div>
              {c.sub && <div style={{ fontSize: 10, color: '#aaa', marginTop: 1 }}>{c.sub}</div>}
            </div>
          ))}
        </div>
      )}
      {report.series.map(s => (
        <SeriesChart key={s.key} series={s} entries={logs} goal={s.goalKey ? (goals || {})[s.goalKey] ?? null : null} />
      ))}
    </div>
  );
}
