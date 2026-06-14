// Weekly Report Card — grades a week's adherence to the user's *habits* (the means)
// and rolls them into an overall mark. Pure functions (no React/DB), unit-tested in
// reportcard.test.js. The motivating idea: one letter grade per habit, one overall
// grade, and a history of past weeks — so the user wants to "get an A".
//
// Habits are NOT defined here — they already live in each source app (the per-app
// targets in the `app_goals` table, set on that app's Goals tab: Jog's weekly
// distance, Meditation's days/week, Workout's sessions/week). The report card just
// reads those targets and grades the week's activity against them.
//
// Two grade sources:
//   • Nutrition — ONE combined grade from the four macros (calories/protein/carbs/
//     fat) vs the nutrition targets active that week, averaged over the days the
//     user actually logged. (Nutrition is a habit, graded once — not four times.)
//   • Per-app habit targets — see HABIT_SOURCES. Each is graded vs the week's actual
//     (a summed field, or a count of qualifying days/sessions). Apps without a target
//     set simply don't appear.

import { periodStart, periodEnd } from './goals';
import { goalsAtDate } from './storage';

const DAY = 86400000;

// US letter scale on the 0..1 score. Score is % of the weekly target met (each item
// capped at 100% so overachieving one habit can't paper over failing another).
export function letterFor(score) {
  const p = score * 100;
  if (p >= 97) return 'A+';
  if (p >= 93) return 'A';
  if (p >= 90) return 'A-';
  if (p >= 87) return 'B+';
  if (p >= 83) return 'B';
  if (p >= 80) return 'B-';
  if (p >= 77) return 'C+';
  if (p >= 73) return 'C';
  if (p >= 70) return 'C-';
  if (p >= 67) return 'D+';
  if (p >= 63) return 'D';
  if (p >= 60) return 'D-';
  return 'F';
}

// Letters ↔ grade points (4.0 scale). The overall grade is the *average of the
// subject grades* (a GPA), not the average of raw percentages — otherwise a fair
// middle (e.g. a B- and an F) collapses into F, since F spans everything under 60%.
const GRADE_POINTS = { 'A+': 4.3, A: 4.0, 'A-': 3.7, 'B+': 3.3, B: 3.0, 'B-': 2.7, 'C+': 2.3, C: 2.0, 'C-': 1.7, 'D+': 1.3, D: 1.0, 'D-': 0.7, F: 0 };
// Round a GPA *down* to its band — you only earn a grade once the average actually
// reaches it, so A+ stays special (every subject must be A+ to land an A+ overall).
const POINT_TO_LETTER = [['A+', 4.3], ['A', 4.0], ['A-', 3.7], ['B+', 3.3], ['B', 3.0], ['B-', 2.7], ['C+', 2.3], ['C', 2.0], ['C-', 1.7], ['D+', 1.3], ['D', 1.0], ['D-', 0.7]];
export function letterFromPoints(p) {
  for (const [letter, min] of POINT_TO_LETTER) if (p >= min) return letter;
  return 'F';
}

export function letterColor(letter) {
  switch (letter[0]) {
    case 'A': return '#1d9e75';
    case 'B': return '#378add';
    case 'C': return '#ba7517';
    case 'D': return '#e07a1f';
    default:  return '#e24b4a';
  }
}

export function weekStartOf(ts) { return periodStart('week', ts); }
export function weekEndOf(weekStart) { return periodEnd('week', weekStart); }

// ISO-8601 week-year and week number for the date at `ts` (week 1 holds the year's
// first Thursday; the week-year is the year that Thursday falls in, which can differ
// from the calendar year around New Year).
function isoWeekParts(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;       // Sun → 7
  d.setDate(d.getDate() + 4 - day);  // step to the Thursday of this ISO week
  const year = d.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const week = Math.ceil((((d - yearStart) / DAY) + 1) / 7);
  return { year, week };
}

// Report cards are labelled by year + week number (e.g. "2026 Week 24"). Our weeks
// start Sunday, so we read it off that week's Thursday — each Sunday→Saturday span
// holds exactly one Thursday, giving stable, consecutive numbering.
export function weekLabel(weekStart) {
  const { year, week } = isoWeekParts(weekStart + 4 * DAY);
  return `${year} Week ${week}`;
}

