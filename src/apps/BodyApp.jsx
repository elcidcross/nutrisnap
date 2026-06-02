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
    { key: 'height', label: 'Height', unit: 'm', type: 'number', placeholder: '1.70', step: 0.01, default: 1.7 },
    { key: 'bodyFat', label: 'Body fat', unit: '%', type: 'number', placeholder: '18' },
    { key: 'muscleMass', label: 'Muscle mass', unit: 'kg', type: 'number', placeholder: '50' },
    { key: 'bodyWater', label: 'Body water', unit: '%', type: 'number', placeholder: '55' },
    { key: 'boneMass', label: 'Bone mass', unit: 'kg', type: 'number', placeholder: '2.7' },
    { key: 'bmr', label: 'BMR', unit: 'kcal', type: 'number', placeholder: '1400' },
    { key: 'visceralFat', label: 'Visceral fat', unit: 'level', type: 'number', placeholder: '10' },
    { key: 'legScore', label: 'Leg score', type: 'number', placeholder: '90' },
    { key: 'notes', label: 'Notes', type: 'text', placeholder: 'Optional' },
  ],
  summary: (e) => [
    e.weight != null ? `${e.weight} kg` : null,
    e.bodyFat != null ? `${e.bodyFat}% fat` : null,
    (e.weight != null && e.height) ? `BMI ${(e.weight / (e.height * e.height)).toFixed(1)}` : null,
  ].filter(Boolean).join(' · ') || 'Measurement',
  load: getBodyMetrics,
  create: saveBodyMetric,
  update: updateBodyMetric,
  remove: deleteBodyMetric,
};

export default function BodyApp(props) {
  return <LogApp config={CONFIG} {...props} />;
}
