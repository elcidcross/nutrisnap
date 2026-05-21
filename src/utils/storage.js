import { DEFAULT_GOALS } from './db';

export { DEFAULT_GOALS };

// Returns goals active at the given timestamp (history array sorted ascending by timestamp)
export function goalsAtDate(ts, history) {
  let result = null;
  for (const snap of history) {
    if (snap.timestamp <= ts) result = snap;
    else break;
  }
  if (!result) return DEFAULT_GOALS;
  return { calories: result.calories, protein: result.protein, carbs: result.carbs, fat: result.fat };
}
