import React from 'react';
import LogApp from './LogApp';
import { getBodyMetrics, saveBodyMetric, updateBodyMetric, deleteBodyMetric } from '../utils/db';

const CONFIG = {
  appName: 'Body',
  accent: '#d4537e',
  icon: 'ti-scale',
  app: 'body',
  emptyHint: 'No measurements yet.\nTap + to log your weight & body fat.',
  fields: [
    { key: 'height', label: '身長 Height', unit: 'm', type: 'number', placeholder: '1.70', step: 0.01, default: 1.7 },
    { key: 'weight', label: '体重 Weight', unit: 'kg', type: 'number', placeholder: '70' },
    { key: 'bodyFat', label: '体脂肪率 Body fat', unit: '%', type: 'number', placeholder: '18' },
    { key: 'muscleMass', label: '筋肉量 Muscle mass', unit: 'kg', type: 'number', placeholder: '50' },
    { key: 'bodyWater', label: '体水分率 Body water', unit: '%', type: 'number', placeholder: '55' },
    { key: 'boneMass', label: '推定骨量 Bone mass', unit: 'kg', type: 'number', placeholder: '2.7' },
    { key: 'bmr', label: '基礎代謝量 BMR', unit: 'kcal', type: 'number', placeholder: '1400' },
    { key: 'visceralFat', label: '内臓脂肪レベル Visceral fat', unit: 'level', type: 'number', placeholder: '10' },
    { key: 'legScore', label: '脚点 Leg score', type: 'number', placeholder: '90' },
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
  report: {
    series: [
      { key: 'weight', label: 'Weight', unit: 'kg', color: '#d4537e', value: e => e.weight ?? null, goalKey: 'target_weight' },
      { key: 'bodyFat', label: 'Body fat', unit: '%', color: '#ba7517', value: e => e.bodyFat ?? null, goalKey: 'target_body_fat', lowerBetter: true },
      { key: 'muscleMass', label: 'Muscle mass', unit: 'kg', color: '#1d9e75', value: e => e.muscleMass ?? null },
      { key: 'bodyWater', label: 'Body water', unit: '%', color: '#1a94c8', value: e => e.bodyWater ?? null },
      { key: 'boneMass', label: 'Bone mass', unit: 'kg', color: '#8b5cf6', value: e => e.boneMass ?? null, minRange: 2 },
      { key: 'bmr', label: 'BMR', unit: 'kcal', color: '#e24b4a', value: e => e.bmr ?? null },
      { key: 'visceralFat', label: 'Visceral fat', unit: 'level', color: '#f59e0b', value: e => e.visceralFat ?? null, lowerBetter: true, minRange: 10 },
      { key: 'legScore', label: 'Leg score', unit: '', color: '#06b6d4', value: e => e.legScore ?? null },
    ],
    summary: (entries, goals) => {
      if (!entries.length) return [];
      const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
      const latest = sorted[sorted.length - 1];
      const cards = [];
      if (latest.weight != null) cards.push({ label: 'weight', value: `${latest.weight} kg`, sub: goals.target_weight ? `goal ${goals.target_weight}` : null });
      if (latest.bodyFat != null) cards.push({ label: 'body fat', value: `${latest.bodyFat}%`, sub: goals.target_body_fat ? `goal ${goals.target_body_fat}%` : null });
      if (latest.muscleMass != null) cards.push({ label: 'muscle', value: `${latest.muscleMass} kg` });
      return cards;
    },
  },
  goals: [
    { key: 'target_weight', label: 'Target weight', unit: 'kg', placeholder: '63' },
    { key: 'target_body_fat', label: 'Target body fat', unit: '%', placeholder: '18' },
  ],
};

export default function BodyApp(props) {
  return <LogApp config={CONFIG} {...props} />;
}
