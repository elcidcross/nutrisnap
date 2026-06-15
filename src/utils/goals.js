// Goals progress engine — pure functions (no React, no DB) that turn an objective
// plus the source app's entries into a display state. This is the heart of the
// Goals hub; it is unit-tested in goals.test.js.
//
// Objective shape (see sql/objectives.sql / db.js rowToObjective):
//   { id, app, metric, type, target, direction?, baseline?, period?, dueTs?, status, createdAt, title? }
//
// `type` is one of:
//   'reach'      — trend a measured metric to `target` by `dueTs`. Progress is
//                  measured against `baseline` (snapshot at creation). One-off:
//                  status latches to 'achieved' / 'missed'.
//   'accumulate' — sum an activity field to `target` within the current `period`.
//   'streak'     — hit `target` sessions/days each `period`; tracks a running streak.

const DAY = 86400000;

// Which fields each app exposes, and whether each is a GOAL metric (an outcome you
// drive toward with a deadline) or a HABIT metric (a recurring means graded weekly).
// This split is the product's ends-vs-means distinction: Body measurements are the
// outcomes you aim at; activities are the means. Nutrition is a means too, but it is
// graded specially (one combined macro grade) and so is not an objective metric.
//
// `field` is the camelCase property on that app's entries (see db.js loaders); a
// null `field` means the metric is a count of entries/days rather than a summed
// value. `types` lists the kinds that make sense; the first is the default.
// `lowerBetter` flips the default reach direction (e.g. body fat → 'down').
export const METRICS = {
  body: [
    { metric: 'weight',      field: 'weight',     label: 'Weight',      unit: 'kg', kind: 'goal', types: ['reach'] },
    { metric: 'body_fat',    field: 'bodyFat',    label: 'Body fat',    unit: '%',  kind: 'goal', types: ['reach'], lowerBetter: true },
    { metric: 'muscle_mass', field: 'muscleMass', label: 'Muscle mass', unit: 'kg', kind: 'goal', types: ['reach'] },
  ],
  jog: [
    { metric: 'distance', field: 'distance', label: 'Distance', unit: 'km',   kind: 'habit', types: ['accumulate'] },
    { metric: 'runs',     field: null,       label: 'Runs',     unit: 'runs', kind: 'habit', types: ['accumulate'] },
  ],
  workout: [
    { metric: 'sessions', field: null,       label: 'Sessions', unit: 'sessions', kind: 'habit', types: ['accumulate'] },
    { metric: 'minutes',  field: 'duration', label: 'Minutes',  unit: 'min',      kind: 'habit', types: ['accumulate'] },
  ],
  meditation: [
    { metric: 'days',    field: null,       label: 'Days',    unit: 'days', kind: 'habit', types: ['streak'] },
    { metric: 'minutes', field: 'duration', label: 'Minutes', unit: 'min',  kind: 'habit', types: ['accumulate'] },
  ],
};

const APP_VERBS = { jog: 'Run', workout: 'Work out', meditation: 'Meditate', body: '' };

export function findMetric(app, metric) {
  return (METRICS[app] || []).find(m => m.metric === metric) || null;
}

// Apps offering at least one metric of the given kind ('goal' | 'habit'), in a
// stable order. Used by the Goals/Habits add sheets to scope their app pickers.
export function appsWithKind(kind) {
  return Object.keys(METRICS).filter(app => METRICS[app].some(m => m.kind === kind));
}

export function metricsByKind(app, kind) {
  return (METRICS[app] || []).filter(m => m.kind === kind);
}

// --- Period windows (local time; week starts Sunday, matching the rest of the app) ---

export function periodStart(period, now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'week') d.setDate(d.getDate() - d.getDay());
  else if (period === 'month') d.setDate(1);
  return d.getTime();
}

