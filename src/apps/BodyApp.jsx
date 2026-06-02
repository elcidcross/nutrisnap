import React from 'react';
import LogApp from './LogApp';
import { getBodyMetrics, saveBodyMetric, updateBodyMetric, deleteBodyMetric } from '../utils/db';

const CONFIG = {
  appName: 'Body',
  accent: '#d4537e',
  icon: 'ti-scale',
  emptyHint: 'No measurements yet.\nTap + to log your weight & body fat.',
  fields: [
    { key: 'weight', label: 'Weight', unit: 'kg', type: 'number', placeholder: '70' },
    { key: 'bodyFat', label: 'Body fat', unit: '%', type: 'number', placeholder: '18' },
    { key: 'notes', label: 'Notes', type: 'text', placeholder: 'Optional' },
  ],
  summary: (e) => [
    e.weight != null ? `${e.weight} kg` : null,
    e.bodyFat != null ? `${e.bodyFat}% fat` : null,
  ].filter(Boolean).join(' · ') || 'Measurement',
  load: getBodyMetrics,
  create: saveBodyMetric,
  update: updateBodyMetric,
  remove: deleteBodyMetric,
};

export default function BodyApp(props) {
  return <LogApp config={CONFIG} {...props} />;
}
