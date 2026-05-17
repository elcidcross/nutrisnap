export const KEYS = {
  LOGS: 'nutrisnap_logs_v3',
  GOALS: 'nutrisnap_goals_v1',
  NOTIF: 'nutrisnap_notif_v1',
};

export const DEFAULT_GOALS = { calories: 2000, protein: 150, carbs: 200, fat: 65 };
export const DEFAULT_NOTIF = { enabled: false, times: ['08:00', '13:00', '18:00'], nudgeEnabled: true };

export function load(key, fallback) {
  try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : fallback; }
  catch { return fallback; }
}

export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
