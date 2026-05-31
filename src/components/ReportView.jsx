import React, { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { goalsAtDate } from '../utils/storage';

Chart.register(...registerables);

const COLORS = { cal: '#1d9e75', protein: '#d4537e', carbs: '#378add', fat: '#ba7517' };

const METRICS = {
  calories: { label: 'Calories', unit: 'kcal', color: COLORS.cal },
  protein:  { label: 'Protein',  unit: 'g',    color: COLORS.protein },
  carbs:    { label: 'Carbs',    unit: 'g',    color: COLORS.carbs },
  fat:      { label: 'Fat',      unit: 'g',    color: COLORS.fat },
};

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const DAY = 86400000;

// Single source of truth for the visible window, shifted by `offset` periods
// (0 = current, negative = past, positive = future). Returns epoch-ms bounds
// and the number of buckets the chart draws.
function periodWindow(period, offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'day') {
    d.setDate(d.getDate() + offset);
    const start = d.getTime();
    return { start, end: start + DAY, buckets: 24 };
  }
  if (period === 'week') {
    d.setDate(d.getDate() - d.getDay() + offset * 7);
    const start = d.getTime();
    return { start, end: start + 7 * DAY, buckets: 7 };
  }
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  const start = d.getTime();
  const next = new Date(d);
  next.setMonth(next.getMonth() + 1);
  return { start, end: next.getTime(), buckets: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() };
}

