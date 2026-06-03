import React, { useState, useEffect, useMemo } from 'react';
import { analyzeFood, analyzeFoodText } from '../utils/api';

const COLORS = { cal: '#1d9e75', protein: '#d4537e', carbs: '#378add', fat: '#ba7517', fiber: '#639922' };

// A reviewed-but-unsaved analysis lives only in component state, so it's lost if
// iOS Safari evicts/reloads the page (e.g. when the phone locks). Persist a small
// draft of the review screen to localStorage so it can be restored on remount.
const DRAFT_KEY = 'nutrisnap_snap_draft';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Bumped to 2 when the review model switched from (refAmount/refUnit + refMacros)
// to (per-100g macros + a unit lens). Older drafts are silently dropped.
const DRAFT_VERSION = 2;

function saveDraft(obj) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(obj)); } catch { /* quota / private mode */ }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}
function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d && d.v === DRAFT_VERSION && Date.now() - d.savedAt < DRAFT_MAX_AGE_MS) return d;
  } catch { /* corrupt */ }
  clearDraft();
  return null;
}

function r1(n) { return Math.round(n * 10) / 10; }

// Scale per-100g macros to an arbitrary gram amount. `per100` is kept as the
// single source of truth (unrounded floats); everything shown to the user —
// the per-unit card and the totals — is derived from it on the fly.
function scaleFromPer100(grams, per100) {
  const ratio = grams / 100;
  return {
    calories: Math.round(ratio * (per100.calories || 0)),
    protein:  r1(ratio * (per100.protein || 0)),
    carbs:    r1(ratio * (per100.carbs || 0)),
    fat:      r1(ratio * (per100.fat || 0)),
    fiber:    r1(ratio * (per100.fiber || 0)),
  };
}

const EMPTY_PER100 = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