// Date range of a week, e.g. "Jun 8 – 14" — shown as a card subtitle.
export function weekRange(weekStart) {
  const end = weekEndOf(weekStart) - DAY;
  const f = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${f(weekStart)} – ${f(end)}`;
}

// The most recent `n` week starts, newest first.
export function recentWeekStarts(n, now = Date.now()) {
  let s = periodStart('week', now);
  const arr = [s];
  for (let i = 1; i < n; i++) { s = periodStart('week', s - DAY); arr.push(s); }
  return arr;
}

// --- Nutrition: one grade from four macros ---
// Protein is a floor (hit at least the target); calories/carbs/fat are a ceiling
// (stay at or under the target, over is penalized). Only days with logged meals
// count, so an untracked week is ungraded rather than scored as a perfect 0-calorie.
const MACROS = [
  { key: 'calories', dir: 'ceiling' },
  { key: 'protein',  dir: 'floor' },
  { key: 'carbs',    dir: 'ceiling' },
  { key: 'fat',      dir: 'ceiling' },
];

function macroScore(actual, target, dir) {
  if (!target) return null;
  if (dir === 'floor') return Math.min(actual / target, 1);
  return actual <= target ? 1 : Math.max(0, 1 - (actual - target) / target);
}

export function gradeNutrition(weekStart, weekEnd, logs, goalsHistory) {
  const byDay = {};
  for (const l of logs) {
    if (l.timestamp < weekStart || l.timestamp >= weekEnd) continue;
    const d = new Date(l.timestamp); d.setHours(0, 0, 0, 0);
    const k = d.getTime();
    if (!byDay[k]) byDay[k] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    byDay[k].calories += +l.calories || 0;
    byDay[k].protein += +l.protein || 0;
    byDay[k].carbs += +l.carbs || 0;
    byDay[k].fat += +l.fat || 0;
  }
  const days = Object.keys(byDay);
  if (days.length === 0) return { key: 'nutrition', app: 'nutrisnap', label: 'Nutrition', na: true }; // no meals logged → N/A

  // Per-macro breakdown over the logged days: the daily average actual vs target and
  // that macro's own sub-score. This is what lets the card explain *why* the grade is
  // what it is ("protein under target"), and the overall is just the mean of these.
  const macros = MACROS.map(m => {
    let aSum = 0, tSum = 0, sSum = 0, n = 0;
    for (const k of days) {
      const target = goalsAtDate(+k, goalsHistory)[m.key];
      const s = macroScore(byDay[k][m.key], target, m.dir);
      if (s == null) continue;
      aSum += byDay[k][m.key]; tSum += target; sSum += s; n += 1;
    }
    return n ? { key: m.key, dir: m.dir, avg: aSum / n, target: tSum / n, score: sSum / n } : null;
  }).filter(Boolean);

  if (!macros.length) return { key: 'nutrition', app: 'nutrisnap', label: 'Nutrition', na: true };
  const score = macros.reduce((a, x) => a + x.score, 0) / macros.length;
  return { key: 'nutrition', app: 'nutrisnap', label: 'Nutrition', score, letter: letterFor(score), loggedDays: days.length, macros };
}

// --- Per-app habit targets ---
// Each entry maps a source app's `app_goals` key to how its weekly actual is
// measured: a summed field ('distance'), a count of distinct logged days ('days'),
// or a count of sessions ('sessions').
// `default` is the target used until the user sets their own, so every habit is
// graded out of the box — keep in sync with each app's `goals` config default.
export const HABIT_SOURCES = [
  { app: 'jog',        label: 'Jogging',    goalKey: 'weekly_distance', metric: 'distance', unit: 'km',       default: 10 },
  { app: 'meditation', label: 'Meditation', goalKey: 'weekly_days',     metric: 'days',     unit: 'days',     default: 7 },
  { app: 'workout',    label: 'Workouts',   goalKey: 'weekly_sessions', metric: 'sessions', unit: 'sessions', default: 3 },
];

// Weekly actual from the already-windowed entries: distinct logged days, a count of
// sessions, or a summed field (e.g. distance).
function aggregateValue(metric, entries) {
  if (metric === 'days') return new Set(entries.map(e => new Date(e.timestamp).toDateString())).size;
  if (metric === 'sessions') return entries.length;
  return entries.reduce((s, e) => s + (Number(e[metric]) || 0), 0);
}

export function gradeHabitSource(src, target, entries, weekStart, weekEnd) {
  const t = (target == null || target === '') ? src.default : +target; // fall back to the app default
  if (!(+t > 0)) return null;
  const inWin = entries.filter(e => e.timestamp >= weekStart && e.timestamp < weekEnd);
  if (inWin.length === 0) {
    // Nothing recorded this week → N/A (shown, but not counted toward the overall).
    return { key: src.app, app: src.app, label: src.label, na: true, target: +t, unit: src.unit };
  }
  const actual = aggregateValue(src.metric, inWin);
  const score = Math.min(actual / +t, 1);
  return { key: src.app, app: src.app, label: src.label, score, letter: letterFor(score), actual, target: +t, unit: src.unit };
}

// Build the full card for the week starting `weekStart`.
//   ctx = { nutritionLogs, goalsHistory, appGoals: { jog:{...}, ... }, entriesByApp: { jog:[], ... } }
export function reportCardFor(weekStart, ctx) {
  const weekEnd = weekEndOf(weekStart);
  const items = [];

  const nut = gradeNutrition(weekStart, weekEnd, ctx.nutritionLogs || [], ctx.goalsHistory || []);
  if (nut) items.push(nut);

  for (const src of HABIT_SOURCES) {
    const target = ((ctx.appGoals && ctx.appGoals[src.app]) || {})[src.goalKey];
    const entries = (ctx.entriesByApp && ctx.entriesByApp[src.app]) || [];
    const g = gradeHabitSource(src, target, entries, weekStart, weekEnd);
    if (g) items.push(g);
  }

  // Overall is the GPA of the graded subjects; N/A (nothing recorded) doesn't count.
  const graded = items.filter(i => !i.na);
  const overall = graded.length
    ? (() => { const pts = graded.reduce((a, i) => a + GRADE_POINTS[i.letter], 0) / graded.length; return { points: pts, letter: letterFromPoints(pts) }; })()
    : null;

  return { weekStart, weekEnd, label: weekLabel(weekStart), range: weekRange(weekStart), items, overall };
}
