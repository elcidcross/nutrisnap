import React, { useState } from 'react';
import { analyzeFood, analyzeFoodText } from '../utils/api';

const COLORS = { cal: '#1d9e75', protein: '#d4537e', carbs: '#378add', fat: '#ba7517', fiber: '#639922' };

export default function SnapView({ onSaved }) {
  const [state, setState] = useState('idle');
  const [imgUrl, setImgUrl] = useState(null);
  const [imgThumb, setImgThumb] = useState(null);
  const [imgB64, setImgB64] = useState(null);
  const [imgMime, setImgMime] = useState('image/jpeg');
  const [macros, setMacros] = useState(null);
  const [mealName, setMealName] = useState('');
  const [err, setErr] = useState(null);
  const [textInput, setTextInput] = useState('');

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

  const analyze = async () => {
    if (!localStorage.getItem('nutrisnap_api_key')) {
      setErr('No API key set. Go to Goals & Settings → AI Provider to add one.');
      return;
    }
    setState('analyzing'); setErr(null);
    try {
      const res = await analyzeFood(imgB64, imgMime);
      setMacros({ calories: res.calories || 0, protein: res.protein || 0, carbs: res.carbs || 0, fat: res.fat || 0, fiber: res.fiber || 0 });
      setMealName(res.name || 'Meal');
      setState('review');
    } catch (e) {
      setErr(e.message || 'Could not analyze image. Please try again.');
      setState('preview');
    }
  };

  const confirm = () => {
    onSaved({ id: Date.now().toString(36) + Math.random().toString(36).slice(2), timestamp: Date.now(), name: mealName, imageUrl: imgThumb || imgUrl, ...macros });
    reset();
  };

  const analyzeText = async () => {
    if (!localStorage.getItem('nutrisnap_api_key')) {
      setErr('No API key set. Go to Goals & Settings → AI Provider to add one.');
      return;
    }
    if (!textInput.trim()) return;
    setState('analyzing'); setErr(null);
    try {
      const res = await analyzeFoodText(textInput.trim());
      setMacros({ calories: res.calories || 0, protein: res.protein || 0, carbs: res.carbs || 0, fat: res.fat || 0, fiber: res.fiber || 0 });
      setMealName(res.name || textInput.trim());
      setState('review');
    } catch (e) {
      setErr(e.message || 'Could not analyze. Please try again.');
      setState('idle');
    }
  };

  const reset = () => { setState('idle'); setImgUrl(null); setImgThumb(null); setImgB64(null); setMacros(null); setMealName(''); setErr(null); setTextInput(''); };

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
          style={{
            flex: 1, padding: '13px 14px', fontSize: 14, borderRadius: 12,
            border: '1.5px solid rgba(0,0,0,.15)', background: '#fafaf8',
            outline: 'none', color: 'inherit',
          }}
        />
        <button onClick={analyzeText} disabled={!textInput.trim()}
          style={{
            padding: '0 16px', borderRadius: 12, border: 'none',
            background: textInput.trim() ? '#1d9e75' : '#ccc',
            color: '#fff', fontSize: 20, cursor: textInput.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center',
          }}>
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
    </div>
  );

  if (state === 'analyzing') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 32 }}>
      {imgUrl && <img src={imgUrl} alt="" style={{ width: '100%', borderRadius: 14, maxHeight: 260, objectFit: 'cover' }} />}
      <div style={{ width: 44, height: 44, border: '3px solid #e0f5ed', borderTopColor: '#1d9e75', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <p style={{ fontSize: 15, fontWeight: 600, color: '#666', textAlign: 'center' }}>Analyzing your meal…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={s}>
      {imgUrl && <img src={imgUrl} alt="Food" style={{ width: '100%', borderRadius: 14, marginBottom: 16, maxHeight: 240, objectFit: 'cover' }} />}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#e1f5ee', color: '#0f6e56', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, marginBottom: 14 }}>
        <i className="ti ti-sparkles" style={{ fontSize: 11 }} />AI estimate — edit if needed
      </div>
      <input
        value={mealName} onChange={e => setMealName(e.target.value)}
        placeholder="Meal name"
        style={{ width: '100%', fontSize: 18, fontWeight: 700, border: 'none', borderBottom: '2px solid #1d9e75', background: 'transparent', outline: 'none', paddingBottom: 6, marginBottom: 20, color: 'inherit' }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <MacroInput label="Calories" color={COLORS.cal} value={macros.calories} unit="kcal" big
          onChange={v => setMacros(p => ({ ...p, calories: +v }))} style={{ gridColumn: '1 / -1' }} />
        {[['protein','Protein'],['carbs','Carbs'],['fat','Fat'],['fiber','Fiber']].map(([k, lbl]) => (
          <MacroInput key={k} label={lbl} color={COLORS[k]} value={macros[k]} unit="g"
            onChange={v => setMacros(p => ({ ...p, [k]: +v }))} />
        ))}
      </div>
      <Btn primary onClick={confirm}><i className="ti ti-check" />Save to log</Btn>
      <Btn onClick={reset} style={{ marginTop: 10 }}>Discard</Btn>
    </div>
  );
}

function MacroInput({ label, color, value, unit, big, onChange, style: extraStyle }) {
  return (
    <div style={{ background: '#f5f5f0', borderRadius: 12, padding: 14, border: '0.5px solid rgba(0,0,0,.07)', ...extraStyle }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
        {label}
      </div>
      <input type="number" value={value} min={0} step={0.1} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', fontSize: big ? 26 : 20, fontWeight: 700, border: 'none', background: 'transparent', color: 'inherit', outline: 'none' }} />
      <span style={{ fontSize: 12, color: '#888' }}>{unit}</span>
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