export default function SnapView({ onSaved, onSaveToLibrary, onUpdateLibrary, foodLibrary = [] }) {
  const [state, setState] = useState('idle');
  const [imgUrl, setImgUrl] = useState(null);
  const [imgThumb, setImgThumb] = useState(null);
  const [imgB64, setImgB64] = useState(null);
  const [mealName, setMealName] = useState('');
  const [amount, setAmount] = useState(0);          // count in the active unit (grams or pieces)
  const [unitMode, setUnitMode] = useState('g');    // 'g' | 'piece'
  const [unitLabel, setUnitLabel] = useState('');   // natural piece name, e.g. 'slice'
  const [unitGrams, setUnitGrams] = useState(0);    // grams in one piece
  const [per100, setPer100] = useState(EMPTY_PER100); // source of truth (per 100 g, floats)
  const [components, setComponents] = useState([]);
  const [libraryDirty, setLibraryDirty] = useState(false);
  const [err, setErr] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [modelUsed, setModelUsed] = useState(null);
  const [restored, setRestored] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const suggestions = useMemo(() => {
    const q = textInput.trim().toLowerCase();
    if (!q) return [];
    const starts = [], contains = [];
    for (const f of foodLibrary) {
      const n = (f.name || '').toLowerCase();
      if (n.startsWith(q)) starts.push(f);
      else if (n.includes(q)) contains.push(f);
    }
    const byName = (a, b) => a.name.localeCompare(b.name);
    return [...starts.sort(byName), ...contains.sort(byName)].slice(0, 8);
  }, [textInput, foodLibrary]);
  const showDropdown = dropdownOpen && suggestions.length > 0;

  // Map a saved food_library row onto the review state. New rows store macros
  // per-100g (refUnit 'g') plus an optional natural unit (unitLabel/unitGrams);
  // legacy non-gram rows store macros per-1-unit, which we best-effort convert.
  const applyFood = (food) => {
    const ra = food.refAmount || 100;
    const ru = food.refUnit || 'g';
    const m = {
      calories: food.calories || 0, protein: food.protein || 0,
      carbs: food.carbs || 0, fat: food.fat || 0, fiber: food.fiber || 0,
    };
    const label = food.unitLabel || (ru !== 'g' ? ru : '');
    const grams = +food.unitGrams || (ru !== 'g' ? 100 : 0); // legacy: assume 100g basis
    const basis = ru === 'g' ? ra : grams; // grams that `m` represents
    const p100 = {
      calories: basis > 0 ? m.calories * 100 / basis : 0,
      protein:  basis > 0 ? m.protein  * 100 / basis : 0,
      carbs:    basis > 0 ? m.carbs    * 100 / basis : 0,
      fat:      basis > 0 ? m.fat      * 100 / basis : 0,
      fiber:    basis > 0 ? m.fiber    * 100 / basis : 0,
    };
    const piece = !!label && grams > 0;
    setMealName(food.name);
    setPer100(p100);
    setUnitLabel(label);
    setUnitGrams(grams);
    setUnitMode(piece ? 'piece' : 'g');
    setAmount(piece ? 1 : (ru === 'g' ? ra : 100));
    setComponents([]);
    setModelUsed(null);
    setLibraryDirty(false);
    setRestored(false);
    setErr(null);
    setDropdownOpen(false);
    setHighlightIdx(-1);
    setTextInput('');
    setState('review');
  };

  const handleInputKeyDown = (e) => {
    if (showDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx(i => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx(i => (i <= 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDropdownOpen(false);
        setHighlightIdx(-1);
        return;
      }
      if (e.key === 'Tab') {
        setDropdownOpen(false);
        setHighlightIdx(-1);
        return;
      }
      if (e.key === 'Enter' && highlightIdx >= 0 && highlightIdx < suggestions.length) {
        e.preventDefault();
        applyFood(suggestions[highlightIdx]);
        return;
      }
    }
    if (e.key === 'Enter') analyzeText();
  };

  // Everything below is derived from per100 + the active unit.
  const isPiece = unitMode === 'piece';
  const cardGrams = isPiece ? (+unitGrams || 0) : 100;           // grams the per-unit card represents
  const totalGrams = isPiece ? (+amount || 0) * (+unitGrams || 0) : (+amount || 0);
  const cardMacros = scaleFromPer100(cardGrams, per100);         // per 1 piece / per 100 g
  const macros = scaleFromPer100(totalGrams, per100);            // totals for the logged amount

  // Per-100g for persistence (rounded once, at the edges).
  const per100Rounded = () => ({
    calories: Math.round(per100.calories || 0),
    protein:  r1(per100.protein || 0),
    carbs:    r1(per100.carbs || 0),
    fat:      r1(per100.fat || 0),
    fiber:    r1(per100.fiber || 0),
  });

  // Edit a per-unit card field → write back into the per-100g source of truth.
  const editCardMacro = (key, value) => {
    const v = +value || 0;
    setPer100(p => ({ ...p, [key]: cardGrams > 0 ? v * 100 / cardGrams : 0 }));
    setLibraryDirty(true);
  };

  // Switch the working unit while keeping the logged total weight constant.
  const useGrams = () => {
    if (!isPiece) return;
    setAmount(r1(totalGrams));
    setUnitMode('g');
  };
  const usePieces = () => {
    if (isPiece) return;
    let label = unitLabel || 'piece';
    let g = +unitGrams || 0;
    if (g <= 0) { g = Math.max(1, Math.round(totalGrams)) || 50; setLibraryDirty(true); }
    if (!unitLabel) { label = 'piece'; setLibraryDirty(true); }
    setUnitLabel(label);
    setUnitGrams(g);
    setAmount(r1(g > 0 ? totalGrams / g : 1));
    setUnitMode('piece');
  };

  // Editing the piece weight keeps the per-100g density (and the piece count)
  // fixed, so the per-piece macros and totals rescale automatically.
  const changeUnitGrams = (value) => {
    setUnitGrams(value === '' ? '' : +value);
    setLibraryDirty(true);
  };

  const changeUnitLabel = (value) => {
    setUnitLabel(value);
    setLibraryDirty(true);
  };

  // Restore a previously reviewed analysis after a reload (e.g. iPhone lock).
  useEffect(() => {
    const d = loadDraft();
    if (!d) return;
    setImgThumb(d.imgThumb || null);
    setMealName(d.mealName || '');
    setAmount(d.amount ?? 0);
    setUnitMode(d.unitMode || 'g');
    setUnitLabel(d.unitLabel || '');
    setUnitGrams(d.unitGrams ?? 0);
    setPer100(d.per100 || EMPTY_PER100);
    setComponents(Array.isArray(d.components) ? d.components : []);
    setModelUsed(d.modelUsed || null);
    setLibraryDirty(!!d.libraryDirty);
    setRestored(true);
    setState('review');
  }, []);

  // Keep the draft in sync while reviewing; clear it the moment we leave review
  // (covers both confirm and discard, which reset state to 'idle').
  useEffect(() => {
    if (state === 'review') {
      saveDraft({
        v: DRAFT_VERSION, savedAt: Date.now(), imgThumb, mealName, amount,
        unitMode, unitLabel, unitGrams, per100, components, modelUsed, libraryDirty,
      });
    } else {
      clearDraft();
    }
  }, [state, imgThumb, mealName, amount, unitMode, unitLabel, unitGrams, per100, components, modelUsed, libraryDirty]);

  // Re-encode the image as JPEG at a bounded max dimension. The analysis-grade
  // size (1600px / q0.85) keeps the request body well under Vercel's 4.5 MB
  // serverless limit while preserving enough detail for the AI to identify food.
  const makeJpeg = (objectUrl, maxDim, quality) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Could not read photo'));
    img.src = objectUrl;
  });

  const handleFile = async e => {
    const f = e.target.files[0]; if (!f) return;
    setErr(null);
    const objectUrl = URL.createObjectURL(f);
    setImgUrl(objectUrl);
    try {
      const [analysisDataUrl, thumbDataUrl] = await Promise.all([
        makeJpeg(objectUrl, 1600, 0.85),
        makeJpeg(objectUrl, 300, 0.7),
      ]);
      setImgB64(analysisDataUrl.split(',')[1]);
      setImgThumb(thumbDataUrl);
      setState('preview');
    } catch (err) {
      setErr(err.message || 'Could not read photo');
    }
  };

  const runAnalysis = async (analyzeFn) => {
    if (!localStorage.getItem('nutrisnap_api_key')) {
      setErr('No API key set. Go to Goals & Settings → AI Provider to add one.');
      return false;
    }
    setState('analyzing');
    setErr(null);
    try {
      const a = await analyzeFn();
      const name = a.name || 'Meal';
      const grams = a.amount || 0; // AI always returns total weight in grams
      const totals = {
        calories: a.calories || 0,
        protein: a.protein || 0,
        carbs: a.carbs || 0,
        fat: a.fat || 0,
        fiber: a.fiber || 0,
      };
      // Per-100g density is the source of truth; everything else derives from it.
      const ratio = grams > 0 ? 100 / grams : 0;
      const p100 = {
        calories: totals.calories * ratio,
        protein:  totals.protein  * ratio,
        carbs:    totals.carbs    * ratio,
        fat:      totals.fat      * ratio,
        fiber:    totals.fiber    * ratio,
      };
      // If the AI named a natural counting unit, default the review to it.
      const su = (a.servingUnit && String(a.servingUnit).trim()) || '';
      const sg = +a.servingGrams || 0;
      const piece = !!su && sg > 0;
      setMealName(name);
      setPer100(p100);
      setUnitLabel(su);
      setUnitGrams(piece ? sg : 0);
      setUnitMode(piece ? 'piece' : 'g');
      setAmount(piece ? r1(grams / sg) : grams);
      setComponents(Array.isArray(a.components) ? a.components : []);
      setModelUsed(a._modelUsed || null);
      setLibraryDirty(false);
      setRestored(false);
      onSaveToLibrary({
        name, refAmount: 100, refUnit: 'g',
        calories: Math.round(p100.calories), protein: r1(p100.protein),
        carbs: r1(p100.carbs), fat: r1(p100.fat), fiber: r1(p100.fiber),
        unitLabel: piece ? su : null, unitGrams: piece ? sg : null,
      });
      setState('review');
      return true;
    } catch (e) {
      setErr(e.message || 'Could not analyze. Please try again.');
      return false;
    }
  };

  const analyze = async () => {
    const ok = await runAnalysis(() => analyzeFood(imgB64, 'image/jpeg'));
    if (!ok) setState('preview');
  };

  const analyzeText = async () => {
    if (!textInput.trim()) return;
    const ok = await runAnalysis(() => analyzeFoodText(textInput.trim()));
    if (!ok) setState('idle');
  };

  const confirm = () => {
    // Always persist the log in grams — the unit was only an input convenience.
    onSaved({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      timestamp: Date.now(),
      name: mealName,
      imageUrl: imgThumb || imgUrl,
      model: modelUsed,
      amount: r1(totalGrams),
      unit: 'g',
      refAmount: 100,
      refUnit: 'g',
      ...macros,
    });
    if (libraryDirty) onUpdateLibrary(mealName, {
      ...per100Rounded(),
      unitLabel: unitLabel || null,
      unitGrams: (unitLabel && +unitGrams > 0) ? +unitGrams : null,
    });
    // onSaved switches tabs, which unmounts this component before the persist
    // effect can run — so clear the saved draft explicitly here.
    clearDraft();
    reset();
  };

  // Save the photo to the log now, without running analysis. Useful when the
  // AI call fails (e.g. spending cap reached) — the meal is preserved with a
  // zero-macro placeholder so it can be analyzed later from the log.
  const saveWithoutAnalysis = () => {
    onSaved({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      timestamp: Date.now(),
      name: 'Unanalyzed meal',
      imageUrl: imgThumb || null,
      model: null,
      amount: null, unit: null, refAmount: null, refUnit: null,
      calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0,
    });
    clearDraft();
    reset();
  };

  const reset = () => {
    setState('idle'); setImgUrl(null); setImgThumb(null); setImgB64(null);
    setMealName(''); setAmount(0); setUnitMode('g'); setUnitLabel(''); setUnitGrams(0);
    setPer100(EMPTY_PER100);
    setComponents([]);
    setLibraryDirty(false); setErr(null); setTextInput(''); setModelUsed(null);
    setRestored(false);
  };

  const s = { padding: '20px' };

  if (state === 'idle') return (
    <div style={{ ...s, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
      <div style={{ width: 112, height: 112, borderRadius: 28, background: '#e1f5ee', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <i className="ti ti-camera" style={{ fontSize: 50, color: '#1d9e75' }} aria-hidden="true" />
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>Snap your meal</h2>
      <p style={{ fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 32, maxWidth: 280, lineHeight: 1.55 }}>
        AI estimates calories and macronutrients instantly from a photo
      </p>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#e1f5ee', color: '#0f6e56', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 7, marginBottom: 20 }}>
        <i className="ti ti-sparkles" style={{ fontSize: 13 }} />Powered by AI
      </div>

      {/* Text input */}
      <div style={{ width: '100%', position: 'relative', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={textInput}
            onChange={e => { setTextInput(e.target.value); setErr(null); setHighlightIdx(-1); setDropdownOpen(true); }}
            onKeyDown={handleInputKeyDown}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setDropdownOpen(false)}
            placeholder="e.g. large pepperoni pizza slice"
            style={{ flex: 1, padding: '13px 14px', fontSize: 14, borderRadius: 12, border: '1.5px solid rgba(0,0,0,.15)', background: '#fafaf8', outline: 'none', color: 'inherit' }}
          />
          <button onClick={analyzeText} disabled={!textInput.trim()}
            style={{ padding: '0 16px', borderRadius: 12, border: 'none', background: textInput.trim() ? '#1d9e75' : '#ccc', color: '#fff', fontSize: 20, cursor: textInput.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center' }}>
            <i className="ti ti-arrow-right" />
          </button>
        </div>
        {showDropdown && (
          <ul role="listbox" style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
            margin: 0, padding: 4, listStyle: 'none',
            background: '#fff', border: '1.5px solid rgba(0,0,0,.15)', borderRadius: 12,
            boxShadow: '0 4px 16px rgba(0,0,0,.08)', maxHeight: 280, overflowY: 'auto',
            zIndex: 10, textAlign: 'left',
          }}>
            {suggestions.map((f, i) => {
              const q = textInput.trim();
              const lower = f.name.toLowerCase();
              const idx = q ? lower.indexOf(q.toLowerCase()) : -1;
              const highlighted = i === highlightIdx;
              return (
                <li
                  key={f.name}
                  role="option"
                  aria-selected={highlighted}
                  onMouseDown={e => { e.preventDefault(); applyFood(f); }}
                  onMouseEnter={() => setHighlightIdx(i)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 10, padding: '10px 12px', borderRadius: 8,
                    background: highlighted ? '#f3faf6' : 'transparent',
                    cursor: 'pointer', fontSize: 13,
                  }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {idx < 0 ? f.name : (
                      <>
                        {f.name.slice(0, idx)}
                        <strong>{f.name.slice(idx, idx + q.length)}</strong>
                        {f.name.slice(idx + q.length)}
                      </>
                    )}
                  </span>
                  <span style={{ color: '#888', fontSize: 12, flexShrink: 0 }}>
                    {f.unitLabel && f.unitGrams
                      ? `${Math.round((f.calories || 0) * f.unitGrams / 100)} cal / ${f.unitLabel}`
                      : `${Math.round(f.calories || 0)} cal / ${f.refAmount}${f.refUnit}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {err && <p style={{ color: '#e24b4a', fontSize: 13, textAlign: 'center', marginBottom: 12, width: '100%' }}>{err}</p>}

      <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, height: '0.5px', background: 'rgba(0,0,0,.1)' }} />
        <span style={{ fontSize: 12, color: '#bbb', fontWeight: 600 }}>OR</span>
        <div style={{ flex: 1, height: '0.5px', background: 'rgba(0,0,0,.1)' }} />
      </div>

      <label style={{ width: '100%', cursor: 'pointer', marginBottom: 10 }}>
        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
        <div style={{ width: '100%', padding: 14, borderRadius: 12, fontSize: 15, fontWeight: 700, border: 'none', background: '#1d9e75', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <i className="ti ti-camera" />Take photo
        </div>
      </label>
      <label style={{ width: '100%', cursor: 'pointer' }}>
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        <div style={{ width: '100%', padding: 14, borderRadius: 12, fontSize: 15, fontWeight: 700, border: '2px solid #1d9e75', background: 'transparent', color: '#1d9e75', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <i className="ti ti-photo" />Choose from gallery
        </div>
      </label>
    </div>
  );

  if (state === 'preview') return (
    <div style={s}>
      {imgUrl && <img src={imgUrl} alt="Preview" style={{ width: '100%', borderRadius: 14, marginBottom: 20, maxHeight: 280, objectFit: 'cover' }} />}
      {err && <p style={{ color: '#e24b4a', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{err}</p>}
      <Btn primary onClick={analyze}><i className="ti ti-sparkles" />Analyze this meal</Btn>
      <Btn onClick={reset} style={{ marginTop: 10 }}>Choose a different photo</Btn>
      <Btn onClick={saveWithoutAnalysis} style={{ marginTop: 10, background: 'transparent', color: '#888', fontWeight: 600 }}>
        <i className="ti ti-clock" />Save photo, analyze later
      </Btn>
    </div>
  );

  if (state === 'analyzing') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 32 }}>
      {imgUrl && <img src={imgUrl} alt="" style={{ width: '100%', borderRadius: 14, maxHeight: 260, objectFit: 'cover' }} />}
      <div style={{ width: 44, height: 44, border: '3px solid #e0f5ed', borderTopColor: '#1d9e75', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <p style={{ fontSize: 15, fontWeight: 600, color: '#666', textAlign: 'center' }}>
        Analyzing meal components…
      </p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // Review screen
  const pieceName = unitLabel || 'piece';
  return (
    <div style={s}>
      {(imgUrl || imgThumb) && <img src={imgUrl || imgThumb} alt="Food" style={{ width: '100%', borderRadius: 14, marginBottom: 16, maxHeight: 240, objectFit: 'cover' }} />}

      {restored && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff4e1', color: '#9a6a12', fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 6, marginBottom: 12 }}>
          <i className="ti ti-restore" style={{ fontSize: 12 }} />Restored your last analysis
        </div>
      )}

      {/* Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#e1f5ee', color: '#0f6e56', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
          <i className="ti ti-sparkles" style={{ fontSize: 11 }} />AI estimate — edit if needed
        </div>
        {modelUsed && <span style={{ fontSize: 10, color: '#bbb', fontFamily: 'monospace' }}>{modelUsed}</span>}
      </div>

      {/* Meal name */}
      <input
        value={mealName} onChange={e => setMealName(e.target.value)}
        placeholder="Meal name"
        style={{ width: '100%', fontSize: 18, fontWeight: 700, border: 'none', borderBottom: '2px solid #1d9e75', background: 'transparent', outline: 'none', paddingBottom: 6, marginBottom: 14, color: 'inherit' }}
      />

      {/* Components the AI identified */}
      {components.length > 0 && (
        <div style={{ marginBottom: 14, padding: '10px 12px', background: '#f5f5f0', borderRadius: 10, border: '0.5px solid rgba(0,0,0,.07)' }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Components</div>
          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.5 }}>
            {components.map((c, i) => (
              <span key={i}>
                {c.name} <span style={{ color: '#999' }}>({c.amount} {c.unit || 'g'})</span>
                {i < components.length - 1 && <span style={{ color: '#bbb' }}> · </span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Amount + unit toggle */}
      <div style={{ background: '#f5f5f0', borderRadius: 12, padding: '12px 14px', marginBottom: 12, border: '0.5px solid rgba(0,0,0,.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Amount</div>
          {/* Toggle between grams and a natural counting unit */}
          <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(0,0,0,.12)' }}>
            <UnitTab active={!isPiece} onClick={useGrams}>grams</UnitTab>
            <UnitTab active={isPiece} onClick={usePieces}>{pieceName}{!isPiece ? 's' : ''}</UnitTab>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <input
            type="number" value={amount} min={0} step={isPiece ? 1 : 0.1}
            onChange={e => setAmount(e.target.value === '' ? '' : +e.target.value)}
            style={{ fontSize: 28, fontWeight: 700, border: 'none', background: 'transparent', color: 'inherit', outline: 'none', width: 100 }}
          />
          {isPiece ? (
            <input
              value={unitLabel}
              onChange={e => changeUnitLabel(e.target.value)}
              placeholder="unit"
              style={{ fontSize: 16, color: '#666', fontWeight: 600, border: 'none', borderBottom: '1.5px dashed rgba(0,0,0,.2)', background: 'transparent', outline: 'none', width: 90, padding: '0 0 2px' }}
            />
          ) : (
            <span style={{ fontSize: 16, color: '#888', fontWeight: 600 }}>g</span>
          )}
        </div>
        {isPiece && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 13, color: '#888' }}>
            <span>1 {pieceName} ≈</span>
            <input
              type="number" value={unitGrams} min={0} step={1}
              onChange={e => changeUnitGrams(e.target.value)}
              style={{ fontSize: 14, fontWeight: 700, border: 'none', borderBottom: '1.5px solid #888', background: 'transparent', color: 'inherit', outline: 'none', width: 54, textAlign: 'right' }}
            />
            <span>g</span>
          </div>
        )}
      </div>

      {/* Per-unit macros */}
      <div style={{ background: '#f5f5f0', borderRadius: 12, padding: '12px 14px', marginBottom: 16, border: '0.5px solid rgba(0,0,0,.07)' }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>
          {isPiece ? `Per 1 ${pieceName}` : 'Per 100 g'}
          <span style={{ fontSize: 10, color: '#bbb', fontWeight: 400, marginLeft: 6 }}>(edit to correct)</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            ['calories', 'Calories', 'kcal', COLORS.cal],
            ['protein',  'Protein',  'g',    COLORS.protein],
            ['carbs',    'Carbs',    'g',    COLORS.carbs],
            ['fat',      'Fat',      'g',    COLORS.fat],
          ].map(([k, lbl, unit, color]) => (
            <div key={k} style={{ background: '#fff', borderRadius: 8, padding: '8px 10px', border: '0.5px solid rgba(0,0,0,.07)' }}>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />{lbl}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <input
                  type="number" value={cardMacros[k]} min={0} step={0.1}
                  onChange={e => editCardMacro(k, e.target.value)}
                  style={{ fontSize: 15, fontWeight: 700, border: 'none', background: 'transparent', color, outline: 'none', width: '100%' }}
                />
                <span style={{ fontSize: 10, color: '#aaa' }}>{unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Calculated totals (read-only) */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>
          {isPiece
            ? <>Total for {amount} {pieceName}{(+amount === 1) ? '' : 's'} ({r1(totalGrams)} g)</>
            : <>Total for {amount} g</>}
        </div>
        <div style={{ background: '#e1f5ee', borderRadius: 12, padding: 14, border: '0.5px solid rgba(29,158,117,.2)' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.cal, marginBottom: 6 }}>{macros.calories} <span style={{ fontSize: 14, fontWeight: 600 }}>kcal</span></div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[['Protein', macros.protein, COLORS.protein], ['Carbs', macros.carbs, COLORS.carbs], ['Fat', macros.fat, COLORS.fat]].map(([lbl, val, color]) => (
              <span key={lbl} style={{ fontSize: 13, fontWeight: 700, color }}>
                {val}g <span style={{ fontWeight: 400, color: '#888', fontSize: 11 }}>{lbl}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <Btn primary onClick={confirm}><i className="ti ti-check" />Save to log</Btn>
      <Btn onClick={reset} style={{ marginTop: 10 }}>Discard</Btn>
    </div>
  );
}

function UnitTab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
      background: active ? '#1d9e75' : '#fff', color: active ? '#fff' : '#888',
    }}>
      {children}
    </button>
  );
}

function Btn({ children, primary, onClick, style: s }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: 14, borderRadius: 12, fontSize: 15, fontWeight: 700,
      border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      background: primary ? '#1d9e75' : '#f0f0ea', color: primary ? '#fff' : 'inherit', ...s
    }}>
      {children}
    </button>
  );
}
