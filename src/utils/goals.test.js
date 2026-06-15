import { computeGoalState, goalTitle, aggregate, periodStart, periodEnd, readingAt, reachTrajectory } from './goals';

const DAY = 86400000;
// Fixed reference instant: Wed Jun 10 2026, local noon. Using local-noon offsets
// keeps each `now - k*DAY` on its own calendar day regardless of the test TZ.
const NOW = new Date(2026, 5, 10, 12, 0, 0).getTime();

describe('reach goals', () => {
  const base = {
    id: 'r1', app: 'body', metric: 'body_fat', type: 'reach',
    target: 16, direction: 'down', baseline: 22, dueTs: NOW + 30 * DAY,
    status: 'active', createdAt: new Date(NOW - 10 * DAY).toISOString(),
  };
  // Latest reading is 19.4%; an older reading must be ignored.
  const entries = [
    { id: 'b1', timestamp: NOW - 10 * DAY, bodyFat: 21 },
    { id: 'b2', timestamp: NOW - 1 * DAY, bodyFat: 19.4 },
  ];

  test('progress is measured from baseline toward target', () => {
    const s = computeGoalState(base, entries, NOW);
    expect(s.current).toBe(19.4);
    // (22 - 19.4) / (22 - 16) = 0.4333…
    expect(s.pct).toBeCloseTo(0.4333, 3);
    expect(s.done).toBe(false);
  });

  test('latches to achieved once the target is crossed (even before due)', () => {
    const hit = [{ id: 'b3', timestamp: NOW, bodyFat: 15.5 }];
    const s = computeGoalState(base, hit, NOW);
    expect(s.status).toBe('achieved');
    expect(s.done).toBe(true);
    expect(s.pct).toBe(1);
  });

  test('latches to missed once the deadline passes unmet', () => {
    const overdue = { ...base, dueTs: NOW - DAY };
    const s = computeGoalState(overdue, entries, NOW);
    expect(s.status).toBe('missed');
    expect(s.done).toBe(true);
  });

  test('honors a persisted (already latched) status', () => {
    const s = computeGoalState({ ...base, status: 'missed' }, entries, NOW);
    expect(s.status).toBe('missed');
  });
});

describe('reach goals — start date', () => {
  const body = [
    { id: 'b0', timestamp: NOW - 40 * DAY, bodyFat: 22 },
    { id: 'b1', timestamp: NOW - 10 * DAY, bodyFat: 20 },
    { id: 'b2', timestamp: NOW, bodyFat: 18 },
  ];

  test('readingAt snapshots the value as of a date', () => {
    expect(readingAt('body', 'body_fat', body, NOW - 30 * DAY)).toBe(22); // only b0 is on/before
    expect(readingAt('body', 'body_fat', body, NOW)).toBe(18);
  });

  test('pace is measured from startTs, not createdAt', () => {
    const base = {
      id: 'g', app: 'body', metric: 'body_fat', type: 'reach', target: 16, direction: 'down',
      baseline: 22, status: 'active', createdAt: new Date(NOW - 2 * DAY).toISOString(),
      dueTs: NOW + 10 * DAY,
    };
    // current 18; progress = (22-18)/(22-16) = 0.667.
    // start 40d ago → elapsed = 40/50 = 0.8 > 0.667 → behind.
    expect(computeGoalState({ ...base, startTs: NOW - 40 * DAY }, body, NOW).status).toBe('behind');
    // start 5d ago → elapsed = 5/15 = 0.33 < 0.667 → on track.
    expect(computeGoalState({ ...base, startTs: NOW - 5 * DAY }, body, NOW).status).toBe('onTrack');
  });

  test('pace is the elapsed-time fraction from startTs', () => {
    const base = {
      id: 'g', app: 'body', metric: 'body_fat', type: 'reach', target: 16, direction: 'down',
      baseline: 22, status: 'active', createdAt: new Date(NOW - 2 * DAY).toISOString(),
      dueTs: NOW + 10 * DAY,
    };
    // start 40d ago, due 10d out → elapsed = 40/50 = 0.8.
    expect(computeGoalState({ ...base, startTs: NOW - 40 * DAY }, body, NOW).pace).toBeCloseTo(0.8, 5);
  });
});

