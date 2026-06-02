import { supabase } from './supabase';

const DEFAULT_GOALS = { calories: 2000, protein: 150, carbs: 200, fat: 65 };
const DEFAULT_NOTIF = { enabled: false, times: ['08:00', '13:00', '18:00'], nudgeEnabled: true };

function rowToLog(row) {
  return {
    id: row.id,
    timestamp: row.timestamp,
    name: row.name,
    imageUrl: row.image_url || null,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    fiber: row.fiber,
    model: row.model || null,
    amount: row.amount ?? null,
    unit: row.unit ?? null,
    refAmount: row.ref_amount ?? null,
    refUnit: row.ref_unit ?? null,
  };
}

function logToRow(userId, entry) {
  return {
    id: entry.id,
    user_id: userId,
    timestamp: entry.timestamp,
    name: entry.name,
    image_url: entry.imageUrl || null,
    calories: entry.calories || 0,
    protein: entry.protein || 0,
    carbs: entry.carbs || 0,
    fat: entry.fat || 0,
    fiber: entry.fiber || 0,
    model: entry.model || null,
    amount: entry.amount ?? null,
    unit: entry.unit ?? null,
    ref_amount: entry.refAmount ?? null,
    ref_unit: entry.refUnit ?? null,
  };
}

// Initial load excludes image_url — the base64 thumbnails are the entire
// variable cost of this query (it grows ~10KB per logged meal), so we keep
// them off the app's critical path and backfill them via getLogImages.
const LOG_COLS = 'id,timestamp,name,calories,protein,carbs,fat,fiber,model,amount,unit,ref_amount,ref_unit';

export async function getLogs(userId) {
  const { data, error } = await supabase
    .from('logs')
    .select(LOG_COLS)
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToLog);
}

