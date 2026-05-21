import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import { todayStr, swStart, smStart } from '../utils/date';
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

export default function ReportView({ logs, goalsHistory }) {
  const [period, setPeriod] = useState('day');
  const [metric, setMetric] = useState('calories');
  const chartRef = useRef(null);
  const chartInst = useRef(null);

  const filtered = logs.filter(l => {
    if (period === 'day') return new Date(l.timestamp).toDateString() === todayStr();
    if (period === 'week') return l.timestamp >= swStart();
    return l.timestamp >= smStart();
  });
  const totals = filtered.reduce((a, l) => ({
    calories: a.calories + (l.calories || 0), protein: a.protein + (l.protein || 0),
    carbs: a.carbs + (l.carbs || 0), fat: a.fat + (l.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const buildData = useCallback(() => {
    const sumAt = (start, end) => logs
      .filter(l => l.timestamp >= start && l.timestamp < end)
      .reduce((s, l) => s + (l[metric] || 0), 0);

    if (period === 'day') {
      const hrs = Array.from({ length: 24 }, (_, i) => i);
      const dayGoal = goalsAtDate(Date.now(), goalsHistory)[metric];
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      return {
        labels: hrs.map(h => h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p'),
        data: hrs.map(h => sumAt(todayStart.getTime() + h * 3600000, todayStart.getTime() + (h + 1) * 3600000)),
        goalData: hrs.map(() => dayGoal),
      };
    }
    if (period === 'week') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], start = swStart();
      return {
        labels: days,
        data: days.map((_, i) => sumAt(start + i * 86400000, start + (i + 1) * 86400000)),
        goalData: days.map((_, i) => goalsAtDate(start + i * 86400000 + 43200000, goalsHistory)[metric]),
      };
    }
    const dim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(), start = smStart();
    return {
      labels: Array.from({ length: dim }, (_, i) => i + 1),
      data: Array.from({ length: dim }, (_, i) => sumAt(start + i * 86400000, start + (i + 1) * 86400000)),
      goalData: Array.from({ length: dim }, (_, i) => goalsAtDate(start + i * 86400000 + 43200000, goalsHistory)[metric]),
    };
  }, [logs, period, goalsHistory, metric]);

  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInst.current) chartInst.current.destroy();
    const { labels, data, goalData } = buildData();
    const m = METRICS[metric];
    const isDark = matchMedia('(prefers-color-scheme:dark)').matches;
    const fmtVal = metric === 'calories' ? Math.round : (v => Math.round(v * 10) / 10);
    chartInst.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: m.label, data, backgroundColor: hexToRgba(m.color, 0.65), borderRadius: 4, borderSkipped: false },
          { label: 'Goal', data: goalData, type: 'line', borderColor: 'rgba(170,170,170,.7)', borderDash: [5, 3], borderWidth: 1.5, pointRadius: 0, fill: false },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: v => `${v.dataset.label}: ${fmtVal(v.raw)} ${m.unit}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: isDark ? '#666' : '#aaa', font: { size: 10 }, maxTicksLimit: period === 'month' ? 10 : undefined } },
          y: { grid: { color: isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)' }, ticks: { color: isDark ? '#666' : '#aaa', font: { size: 10 }, callback: v => v > 0 ? v : '' } }
        }
      }
    });
    return () => { if (chartInst.current) chartInst.current.destroy(); };
  }, [buildData, period, metric]);

  return (
    <div>
      {/* Period tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '12px 16px', background: '#fff' }}>
        {['day', 'week', 'month'].map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{
            flex: 1, padding: 9, borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: period === p ? '#e1f5ee' : 'transparent', color: period === p ? '#0f6e56' : '#888', transition: '.15s'
          }}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
        ))}
      </div>

      {/* Totals — click to graph that metric */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, padding: '0 16px 16px' }}>
        {[
          ['calories', 'kcal',    Math.round(totals.calories)],
          ['protein',  'protein', totals.protein.toFixed(1) + 'g'],
          ['carbs',    'carbs',   totals.carbs.toFixed(1) + 'g'],
          ['fat',      'fat',     totals.fat.toFixed(1) + 'g'],
        ].map(([key, lbl, val]) => {
          const c = METRICS[key].color;
          const active = metric === key;
          return (
            <button key={key} onClick={() => setMetric(key)} aria-pressed={active}
              style={{
                background: active ? hexToRgba(c, 0.12) : '#f5f5f0',
                border: active ? `1.5px solid ${c}` : '1.5px solid transparent',
                borderRadius: 10, padding: 10, textAlign: 'center', cursor: 'pointer',
                transition: 'background .15s, border-color .15s',
              }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{val}</div>
              <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>{lbl}</div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, padding: '0 16px 8px', fontSize: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: hexToRgba(METRICS[metric].color, 0.65), display: 'inline-block' }} /><span style={{ color: '#888' }}>{METRICS[metric].label}</span></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 18, height: 2, background: 'rgba(170,170,170,.7)', display: 'inline-block' }} /><span style={{ color: '#888' }}>Goal</span></span>
      </div>

      {/* Chart */}
      <div style={{ padding: '0 16px 20px', height: 220, position: 'relative' }}>
        <canvas id="reportChart" ref={chartRef} role="img" aria-label={`${METRICS[metric].label} intake by ${period} with goal line`} />
      </div>
    </div>
  );
}
