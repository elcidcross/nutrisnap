import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import { todayStr, swStart, smStart } from '../utils/date';

Chart.register(...registerables);

const COLORS = { cal: '#1d9e75', protein: '#d4537e', carbs: '#378add', fat: '#ba7517' };

export default function ReportView({ logs, goals }) {
  const [period, setPeriod] = useState('day');
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
    if (period === 'day') {
      const hrs = Array.from({ length: 24 }, (_, i) => i);
      return {
        labels: hrs.map(h => h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p'),
        data: hrs.map(h => logs.filter(l => new Date(l.timestamp).toDateString() === todayStr() && new Date(l.timestamp).getHours() === h).reduce((s, l) => s + (l.calories || 0), 0)),
      };
    }
    if (period === 'week') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], start = swStart();
      return { labels: days, data: days.map((_, i) => { const s = start + i * 86400000; return logs.filter(l => l.timestamp >= s && l.timestamp < s + 86400000).reduce((s, l) => s + (l.calories || 0), 0); }) };
    }
    const dim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(), start = smStart();
    return { labels: Array.from({ length: dim }, (_, i) => i + 1), data: Array.from({ length: dim }, (_, i) => { const s = start + i * 86400000; return logs.filter(l => l.timestamp >= s && l.timestamp < s + 86400000).reduce((s, l) => s + (l.calories || 0), 0); }) };
  }, [logs, period]);

  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInst.current) chartInst.current.destroy();
    const { labels, data } = buildData();
    const isDark = matchMedia('(prefers-color-scheme:dark)').matches;
    chartInst.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Calories', data, backgroundColor: 'rgba(29,158,117,.65)', borderRadius: 4, borderSkipped: false },
          { label: 'Goal', data: labels.map(() => goals.calories), type: 'line', borderColor: 'rgba(212,83,126,.55)', borderDash: [5, 3], borderWidth: 1.5, pointRadius: 0, fill: false },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: v => v.dataset.label + ': ' + Math.round(v.raw) + ' kcal' } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: isDark ? '#666' : '#aaa', font: { size: 10 }, maxTicksLimit: period === 'month' ? 10 : undefined } },
          y: { grid: { color: isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)' }, ticks: { color: isDark ? '#666' : '#aaa', font: { size: 10 }, callback: v => v > 0 ? v : '' } }
        }
      }
    });
    return () => { if (chartInst.current) chartInst.current.destroy(); };
  }, [buildData, period, goals.calories]);

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

      {/* Totals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, padding: '0 16px 16px' }}>
        {[['kcal', Math.round(totals.calories), COLORS.cal], ['protein', totals.protein.toFixed(1) + 'g', COLORS.protein], ['carbs', totals.carbs.toFixed(1) + 'g', COLORS.carbs], ['fat', totals.fat.toFixed(1) + 'g', COLORS.fat]].map(([lbl, val, c]) => (
          <div key={lbl} style={{ background: '#f5f5f0', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{val}</div>
            <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, padding: '0 16px 8px', fontSize: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(29,158,117,.65)', display: 'inline-block' }} /><span style={{ color: '#888' }}>Intake</span></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 18, height: 2, background: 'rgba(212,83,126,.55)', display: 'inline-block' }} /><span style={{ color: '#888' }}>Goal</span></span>
      </div>

      {/* Chart */}
      <div style={{ padding: '0 16px 20px', height: 220, position: 'relative' }}>
        <canvas id="reportChart" ref={chartRef} role="img" aria-label={`Calorie intake by ${period} with goal line`} />
      </div>
    </div>
  );
}