// Human label for the currently-viewed window.
function periodLabel(period, offset, start) {
  const d = new Date(start);
  if (period === 'day') {
    if (offset === 0) return 'Today';
    if (offset === -1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  if (period === 'week') {
    if (offset === 0) return 'This week';
    const endDay = new Date(start + 6 * DAY);
    const o = { month: 'short', day: 'numeric' };
    return `${d.toLocaleDateString('en-US', o)} – ${endDay.toLocaleDateString('en-US', o)}`;
  }
  if (offset === 0) return 'This month';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Per-metric chart series for the viewed window: hourly buckets (day) or
// daily buckets (week/month), plus the per-bucket goal line.
function buildSeries(metricKey, period, offset, logs, goalsHistory) {
  const w = periodWindow(period, offset);
  const sumAt = (start, end) => logs
    .filter(l => l.timestamp >= start && l.timestamp < end)
    .reduce((s, l) => s + (l[metricKey] || 0), 0);

  if (period === 'day') {
    const hrs = Array.from({ length: 24 }, (_, i) => i);
    const dayGoal = goalsAtDate(w.start + 43200000, goalsHistory)[metricKey];
    // 25 labels (0:00 … 24:00) mark hour boundaries; only 24 buckets carry data,
    // so the trailing 24:00 slot stays empty. The x-axis shows every 4th tick.
    return {
      labels: Array.from({ length: 25 }, (_, h) => h + ':00'),
      data: hrs.map(h => sumAt(w.start + h * 3600000, w.start + (h + 1) * 3600000)),
      goalData: hrs.map(() => dayGoal),
    };
  }
  if (period === 'week') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      labels: days,
      data: days.map((_, i) => sumAt(w.start + i * DAY, w.start + (i + 1) * DAY)),
      goalData: days.map((_, i) => goalsAtDate(w.start + i * DAY + 43200000, goalsHistory)[metricKey]),
    };
  }
  return {
    labels: Array.from({ length: w.buckets }, (_, i) => i + 1),
    data: Array.from({ length: w.buckets }, (_, i) => sumAt(w.start + i * DAY, w.start + (i + 1) * DAY)),
    goalData: Array.from({ length: w.buckets }, (_, i) => goalsAtDate(w.start + i * DAY + 43200000, goalsHistory)[metricKey]),
  };
}

// One compact labelled chart for a single metric.
function MetricChart({ metricKey, period, offset, logs, goalsHistory, total, target }) {
  const ref = useRef(null);
  const inst = useRef(null);
  const m = METRICS[metricKey];
  const totalStr = metricKey === 'calories' ? Math.round(total) : total.toFixed(1);

  useEffect(() => {
    if (!ref.current) return;
    if (inst.current) inst.current.destroy();
    const { labels, data, goalData } = buildSeries(metricKey, period, offset, logs, goalsHistory);
    const isDark = matchMedia('(prefers-color-scheme:dark)').matches;
    const fmtVal = metricKey === 'calories' ? Math.round : (v => Math.round(v * 10) / 10);
    inst.current = new Chart(ref.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: m.label, data, backgroundColor: hexToRgba(m.color, 0.65), borderRadius: 4, borderSkipped: false },
          { label: 'Goal', data: goalData, type: 'line', borderColor: 'rgba(170,170,170,.7)', borderDash: [5, 3], borderWidth: 1.5, pointRadius: 0, fill: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: v => `${v.dataset.label}: ${fmtVal(v.raw)} ${m.unit}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: isDark ? '#666' : '#aaa', font: { size: 10 }, autoSkip: period === 'month', maxTicksLimit: period === 'month' ? 10 : undefined, callback: function (v, i) { return period === 'day' && i % 4 !== 0 ? '' : this.getLabelForValue(v); } } },
          y: { grid: { color: isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)' }, ticks: { color: isDark ? '#666' : '#aaa', font: { size: 10 }, callback: v => v > 0 ? v : '' } },
        },
      },
    });
    return () => { if (inst.current) inst.current.destroy(); };
  }, [metricKey, period, offset, logs, goalsHistory, m.label, m.unit, m.color]);

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: m.color }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: hexToRgba(m.color, 0.65), display: 'inline-block' }} />
          {m.label}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: m.color }}>
          {totalStr} <span style={{ color: '#aaa', fontWeight: 600 }}>/ {Math.round(target)} {m.unit}</span>
        </span>
      </div>
      <div style={{ height: 220, position: 'relative' }}>
        <canvas ref={ref} role="img" aria-label={`${m.label} intake with goal line`} />
      </div>
    </div>
  );
}

export default function ReportView({ logs, goalsHistory }) {
  const [period, setPeriod] = useState('week');
  const [offset, setOffset] = useState(0);

  const win = periodWindow(period, offset);

  const changePeriod = (p) => { setPeriod(p); setOffset(0); };

  const filtered = logs.filter(l => l.timestamp >= win.start && l.timestamp < win.end);
  const totals = filtered.reduce((a, l) => ({
    calories: a.calories + (l.calories || 0), protein: a.protein + (l.protein || 0),
    carbs: a.carbs + (l.carbs || 0), fat: a.fat + (l.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Target for a metric summed across the viewed period, respecting the
  // goal that was active on each day.
  const periodTarget = (m) => {
    if (period === 'day') return goalsAtDate(win.start + 43200000, goalsHistory)[m];
    let sum = 0;
    for (let i = 0; i < win.buckets; i++) sum += goalsAtDate(win.start + i * DAY + 43200000, goalsHistory)[m];
    return sum;
  };

  return (
    <div>
      {/* Period tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '12px 16px 8px', background: '#fff' }}>
        {['day', 'week', 'month'].map(p => (
          <button key={p} onClick={() => changePeriod(p)} style={{
            flex: 1, padding: 9, borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: period === p ? '#e1f5ee' : 'transparent', color: period === p ? '#0f6e56' : '#888', transition: '.15s'
          }}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
        ))}
      </div>

      {/* Period navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 12px', gap: 8 }}>
        <button onClick={() => setOffset(o => o - 1)} aria-label="Previous period"
          style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: '#f5f5f0', color: '#666', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-chevron-left" />
        </button>
        <button onClick={() => setOffset(0)} disabled={offset === 0}
          style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: 'transparent', color: offset === 0 ? '#444' : '#0f6e56', fontSize: 13, fontWeight: 700, cursor: offset === 0 ? 'default' : 'pointer', textAlign: 'center' }}>
          {periodLabel(period, offset, win.start)}
        </button>
        <button onClick={() => setOffset(o => o + 1)} disabled={offset >= 0} aria-label="Next period"
          style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: offset >= 0 ? 'transparent' : '#f5f5f0', color: offset >= 0 ? '#ddd' : '#666', fontSize: 18, cursor: offset >= 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-chevron-right" />
        </button>
      </div>

      {/* One chart per metric */}
      <div style={{ padding: '0 16px 20px' }}>
        {Object.keys(METRICS).map(key => (
          <MetricChart key={key} metricKey={key} period={period} offset={offset}
            logs={logs} goalsHistory={goalsHistory} total={totals[key]} target={periodTarget(key)} />
        ))}
      </div>
    </div>
  );
}
