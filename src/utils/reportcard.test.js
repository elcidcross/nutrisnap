import { letterFor, gradeHabitSource, gradeNutrition, reportCardFor, weekStartOf, weekEndOf, HABIT_SOURCES, buildNoteContext } from './reportcard';

const DAY = 86400000;
const NOW = new Date(2026, 5, 10, 12, 0, 0).getTime(); // Wed Jun 10 2026, local noon
const WEEK_START = weekStartOf(NOW);
const WEEK_END = weekEndOf(WEEK_START);
const GOALS_HISTORY = [{ timestamp: 0, calories: 2000, protein: 150, carbs: 200, fat: 65 }];

describe('letterFor', () => {
  test('maps scores onto the US scale', () => {
    expect(letterFor(1)).toBe('A+');
    expect(letterFor(0.97)).toBe('A+');
    expect(letterFor(0.93)).toBe('A');
    expect(letterFor(0.9)).toBe('A-');
    expect(letterFor(0.8)).toBe('B-');
    expect(letterFor(0.6)).toBe('D-');
    expect(letterFor(0.599)).toBe('F');
    expect(letterFor(0)).toBe('F');
  });
});

describe('gradeHabitSource', () => {
  const jog = HABIT_SOURCES.find(s => s.app === 'jog');
  const med = HABIT_SOURCES.find(s => s.app === 'meditation');

  test('summed field (jog distance) vs the app target', () => {
    const entries = [
      { timestamp: NOW - 2 * DAY, distance: 4.0 },
      { timestamp: NOW - 1 * DAY, distance: 2.4 },
      { timestamp: NOW - 30 * DAY, distance: 9 }, // other weeks, excluded
    ];
    const g = gradeHabitSource(jog, 10, entries, WEEK_START, WEEK_END);
    expect(g.actual).toBeCloseTo(6.4, 5);
    expect(g.score).toBeCloseTo(0.64, 5);
    expect(g.letter).toBe('D');
  });

  test('distinct logged days (meditation) vs days/week target', () => {
    const entries = [NOW + DAY, NOW, NOW - DAY, NOW - 2 * DAY, NOW - 3 * DAY].map(t => ({ timestamp: t }));
    const g = gradeHabitSource(med, 7, entries, WEEK_START, WEEK_END);
    expect(g.actual).toBe(5);
    expect(g.letter).toBe('C-'); // 5/7 = 71.4%
  });

  test('unset target falls back to the app default', () => {
    const g = gradeHabitSource(jog, null, [{ timestamp: NOW, distance: 10 }], WEEK_START, WEEK_END);
    expect(g.target).toBe(jog.default); // 10
    expect(g.score).toBe(1);
  });

  test('an explicit target overrides the default', () => {
    const g = gradeHabitSource(jog, 20, [{ timestamp: NOW, distance: 10 }], WEEK_START, WEEK_END);
    expect(g.target).toBe(20);
    expect(g.score).toBe(0.5);
  });

  test('no activity recorded → N/A, not F', () => {
    const g = gradeHabitSource(jog, 10, [], WEEK_START, WEEK_END);
    expect(g.na).toBe(true);
    expect(g.letter).toBeUndefined();
  });
});

describe('gradeNutrition', () => {
  test('combines four macros into one grade over logged days', () => {
    const logs = [{ timestamp: NOW, calories: 1800, protein: 150, carbs: 180, fat: 60 }];
    const g = gradeNutrition(WEEK_START, WEEK_END, logs, GOALS_HISTORY);
    expect(g.score).toBe(1); // under calorie/carb/fat ceiling, hit protein floor
    expect(g.letter).toBe('A+');
  });

  test('protein shortfall drags the single grade down', () => {
    const logs = [{ timestamp: NOW, calories: 1800, protein: 75, carbs: 180, fat: 60 }];
    const g = gradeNutrition(WEEK_START, WEEK_END, logs, GOALS_HISTORY);
    // (1 + 0.5 + 1 + 1) / 4 = 0.875
    expect(g.score).toBeCloseTo(0.875, 5);
    expect(g.letter).toBe('B+');
  });

  test('an untracked week is N/A, not a free A', () => {
    const g = gradeNutrition(WEEK_START, WEEK_END, [], GOALS_HISTORY);
    expect(g.na).toBe(true);
    expect(g.letter).toBeUndefined();
  });
});

