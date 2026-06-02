import React from 'react';
import LogApp from './LogApp';
import { workouts } from '../utils/db';

const CONFIG = {
  appName: 'Workout',
  accent: '#ba7517',
  icon: 'ti-barbell',
  emptyHint: 'No workouts logged yet.\nTap + to log your first session!',
  fields: [
    { key: 'name', label: 'Name', type: 'text', placeholder: 'Upper body' },
    { key: 'duration', label: 'Duration', unit: 'min', type: 'number', placeholder: '45' },
    { key: 'notes', label: 'Notes', type: 'text', placeholder: 'Optional' },
  ],
  summary: (e) => [
    e.name || null,
    e.duration != null ? `${e.duration} min` : null,
  ].filter(Boolean).join(' · ') || 'Workout',
  load: workouts.load,
  create: workouts.save,
  update: workouts.update,
  remove: workouts.remove,
};

export default function WorkoutApp(props) {
  return <LogApp config={CONFIG} {...props} />;
}
