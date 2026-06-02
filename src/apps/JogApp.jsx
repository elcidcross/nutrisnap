import React from 'react';
import LogApp, { fmtDuration } from './LogApp';
import { jogs } from '../utils/db';

// distance is km, duration is stored as seconds (see LogApp's 'duration' type).
const pace = (e) => {
  if (!e.distance || !e.duration) return null;
  const secsPerKm = e.duration / e.distance;
  return `${fmtDuration(secsPerKm)}/km`;
};

const CONFIG = {
  appName: 'Jog',
  accent: '#378add',
  icon: 'ti-run',
  emptyHint: 'No jogs logged yet.\nTap + to log your first run!',
  fields: [
    { key: 'distance', label: 'Distance', unit: 'km', type: 'number', placeholder: '5' },
    { key: 'duration', label: 'Duration', unit: 'h:mm:ss', type: 'duration', placeholder: '15:00' },
    { key: 'notes', label: 'Notes', type: 'text', placeholder: 'Optional' },
  ],
  summary: (e) => [
    e.distance != null ? `${e.distance} km` : null,
    e.duration != null ? fmtDuration(e.duration) : null,
    pace(e),
  ].filter(Boolean).join(' · ') || 'Jog',
  load: jogs.load,
  create: jogs.save,
  update: jogs.update,
  remove: jogs.remove,
};

export default function JogApp(props) {
  return <LogApp config={CONFIG} {...props} />;
}
