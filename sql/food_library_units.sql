-- Add a natural "serving unit" to food_library so a food can remember the unit
-- people naturally count it in (e.g. bread → slices) along with the weight of one
-- such unit. Macros stay normalized per-100g (ref_amount=100, ref_unit='g'); these
-- two columns are purely a display/input convenience used by the Snap review screen.
--
--   unit_label  text     -- e.g. 'slice', 'egg', 'cookie'; NULL when the food is
--                        -- only sensibly measured by weight
--   unit_grams  numeric  -- approximate grams in one unit_label (e.g. 30 for a slice)
--
-- Additive + nullable, so existing rows (and the gram-only flow) are unaffected.

alter table food_library add column if not exists unit_label text;
alter table food_library add column if not exists unit_grams numeric;
