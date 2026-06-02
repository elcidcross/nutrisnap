import React from 'react';
import LogApp from './LogApp';
import { meditations } from '../utils/db';

const CONFIG = {
  appName: 'Meditation',
  accent: '#8a63d2',
  icon: 'ti-yoga',
  emptyHint: 'No sessions logged yet.\nTap + to log your first sit.',
  fields: [
    { key: 'duration', label: 'Duration', unit: 'min', type: 'number', placeholder: '10' },
    { key: 'notes', label: 'Notes', type: 'text', placeholder: 'Optional' },
  ],
  summary: (e) => (e.duration != null ? `${e.duration} min` : 'Meditation'),
  load: meditations.load,
  create: meditations.save,
  update: meditations.update,
  remove: meditations.remove,
};

export default function MeditationApp(props) {
  return <LogApp config={CONFIG} {...props} />;
}