describe('reportCardFor', () => {
  test('grades nutrition once plus each habit (defaults applied), averaged', () => {
    const weekDays = n => [...Array(n)].map((_, i) => ({ timestamp: WEEK_START + i * DAY + 12 * 3600000 }));
    const ctx = {
      nutritionLogs: [{ timestamp: NOW, calories: 1800, protein: 150, carbs: 180, fat: 60 }], // A+ (1.0)
      goalsHistory: GOALS_HISTORY,
      appGoals: {}, // none set → jog/meditation/workout use their defaults (10 / 7 / 3)
      entriesByApp: {
        jog: [{ timestamp: NOW - 1 * DAY, distance: 10 }], // 10/10 = 1.0
        meditation: weekDays(7),                           // 7/7  = 1.0
        workout: weekDays(3),                              // 3/3  = 1.0
      },
    };
    const card = reportCardFor(WEEK_START, ctx);
    expect(card.items.map(i => i.key)).toEqual(['nutrition', 'jog', 'meditation', 'workout']);
    expect(card.items.filter(i => i.key === 'nutrition')).toHaveLength(1);
    expect(card.overall.letter).toBe('A+');
  });

  test('N/A items are shown but excluded from the overall', () => {
    const ctx = {
      nutritionLogs: [{ timestamp: NOW, calories: 1800, protein: 150, carbs: 180, fat: 60 }], // 1.0
      goalsHistory: GOALS_HISTORY,
      appGoals: {},
      entriesByApp: { jog: [{ timestamp: NOW - DAY, distance: 10 }] }, // jog 1.0; meditation & workout: nothing
    };
    const card = reportCardFor(WEEK_START, ctx);
    expect(card.items.find(i => i.app === 'meditation').na).toBe(true);
    expect(card.items.find(i => i.app === 'workout').na).toBe(true);
    expect(card.overall.letter).toBe('A+'); // only nutrition + jog counted
  });

  test('overall is the GPA of subject grades, not the raw-percent average', () => {
    const ctx = {
      nutritionLogs: [{ timestamp: NOW, calories: 5000, protein: 0, carbs: 600, fat: 200 }], // F
      goalsHistory: GOALS_HISTORY,
      appGoals: { jog: { weekly_distance: 10 } },
      entriesByApp: { jog: [{ timestamp: NOW - DAY, distance: 10 }] }, // A+
    };
    const card = reportCardFor(WEEK_START, ctx);
    // A+ (4.3) and F (0) → GPA 2.15 → rounded down to C (a true middle, not F)
    expect(card.overall.letter).toBe('C');
  });

  test('A+ overall requires every subject to be A+ (no rounding up)', () => {
    const ctx = {
      nutritionLogs: [{ timestamp: NOW, calories: 1800, protein: 150, carbs: 180, fat: 60 }], // A+
      goalsHistory: GOALS_HISTORY,
      appGoals: { jog: { weekly_distance: 10 } },
      entriesByApp: { jog: [{ timestamp: NOW - DAY, distance: 9.2 }] }, // 92% → A-
    };
    // A+ (4.3) + A- (3.7) = 4.0 → A, not A+
    expect(reportCardFor(WEEK_START, ctx).overall.letter).toBe('A');
  });

  test('label is the ISO year + week number', () => {
    const card = reportCardFor(WEEK_START, { entriesByApp: {} });
    expect(card.label).toMatch(/^\d{4} Week \d{1,2}$/);
  });
});

describe('buildNoteContext', () => {
  test('produces a compact prompt context (subjects, trend, goals)', () => {
    const week = reportCardFor(WEEK_START, {
      nutritionLogs: [{ timestamp: NOW, calories: 1800, protein: 75, carbs: 180, fat: 60 }],
      goalsHistory: GOALS_HISTORY,
      appGoals: { jog: { weekly_distance: 10 } },
      entriesByApp: { jog: [{ timestamp: NOW - DAY, distance: 6.4 }] },
    });
    const prior = [{ label: '2026 Week 23', overall: { letter: 'C' } }];
    const goals = [{ goal: '16% body fat', current: 17.8, target: 16, unit: '%', dueIn: '30 days left', status: 'behind' }];

    const out = buildNoteContext(week, prior, goals);
    expect(out.overall).toBe(week.overall.letter);
    const nutrition = out.subjects.find(s => s.subject === 'Nutrition');
    expect(nutrition.perDay.find(m => m.macro === 'protein')).toMatchObject({ avg: 75, target: 150, want: 'at least' });
    const jog = out.subjects.find(s => s.subject === 'Jogging');
    expect(jog).toMatchObject({ thisWeek: 6.4, weeklyTarget: 10, unit: 'km' });
    expect(out.subjects.some(s => s.na)).toBe(false); // N/A subjects excluded
    expect(out.trend).toEqual([{ week: '2026 Week 23', overall: 'C' }]);
    expect(out.goals).toBe(goals);
  });
});

describe('nutrition breakdown', () => {
  test('exposes a per-macro avg/target/score for the "why"', () => {
    const logs = [{ timestamp: NOW, calories: 1800, protein: 75, carbs: 180, fat: 60 }];
    const g = gradeNutrition(WEEK_START, WEEK_END, logs, GOALS_HISTORY);
    const protein = g.macros.find(m => m.key === 'protein');
    expect(protein).toMatchObject({ avg: 75, target: 150, dir: 'floor' });
    expect(protein.score).toBe(0.5);
    expect(g.macros.find(m => m.key === 'calories').score).toBe(1);
  });
});
