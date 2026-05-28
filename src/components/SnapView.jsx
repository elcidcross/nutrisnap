import React, { useState, useEffect } from 'react';
import { analyzeFood, analyzeFoodText } from '../utils/api';

const COLORS = { cal: '#1d9e75', protein: '#d4537e', carbs: '#378add', fat: '#ba7517', fiber: '#639922' };

// A reviewed-but-unsaved analysis lives only in component state, so it's lost if
// iOS Safari evicts/reloads the page (e.g. when the phone locks). Persist a small
// draft of the review screen to localStorage so it can be restored on remount.
const DRAFT_KEY = 'nutrisnap_snap_draft';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
    if (d && d.v === 1 && Date.now() - d.savedAt < DRAFT_MAX_AGE_MS) return d;
  } catch { /* corrupt */ }
  clearDraft();
  return null;
}

function r1(n) { return Math.round(n * 10) / 10; }

function calcMacros(amount, refAmount, refMacros) {
  const ratio = refAmount > 0 ? amount / refAmount : 0;
  return {
    calories: Math.round(ratio * (refMacros.calories || 0)),
    protein:  r1(ratio * (refMacros.protein || 0)),
    carbs:    r1(ratio * (refMacros.carbs || 0)),
    fat:      r1(ratio * (refMacros.fat || 0)),
    fiber:    r1(ratio * (refMacros.fiber || 0)),
  };
}

