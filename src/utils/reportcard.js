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

// ISO-8601 week number of the date at `ts` (week 1 holds the year's first Thursday).
function isoWeek(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;       // Sun → 7
  d.setDate(d.getDate() + 4 - day);  // step to the Thursday of this ISO week
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / DAY) + 1) / 7);
}

// Report cards are labelled by week number (e.g. "Week 24"). Our weeks start Sunday,
// so we read the number off that week's Thursday — each Sunday→Saturday span holds
// exactly one Thursday, giving a stable, consecutive numbering.
export function weekLabel(weekStart) {
  return `Week ${isoWeek(weekStart + 4 * DAY)}`;
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

  let total = 0, n = 0;
  for (const k of days) {
    const goal = goalsAtDate(+k, goalsHistory);
    let daySum = 0, dn = 0;
    for (const m of MACROS) {
      const s = macroScore(byDay[k][m.key], goal[m.key], m.dir);
      if (s != null) { daySum += s; dn += 1; }
    }
    if (dn) { total += daySum / dn; n += 1; }
  }
  if (!n) return { key: 'nutrition', app: 'nutrisnap', label: 'Nutrition', na: true };
  const score = total / n;
  return { key: 'nutrition', app: 'nutrisnap', label: 'Nutrition', score, letter: letterFor(score), loggedDays: n };
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

  // Overall averages only the graded items; N/A (nothing recorded) doesn't count.
  const graded = items.filter(i => !i.na);
  const overall = graded.length
    ? (() => { const s = graded.reduce((a, i) => a + i.score, 0) / graded.length; return { score: s, letter: letterFor(s) }; })()
    : null;

  return { weekStart, weekEnd, label: weekLabel(weekStart), range: weekRange(weekStart), items, overall };
}