export function periodEnd(period, start) {
  const d = new Date(start);
  if (period === 'day') d.setDate(d.getDate() + 1);
  else if (period === 'week') d.setDate(d.getDate() + 7);
  else if (period === 'month') d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

function previousPeriodStart(period, start) {
  const d = new Date(start);
  if (period === 'day') d.setDate(d.getDate() - 1);
  else if (period === 'week') d.setDate(d.getDate() - 7);
  else if (period === 'month') d.setMonth(d.getMonth() - 1);
  return d.getTime();
}

export function periodWindow(period, now = Date.now()) {
  const start = periodStart(period, now);
  const end = periodEnd(period, start);
  const label = period === 'day' ? 'today' : period === 'week' ? 'this week' : 'this month';
  return { start, end, label };
}

// --- Aggregation ---

// The measured value of a recurring goal within [start, end). For summed metrics
// (a non-null field) it totals that field; for count metrics it counts distinct
// local days ('days') or entries ('sessions' / any other count metric).
export function aggregate(objective, entries, start, end) {
  const inWin = entries.filter(e => e.timestamp >= start && e.timestamp < end);
  const def = findMetric(objective.app, objective.metric);
  if (def && def.field) {
    return inWin.reduce((sum, e) => sum + (Number(e[def.field]) || 0), 0);
  }
  if (objective.metric === 'days') {
    return new Set(inWin.map(e => new Date(e.timestamp).toDateString())).size;
  }
  return inWin.length; // sessions / generic count
}

// Latest non-null reading of a reach metric (entries may arrive in any order).
function latestValue(entries, field) {
  let best = null;
  for (const e of entries) {
    if (e[field] == null) continue;
    if (best == null || e.timestamp > best.timestamp) best = e;
  }
  return best == null ? null : Number(best[field]);
}

// Latest non-null reading of an app's metric — used to preview the current value in
// the add sheet.
export function currentReading(app, metric, entries) {
  const def = findMetric(app, metric);
  return latestValue(entries, (def && def.field) || metric);
}

// The metric's value as of `ts` (latest non-null reading on or before it) — used to
// snapshot a reach goal's baseline at its chosen start date. Falls back to null.
export function readingAt(app, metric, entries, ts) {
  const def = findMetric(app, metric);
  const field = (def && def.field) || metric;
  let best = null;
  for (const e of entries) {
    if (e[field] == null || e.timestamp > ts) continue;
    if (best == null || e.timestamp > best.timestamp) best = e;
  }
  return best == null ? null : Number(best[field]);
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function elapsedFraction(start, end, now) {
  if (start == null || end == null || end <= start) return 1;
  return clamp01((now - start) / (end - start));
}

// --- State computation ---

function reachState(o, entries, now) {
  const def = findMetric(o.app, o.metric);
  const field = (def && def.field) || o.metric;
  const current = latestValue(entries, field);
  const down = o.direction === 'down';
  const target = Number(o.target);
  const baseline = o.baseline == null ? null : Number(o.baseline);

  let pct = 0;
  if (baseline != null && current != null && baseline !== target) {
    // (baseline - current) / (baseline - target) works for both directions because
    // numerator and denominator flip sign together.
    pct = clamp01((baseline - current) / (baseline - target));
  } else if (current != null) {
    pct = (down ? current <= target : current >= target) ? 1 : 0;
  }

  const hit = current != null && (down ? current <= target : current >= target);
  const past = o.dueTs != null && now >= o.dueTs;

  // Pace runs from the chosen start date (falling back to when the goal was made).
  // `pace` is the time-elapsed fraction (0–1) — where progress "should be" by now;
  // the card draws it as a marker on the bar so behind/ahead is visible at a glance.
  const start = reachStart(o);
  const pace = o.dueTs == null ? null : elapsedFraction(start, o.dueTs, now);

  let status;
  if (o.status === 'achieved' || hit) status = 'achieved';
  else if (o.status === 'missed' || past) status = 'missed';
  else status = pct >= pace ? 'onTrack' : 'behind';

  return { type: 'reach', current, target, baseline, pct, pace, status, done: status === 'achieved' || status === 'missed' };
}

// A reach goal's pace start: the chosen start date, else when the goal was created.
function reachStart(o) {
  return o.startTs != null ? Number(o.startTs) : new Date(o.createdAt).getTime();
}

// Trajectory data for a reach goal's expanded chart + stats — pure (no React/Chart.js).
// `points` are the in-window readings (start→now) sorted ascending; `projected` is a
// linear extrapolation of baseline→current carried to the deadline.
export function reachTrajectory(o, entries = [], now = Date.now()) {
  const def = findMetric(o.app, o.metric);
  const field = (def && def.field) || o.metric;
  const start = reachStart(o);
  const due = o.dueTs == null ? null : Number(o.dueTs);
  const baseline = o.baseline == null ? null : Number(o.baseline);
  const target = Number(o.target);

  const points = entries
    .filter(e => e[field] != null && e.timestamp >= start)
    .map(e => ({ ts: e.timestamp, v: Number(e[field]) }))
    .sort((a, b) => a.ts - b.ts);

  const current = points.length ? points[points.length - 1].v : latestValue(entries, field);
  const from = baseline != null ? baseline : (points.length ? points[0].v : null);

  let ratePerWeek = null;
  let projected = null;
  if (from != null && current != null) {
    const weeks = (now - start) / (7 * DAY);
    if (weeks > 0) ratePerWeek = (current - from) / weeks;
    if (due != null && points.length >= 2 && now > start) {
      const slope = (current - from) / (now - start); // value per ms
      projected = current + slope * (due - now);
    }
  }

  const daysLeft = due == null ? null : Math.ceil((due - now) / DAY);
  return { points, baseline, target, start, due, current, projected, ratePerWeek, daysLeft };
}

function earliestTs(entries) {
  let min = Infinity;
  for (const e of entries) if (e.timestamp < min) min = e.timestamp;
  return min;
}

function recurringState(o, entries, now) {
  const start = periodStart(o.period, now);
  const end = periodEnd(o.period, start);
  const current = aggregate(o, entries, start, end);
  const target = Number(o.target);
  const pct = target > 0 ? clamp01(current / target) : 0;
  const met = current >= target;

  // Running streak: consecutive completed periods ending at (and including, if met)
  // the current one. Walk backwards period-by-period until one misses or we pass
  // the earliest entry.
  let streakCount = met ? 1 : 0;
  const floor = earliestTs(entries);
  let s = previousPeriodStart(o.period, start);
  while (s >= floor) {
    const e = periodEnd(o.period, s);
    if (aggregate(o, entries, s, e) >= target) {
      streakCount += 1;
      s = previousPeriodStart(o.period, s);
    } else break;
  }

  const elapsed = elapsedFraction(start, end, now);
  const status = met ? 'met' : pct >= elapsed ? 'onTrack' : 'behind';

  return { type: o.type, current, target, pct, status, streakCount, met, periodStart: start, periodEnd: end, done: false };
}

export function computeGoalState(objective, entries = [], now = Date.now()) {
  if (objective.type === 'reach') return reachState(objective, entries, now);
  return recurringState(objective, entries, now);
}

// --- Labels ---

const PERIOD_SHORT = { day: 'day', week: 'wk', month: 'mo' };

function trimNum(n) {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : String(num);
}

export function goalTitle(o) {
  if (o.title) return o.title;
  const def = findMetric(o.app, o.metric) || { unit: '', label: o.metric };
  const verb = APP_VERBS[o.app] || '';
  if (o.type === 'reach') {
    if (o.metric === 'body_fat') return `${trimNum(o.target)}% body fat`;
    if (o.metric === 'weight') return `Reach ${trimNum(o.target)} kg`;
    if (o.metric === 'muscle_mass') return `Reach ${trimNum(o.target)} kg muscle`;
    return `Reach ${trimNum(o.target)} ${def.unit}`.trim();
  }
  const per = PERIOD_SHORT[o.period] || o.period;
  if (o.type === 'streak') {
    if (Number(o.target) <= 1 && o.period === 'day') return `${verb || 'Do it'} every day`;
    return `${verb || 'Do it'} ${trimNum(o.target)}×/${per}`;
  }
  // accumulate
  return `${verb ? verb + ' ' : ''}${trimNum(o.target)} ${def.unit}/${per}`.trim();
}

// Human "due" / period text for a card status line.
export function dueLabel(o, now = Date.now()) {
  if (o.type === 'reach') {
    if (o.dueTs == null) return '';
    const days = Math.ceil((o.dueTs - now) / DAY);
    const date = new Date(o.dueTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (days < 0) return `Due ${date}`;
    if (days === 0) return 'Due today';
    return `${days} day${days === 1 ? '' : 's'} left`;
  }
  const { end } = periodWindow(o.period, now);
  const days = Math.ceil((end - now) / DAY);
  if (o.period === 'day') return 'today';
  return `${days} day${days === 1 ? '' : 's'} left`;
}