describe('reachTrajectory', () => {
  const base = {
    id: 'g', app: 'body', metric: 'body_fat', type: 'reach', target: 16, direction: 'down',
    baseline: 22, status: 'active', createdAt: new Date(NOW - 50 * DAY).toISOString(),
    startTs: NOW - 40 * DAY, dueTs: NOW + 10 * DAY,
  };
  // 22 → 20 → 18 over the window, plus one pre-start reading that must be excluded.
  const body = [
    { id: 'b-old', timestamp: NOW - 60 * DAY, bodyFat: 25 },
    { id: 'b2', timestamp: NOW, bodyFat: 18 },
    { id: 'b1', timestamp: NOW - 20 * DAY, bodyFat: 20 },
    { id: 'b0', timestamp: NOW - 40 * DAY, bodyFat: 22 },
  ];

  test('returns in-window readings sorted ascending and a linear projection', () => {
    const t = reachTrajectory(base, body, NOW);
    expect(t.points.map(p => p.v)).toEqual([22, 20, 18]); // pre-start 25 excluded, sorted
    expect(t.current).toBe(18);
    expect(t.baseline).toBe(22);
    // baseline→current is -4 over 40d; 10 more days → -1 → projected 17.
    expect(t.projected).toBeCloseTo(17, 5);
    expect(t.daysLeft).toBe(10);
  });

  test('projection is null with fewer than two in-window readings', () => {
    const one = [{ id: 'b', timestamp: NOW, bodyFat: 18 }];
    expect(reachTrajectory(base, one, NOW).projected).toBe(null);
  });
});

describe('accumulate goals', () => {
  const obj = {
    id: 'a1', app: 'jog', metric: 'distance', type: 'accumulate',
    target: 10, period: 'week', status: 'active', createdAt: new Date(NOW - 20 * DAY).toISOString(),
  };
  // This week's runs (Sun Jun 7 → Sat Jun 13) sum to 6.4 km.
  const entries = [
    { id: 'j1', timestamp: NOW - 30 * DAY, distance: 5 },   // previous week, excluded
    { id: 'j2', timestamp: NOW - 2 * DAY, distance: 4.0 },
    { id: 'j3', timestamp: NOW - 1 * DAY, distance: 2.4 },
  ];

  test('sums the field within the current period', () => {
    const s = computeGoalState(obj, entries, NOW);
    expect(s.current).toBeCloseTo(6.4, 5);
    expect(s.pct).toBeCloseTo(0.64, 5);
    expect(s.met).toBe(false);
  });

  test('aggregate respects the window bounds', () => {
    const start = periodStart('week', NOW);
    const end = periodEnd('week', start);
    expect(aggregate(obj, entries, start, end)).toBeCloseTo(6.4, 5);
  });
});

describe('streak goals', () => {
  const obj = {
    id: 's1', app: 'meditation', metric: 'days', type: 'streak',
    target: 1, period: 'day', status: 'active', createdAt: new Date(NOW - 20 * DAY).toISOString(),
  };
  // Meditated today + the 2 prior days, then a gap.
  const entries = [
    { id: 'm1', timestamp: NOW },
    { id: 'm2', timestamp: NOW - 1 * DAY },
    { id: 'm3', timestamp: NOW - 2 * DAY },
    { id: 'm4', timestamp: NOW - 5 * DAY },
  ];

  test('counts consecutive completed periods including today', () => {
    const s = computeGoalState(obj, entries, NOW);
    expect(s.met).toBe(true);
    expect(s.streakCount).toBe(3);
  });

  test('a missed current period does not break the prior streak count', () => {
    const noToday = entries.filter(e => e.timestamp !== NOW);
    const s = computeGoalState(obj, noToday, NOW);
    expect(s.met).toBe(false);
    // today incomplete (0), but yesterday + day before still counted
    expect(s.streakCount).toBe(2);
  });
});

describe('goalTitle', () => {
  test('derives readable labels per type', () => {
    expect(goalTitle({ app: 'body', metric: 'body_fat', type: 'reach', target: 16 })).toBe('16% body fat');
    expect(goalTitle({ app: 'jog', metric: 'distance', type: 'accumulate', target: 10, period: 'week' })).toBe('Run 10 km/wk');
    expect(goalTitle({ app: 'meditation', metric: 'days', type: 'streak', target: 1, period: 'day' })).toBe('Meditate every day');
  });

  test('prefers a custom title when present', () => {
    expect(goalTitle({ title: 'Summer shred', app: 'body', metric: 'weight', type: 'reach', target: 70 })).toBe('Summer shred');
  });
});
