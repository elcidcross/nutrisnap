import { letterFor, gradeHabitSource, gradeNutrition, reportCardFor, weekStartOf, weekEndOf, HABIT_SOURCES } from './reportcard';

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
    expect(card.overall.score).toBe(1);
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
    expect(card.overall.score).toBe(1); // only nutrition + jog counted
    expect(card.overall.letter).toBe('A+');
  });

  test('label is the ISO week number', () => {
    const card = reportCardFor(WEEK_START, { entriesByApp: {} });
    expect(card.label).toMatch(/^Week \d{1,2}$/);
  });
});