// Thumbnails only, fetched after the UI has rendered and merged in by id.
export async function getLogImages(userId) {
  const { data, error } = await supabase
    .from('logs')
    .select('id,image_url')
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

export async function addLog(userId, entry) {
  const { error } = await supabase.from('logs').insert(logToRow(userId, entry));
  if (error) throw error;
}

export async function updateLog(userId, id, updates) {
  const row = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.calories !== undefined) row.calories = updates.calories;
  if (updates.protein !== undefined) row.protein = updates.protein;
  if (updates.carbs !== undefined) row.carbs = updates.carbs;
  if (updates.fat !== undefined) row.fat = updates.fat;
  if (updates.fiber !== undefined) row.fiber = updates.fiber;
  if (updates.amount !== undefined) row.amount = updates.amount;
  if (updates.unit !== undefined) row.unit = updates.unit;
  if (updates.model !== undefined) row.model = updates.model;
  if (updates.refAmount !== undefined) row.ref_amount = updates.refAmount;
  if (updates.refUnit !== undefined) row.ref_unit = updates.refUnit;
  if (updates.timestamp !== undefined) row.timestamp = updates.timestamp;
  const { error } = await supabase.from('logs').update(row).eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function deleteLog(userId, id) {
  const { error } = await supabase.from('logs').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function bulkAddLogs(userId, entries) {
  if (!entries.length) return;
  const rows = entries.map(e => logToRow(userId, e));
  const { error } = await supabase.from('logs').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

export async function getGoals(userId) {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_GOALS;
  return { calories: data.calories, protein: data.protein, carbs: data.carbs, fat: data.fat };
}

export async function saveGoals(userId, goals) {
  const { error } = await supabase
    .from('goals')
    .upsert({ user_id: userId, ...goals }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function getGoalsHistory(userId) {
  const { data, error } = await supabase
    .from('goals_history')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return (data || []).map(row => ({
    timestamp: row.timestamp,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
  }));
}

export async function addGoalsHistoryEntry(userId, snap) {
  const { error } = await supabase.from('goals_history').insert({ user_id: userId, ...snap });
  if (error) throw error;
}

export async function getNotifSettings(userId) {
  const { data, error } = await supabase
    .from('notif_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_NOTIF;
  return { enabled: data.enabled, times: data.times, nudgeEnabled: data.nudge_enabled };
}

export async function saveNotifSettings(userId, settings) {
  const { error } = await supabase.from('notif_settings').upsert({
    user_id: userId,
    enabled: settings.enabled,
    times: settings.times,
    nudge_enabled: settings.nudgeEnabled,
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

// Food library
export async function getFoodLibrary(userId) {
  const { data, error } = await supabase
    .from('food_library')
    .select('*')
    .eq('user_id', userId)
    .order('name');
  if (error) throw error;
  return (data || []).map(row => ({
    name: row.name,
    refAmount: row.ref_amount,
    refUnit: row.ref_unit,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    fiber: row.fiber,
  }));
}

export async function saveFoodToLibrary(userId, entry) {
  // Find existing row by case-insensitive name; insert or update accordingly.
  // Supabase upsert can't use functional unique indexes, so we do this manually.
  const { data: existing } = await supabase
    .from('food_library')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', entry.name)
    .maybeSingle();
  const row = {
    user_id: userId,
    name: entry.name,
    ref_amount: entry.refAmount,
    ref_unit: entry.refUnit,
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    fiber: entry.fiber || 0,
  };
  const { error } = existing
    ? await supabase.from('food_library').update(row).eq('id', existing.id)
    : await supabase.from('food_library').insert(row);
  if (error) throw error;
}

export async function updateFoodInLibrary(userId, name, macros) {
  const { error } = await supabase.from('food_library').update({
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    fiber: macros.fiber || 0,
  }).eq('user_id', userId).ilike('name', name);
  if (error) throw error;
}

// Activities each get their own table (sql/jogs.sql, sql/workouts.sql,
// sql/meditations.sql) so a column means exactly one thing per table — notably
// `duration` is seconds for jogs but minutes for workouts/meditations. The
// tables are structurally identical CRUD-wise, so one factory builds the
// load/save/update/remove for each from its column list. These columns have no
// snake_case ↔ camelCase gap, so no field remapping is needed (unlike body_fat).
function activityTable(table, cols) {
  const toRow = (userId, e) => {
    const row = { id: e.id, user_id: userId, timestamp: e.timestamp };
    cols.forEach(c => { row[c] = e[c] ?? null; });
    return row;
  };
  const toObj = (row) => {
    const o = { id: row.id, timestamp: row.timestamp };
    cols.forEach(c => { o[c] = row[c] ?? null; });
    return o;
  };
  return {
    async load(userId) {
      const { data, error } = await supabase
        .from(table).select('*').eq('user_id', userId)
        .order('timestamp', { ascending: false });
      if (error) throw error;
      return (data || []).map(toObj);
    },
    async save(userId, entry) {
      const { error } = await supabase.from(table).insert(toRow(userId, entry));
      if (error) throw error;
    },
    async update(userId, id, updates) {
      const row = {};
      cols.forEach(c => { if (updates[c] !== undefined) row[c] = updates[c]; });
      if (updates.timestamp !== undefined) row.timestamp = updates.timestamp;
      const { error } = await supabase.from(table).update(row).eq('id', id).eq('user_id', userId);
      if (error) throw error;
    },
    async remove(userId, id) {
      const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;
    },
  };
}

export const jogs = activityTable('jogs', ['duration', 'distance', 'notes']);
export const workouts = activityTable('workouts', ['duration', 'name', 'notes']);
export const meditations = activityTable('meditations', ['duration', 'notes']);

// Body metrics (weight / body fat) — see sql/body_metrics.sql.
function rowToMetric(row) {
  return {
    id: row.id,
    timestamp: row.timestamp,
    weight: row.weight ?? null,
    bodyFat: row.body_fat ?? null,
    notes: row.notes ?? null,
  };
}

function metricToRow(userId, entry) {
  return {
    id: entry.id,
    user_id: userId,
    timestamp: entry.timestamp,
    weight: entry.weight ?? null,
    body_fat: entry.bodyFat ?? null,
    notes: entry.notes ?? null,
  };
}

export async function getBodyMetrics(userId) {
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToMetric);
}

export async function saveBodyMetric(userId, entry) {
  const { error } = await supabase.from('body_metrics').insert(metricToRow(userId, entry));
  if (error) throw error;
}

export async function updateBodyMetric(userId, id, updates) {
  const row = {};
  if (updates.weight !== undefined) row.weight = updates.weight;
  if (updates.bodyFat !== undefined) row.body_fat = updates.bodyFat;
  if (updates.notes !== undefined) row.notes = updates.notes;
  if (updates.timestamp !== undefined) row.timestamp = updates.timestamp;
  const { error } = await supabase.from('body_metrics').update(row).eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function deleteBodyMetric(userId, id) {
  const { error } = await supabase.from('body_metrics').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export { DEFAULT_GOALS, DEFAULT_NOTIF };