export default function SnapView({ onSaved, onSaveToLibrary, onUpdateLibrary, foodLibrary = [] }) {
  const [state, setState] = useState('idle');
  const [imgUrl, setImgUrl] = useState(null);
  const [imgThumb, setImgThumb] = useState(null);
  const [imgB64, setImgB64] = useState(null);
  const [imgMime, setImgMime] = useState('image/jpeg');
  const [mealName, setMealName] = useState('');
  const [amount, setAmount] = useState(0);
  const [amountUnit, setAmountUnit] = useState('g');
  const [refAmount, setRefAmount] = useState(100);
  const [refUnit, setRefUnit] = useState('g');
  const [refMacros, setRefMacros] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  const [components, setComponents] = useState([]);
  const [libraryDirty, setLibraryDirty] = useState(false);
  const [err, setErr] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [modelUsed, setModelUsed] = useState(null);
  const [restored, setRestored] = useState(false);

  const macros = calcMacros(amount, refAmount, refMacros);

  // Restore a previously reviewed analysis after a reload (e.g. iPhone lock).
  useEffect(() => {
    const d = loadDraft();
    if (!d) return;
    setImgThumb(d.imgThumb || null);
    setMealName(d.mealName || '');
    setAmount(d.amount ?? 0);
    setAmountUnit(d.amountUnit || 'g');
    setRefAmount(d.refAmount ?? 100);
    setRefUnit(d.refUnit || 'g');
    setRefMacros(d.refMacros || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
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
        v: 1, savedAt: Date.now(), imgThumb, mealName, amount, amountUnit,
        refAmount, refUnit, refMacros, components, modelUsed, libraryDirty,
      });
    } else {
      clearDraft();
    }
  }, [state, imgThumb, mealName, amount, amountUnit, refAmount, refUnit, refMacros, components, modelUsed, libraryDirty]);

  const makeThumbnail = (objectUrl) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const MAX = 300;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = objectUrl;
  });

  const handleFile = e => {
    const f = e.target.files[0]; if (!f) return;
    setErr(null);
    setImgMime(f.type || 'image/jpeg');
    const objectUrl = URL.createObjectURL(f);
    setImgUrl(objectUrl);
    const reader = new FileReader();
    reader.onload = async ev => {
      setImgB64(ev.target.result.split(',')[1]);
      setImgThumb(await makeThumbnail(objectUrl));
      setState('preview');
    };
    reader.readAsDataURL(f);
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
      const amt = a.amount || 0;
      const unit = a.unit || 'g';
      const totals = {
        calories: a.calories || 0,
        protein: a.protein || 0,
        carbs: a.carbs || 0,
        fat: a.fat || 0,
        fiber: a.fiber || 0,
      };
      // Convert totals → per-100g (or per-1 unit if non-gram) for the editable card.
      const refAmt = unit === 'g' ? 100 : 1;
      const ratio = amt > 0 ? refAmt / amt : 0;
      const rm = {
        calories: Math.round(totals.calories * ratio),
        protein:  r1(totals.protein  * ratio),
        carbs:    r1(totals.carbs    * ratio),
        fat:      r1(totals.fat      * ratio),
        fiber:    r1(totals.fiber    * ratio),
      };
      setMealName(name);
      setAmount(amt);
      setAmountUnit(unit);
      setRefAmount(refAmt);
      setRefUnit(unit);
      setRefMacros(rm);
      setComponents(Array.isArray(a.components) ? a.components : []);
      setModelUsed(a._modelUsed || null);
      setLibraryDirty(false);
      setRestored(false);
      onSaveToLibrary({ name, refAmount: refAmt, refUnit: unit, ...rm });
      setState('review');
      return true;
    } catch (e) {
      setErr(e.message || 'Could not analyze. Please try again.');
      return false;
    }
  };

  const analyze = async () => {
    const ok = await runAnalysis(() => analyzeFood(imgB64, imgMime));
    if (!ok) setState('preview');
  };

  const analyzeText = async () => {
    if (!textInput.trim()) return;
    const ok = await runAnalysis(() => analyzeFoodText(textInput.trim()));
    if (!ok) setState('idle');
  };

  const confirm = () => {
    onSaved({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      timestamp: Date.now(),
      name: mealName,
      imageUrl: imgThumb || imgUrl,
      model: modelUsed,
      amount: +amount || 0,
      unit: amountUnit,
      refAmount,
      refUnit,
      ...macros,
    });
    if (libraryDirty) onUpdateLibrary(mealName, refMacros);
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
    setMealName(''); setAmount(0); setAmountUnit('g'); setRefAmount(100); setRefUnit('g');
    setRefMacros({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
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
      <div style={{ width: '100%', display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={textInput}
          onChange={e => { setTextInput(e.target.value); setErr(null); }}
          onKeyDown={e => e.key === 'Enter' && analyzeText()}
          placeholder="e.g. large pepperoni pizza slice"
          style={{ flex: 1, padding: '13px 14px', fontSize: 14, borderRadius: 12, border: '1.5px solid rgba(0,0,0,.15)', background: '#fafaf8', outline: 'none', color: 'inherit' }}
        />
        <button onClick={analyzeText} disabled={!textInput.trim()}
          style={{ padding: '0 16px', borderRadius: 12, border: 'none', background: textInput.trim() ? '#1d9e75' : '#ccc', color: '#fff', fontSize: 20, cursor: textInput.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center' }}>
          <i className="ti ti-arrow-right" />
        </button>
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

      {/* Amount */}
      <div style={{ background: '#f5f5f0', borderRadius: 12, padding: '12px 14px', marginBottom: 12, border: '0.5px solid rgba(0,0,0,.07)' }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Amount</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <input
            type="number" value={amount} min={0} step={0.1}
            onChange={e => setAmount(e.target.value === '' ? '' : +e.target.value)}
            style={{ fontSize: 28, fontWeight: 700, border: 'none', background: 'transparent', color: 'inherit', outline: 'none', width: 100 }}
          />
          <span style={{ fontSize: 16, color: '#888', fontWeight: 600 }}>{amountUnit}</span>
        </div>
      </div>

      {/* Per-unit macros */}
      <div style={{ background: '#f5f5f0', borderRadius: 12, padding: '12px 14px', marginBottom: 16, border: '0.5px solid rgba(0,0,0,.07)' }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>
          Per {refAmount} {refUnit}
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
                  type="number" value={refMacros[k]} min={0} step={0.1}
                  onChange={e => { setRefMacros(p => ({ ...p, [k]: +e.target.value })); setLibraryDirty(true); }}
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
          Total for {amount} {amountUnit}
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
