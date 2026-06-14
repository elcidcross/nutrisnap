import React from 'react';
import LogApp, { fmtDuration } from './LogApp';
import { jogs } from '../utils/db';

// distance is km, duration is stored as seconds (see LogApp's 'duration' type).
// Pace is seconds-per-km, shown as m:ss; as a chart value it's minutes-per-km.
const paceSummary = (e) => {
  if (!e.distance || !e.duration) return null;
  return `${fmtDuration(e.duration / e.distance)}/km`;
};
const paceMinPerKm = (e) => (e.distance && e.duration ? (e.duration / 60) / e.distance : null);
const paceFmt = (v) => (v < 0 ? '-' : '') + fmtDuration(Math.abs(v) * 60); // minutes/km → m:ss

const CONFIG = {
  appName: 'Jog',
  accent: '#378add',
  icon: 'ti-run',
  app: 'jog',
  emptyHint: 'No jogs logged yet.\nTap + to log your first run!',
  fields: [
    { key: 'distance', label: 'Distance', unit: 'km', type: 'number', placeholder: '5' },
    { key: 'duration', label: 'Duration', unit: 'h:mm:ss', type: 'duration', placeholder: '15:00' },
    { key: 'notes', label: 'Notes', type: 'text', placeholder: 'Optional' },
  ],
  summary: (e) => [
    e.distance != null ? `${e.distance} km` : null,
    e.duration != null ? fmtDuration(e.duration) : null,
    paceSummary(e),
  ].filter(Boolean).join(' · ') || 'Jog',
  load: jogs.load,
  create: jogs.save,
  update: jogs.update,
  remove: jogs.remove,
  report: {
    series: [
      { key: 'distance', label: 'Distance', unit: 'km', color: '#378add', value: e => e.distance ?? null },
      { key: 'pace', label: 'Pace', unit: '/km', color: '#1d9e75', value: paceMinPerKm, lowerBetter: true, fmt: paceFmt },
    ],
    summary: (entries, goals) => {
      const weekAgo = Date.now() - 7 * 86400000;
      const weekDist = entries.filter(e => e.timestamp >= weekAgo).reduce((s, e) => s + (e.distance || 0), 0);
      const paced = entries.filter(e => e.distance && e.duration);
      const avgPace = paced.length ? paced.reduce((s, e) => s + e.duration / e.distance, 0) / paced.length : null;
      const cards = [
        { label: 'km this week', value: weekDist.toFixed(1), sub: goals.weekly_distance ? `goal ${goals.weekly_distance}` : null },
        { label: 'total runs', value: entries.length },
      ];
      if (avgPace != null) cards.push({ label: 'avg pace /km', value: fmtDuration(avgPace) });
      return cards;
    },
  },
  goals: [
    // `default` is the real target used until the user changes it (graded by the
    // Report Card out of the box) — keep in sync with HABIT_SOURCES in reportcard.js.
    { key: 'weekly_distance', label: 'Weekly distance', unit: 'km', default: 10, placeholder: '10' },
  ],
};

export default function JogApp(props) {
  return <LogApp config={CONFIG} {...props} />;
}
