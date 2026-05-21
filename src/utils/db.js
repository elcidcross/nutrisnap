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

export async function getLogs(userId) {
  const { data, error } = await supabase
    .from('logs')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToLog);
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

export { DEFAULT_GOALS, DEFAULT_NOTIF };
