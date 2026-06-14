import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import AppShell from '../components/AppShell';
import { getLogs, getGoals, getGoalsHistory, getAppGoals, jogs, meditations, workouts } from '../utils/db';
import { reportCardFor, recentWeekStarts, letterColor } from '../utils/reportcard';

// Report Card — its own app. Grades each week against the habits you've already
// defined in the other apps (Jog's weekly distance, Meditation's days/week, Workout's
// sessions/week) plus your nutrition macros, and rolls them into one letter grade.
// The current-week card is a "certificate" worth screenshotting; swipe to page back
// through previous weeks. Read-only.

const ACCENT = '#0e7490';
const APP_ACCENT = { nutrisnap: '#1d9e75', jog: '#378add', meditation: '#8a63d2', workout: '#ba7517' };
const MACRO_META = {
  calories: { label: 'Calories', unit: 'kcal' },
  protein:  { label: 'Protein',  unit: 'g' },
  carbs:    { label: 'Carbs',    unit: 'g' },
  fat:      { label: 'Fat',      unit: 'g' },
};
const round = n => Math.round(+n);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Manila-folder look: a flat, faded-yellow card with dark ink, no gradients.
const MANILA = '#f4e8c2';
const MANILA_EDGE = '#e3d2a2';
const INK = '#46412f';
const COMMENT_INK = '#a8432a'; // red-brown, for the teacher's-note comment line

export default function ReportCardApp({ user, active, apps, activeApp, onSwitch }) {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Re-fetch every time the app becomes active: the report card is a pure aggregator
  // of *other* apps' data (their app_goals targets and logs), so a habit target set
  // elsewhere this session must be picked up on return — not cached from first open.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    Promise.all([
      getLogs(user.id).catch(() => []),
      getGoals(user.id).catch(() => null),
      getGoalsHistory(user.id).catch(() => []),
      getAppGoals(user.id, 'jog').catch(() => ({})),
      getAppGoals(user.id, 'meditation').catch(() => ({})),
      getAppGoals(user.id, 'workout').catch(() => ({})),
      jogs.load(user.id).catch(() => []),
      meditations.load(user.id).catch(() => []),
      workouts.load(user.id).catch(() => []),
    ]).then(([logs, , hist, jgGoals, mdGoals, wkGoals, jg, md, wk]) => {
      if (cancelled) return;
      setData({
        nutritionLogs: logs,
        goalsHistory: hist,
        appGoals: { jog: jgGoals, meditation: mdGoals, workout: wkGoals },
        entriesByApp: { jog: jg, meditation: md, workout: wk },
      });
    }).catch(console.error).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [active, user.id]);

  if (!active) return null;

  const now = Date.now();
  const weeks = data ? recentWeekStarts(13).map(ws => reportCardFor(ws, data)) : [];
  // Only finished weeks with a grade — the in-progress week isn't shown until it ends.
  const shown = weeks.filter(w => w.weekEnd <= now && w.overall);

  return (
    <AppShell apps={apps} activeApp={activeApp} onSwitch={onSwitch} accent={ACCENT} title="Report Card">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .rc-track::-webkit-scrollbar{display:none}`}</style>
      {!loaded ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 30, height: 30, border: `3px solid ${ACCENT}22`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        </div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 24px', color: '#aaa' }}>
          <i className="ti ti-report-analytics" style={{ fontSize: 56, display: 'block', marginBottom: 12, color: `${ACCENT}66` }} aria-hidden="true" />
          <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line' }}>No report cards yet.{'\n'}Your first one posts when this week ends.</p>
        </div>
      ) : (
        <ReportCardBody weeks={shown} />
      )}
    </AppShell>
  );
}

// Swipeable stack of weekly report cards in chronological order — the most recent is
// the last (rightmost) card and the view opens on it; swipe back (right) for older
// weeks. Below is an at-a-glance history list (newest first); tapping a row pages the
// carousel to that week and scrolls it into view, so the list doubles as a contents.
function ReportCardBody({ weeks }) {
  const chrono = [...weeks].reverse(); // oldest → newest (newest last)
  const trackRef = useRef(null);
  const [active, setActive] = useState(chrono.length - 1);

  // Open on the most recent card (rightmost) without an animated scroll.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollLeft = el.clientWidth * (chrono.length - 1);
    setActive(chrono.length - 1);
  }, [chrono.length]);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  };
  const goTo = (i) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollLeft = i * el.clientWidth;   // page to the card instantly (one smooth scroll at a time)
    setActive(i);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' }); // then bring the card up into view
  };

  return (
    <div>
      <div ref={trackRef} className="rc-track" onScroll={onScroll}
        style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {chrono.map(w => (
          <div key={w.weekStart} style={{ flex: '0 0 100%', scrollSnapAlign: 'center', boxSizing: 'border-box', padding: '18px 16px 4px' }}>
            <ReportCardHero week={w} />
          </div>
        ))}
      </div>

      {chrono.length > 1 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 7, padding: '12px 0 2px' }}>
            {chrono.map((w, i) => (
              <button key={w.weekStart} onClick={() => goTo(i)} aria-label={`Go to ${w.label}`}
                style={{ width: i === active ? 9 : 7, height: i === active ? 9 : 7, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer', background: i === active ? ACCENT : '#d3d3cb', transition: 'all .2s' }} />
            ))}
          </div>

          <div style={{ padding: '12px 16px 6px', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.5px', background: '#f5f5f0' }}>History</div>
          {weeks.map((w, h) => {
            const ci = chrono.length - 1 - h; // this week's index in the carousel
            return (
              <button key={w.weekStart} onClick={() => goTo(ci)} aria-current={ci === active ? 'true' : undefined}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: 'none', borderBottom: '0.5px solid rgba(0,0,0,.06)', background: ci === active ? '#eaf3f4' : '#fff', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {w.label}
                    {ci === active && <i className="ti ti-eye" style={{ fontSize: 14, color: ACCENT }} aria-hidden="true" />}
                  </div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {w.range} · {w.items.filter(it => !it.na).map(it => `${it.label} ${it.letter}`).join(' · ')}
                  </div>
                </div>
                <GradeChip letter={w.overall.letter} />
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

function GradeChip({ letter }) {
  const c = letterColor(letter);
  return <span style={{ minWidth: 30, textAlign: 'center', padding: '3px 7px', borderRadius: 8, background: `${c}1a`, color: c, fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{letter}</span>;
}

// Just the words now — the card colour is always manila; only the handwritten grade
// is tinted by letterColor.
function heroCaption(letter) {
  switch (letter && letter[0]) {
    case 'A': return { caption: 'Outstanding week!', emoji: '🏆' };
    case 'B': return { caption: 'Strong week!', emoji: '💪' };
    case 'C': return { caption: 'Solid effort.', emoji: '👍' };
    case 'D': return { caption: 'Keep pushing.', emoji: '🔥' };
    case 'F': return { caption: 'Reset and go.', emoji: '🔄' };
    default:  return { caption: '', emoji: '' };
  }
}

function ReportCardHero({ week }) {
  const t = heroCaption(week.overall && week.overall.letter);
  const subjects = week.items.filter(i => !i.na); // N/A subjects are hidden, not listed
  const grade = week.overall ? week.overall.letter : '—';
  const ink = week.overall ? letterColor(week.overall.letter) : '#9a8f63';
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  const onShare = async () => {
    try {
      await navigator.share({ title: 'My Report Card', text: `${week.label}: ${grade} overall on my NutriSnap report card ${t.emoji}` });
    } catch { /* user dismissed */ }
  };

  return (
    <div style={{
      position: 'relative', borderRadius: 16,
      background: MANILA, border: `1px solid ${MANILA_EDGE}`,
      boxShadow: '0 10px 26px rgba(120,100,40,.18)', padding: '22px 22px 18px',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '2px', color: '#8a7f55', textTransform: 'uppercase' }}>Report Card</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: INK }}>{week.label}</div>
          <div style={{ fontSize: 12, color: '#9a8f63', marginTop: 1 }}>{week.range}</div>
        </div>
        {canShare && week.overall && (
          <button onClick={onShare} aria-label="Share report card"
            style={{ border: 'none', background: 'rgba(255,255,255,.5)', borderRadius: 999, width: 34, height: 34, cursor: 'pointer', color: '#8a7f55', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(120,100,40,.2)' }}>
            <i className="ti ti-share" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* grade — big and bold, no circle */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 4px' }}>
        <div style={{ fontSize: grade.length > 1 ? 72 : 88, fontWeight: 800, color: ink, lineHeight: 1, letterSpacing: '-1px', textShadow: '0 1px 1px rgba(255,255,255,.5)' }}>{grade}</div>
        <div style={{ marginTop: 10, fontSize: 15, fontWeight: 700, color: '#5a5238' }}>{t.emoji} {t.caption}</div>
      </div>

      {/* transcript */}
      <div style={{ marginTop: 12, background: 'rgba(255,253,245,.55)', borderRadius: 12, padding: '2px 14px', border: '1px solid rgba(180,160,90,.18)' }}>
        {subjects.map((it, i) => <SubjectRow key={it.key} item={it} last={i === subjects.length - 1} />)}
      </div>

      {/* footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, color: '#a79a6e', fontSize: 11, fontWeight: 600 }}>
        <i className="ti ti-salad" aria-hidden="true" style={{ color: '#1d9e75' }} />
        NutriSnap
      </div>
    </div>
  );
}

// One subject. Tap to reveal *why* it earned that grade.
function SubjectRow({ item, last }) {
  const [open, setOpen] = useState(false);
  const accent = APP_ACCENT[item.app] || '#888';
  const detail = item.key === 'nutrition'
    ? `${item.loggedDays} day${item.loggedDays === 1 ? '' : 's'} logged`
    : `${(+item.actual).toFixed(item.unit === 'km' ? 1 : 0)} / ${item.target} ${item.unit}`;

  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid rgba(150,130,70,.18)' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', background: 'none', border: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{item.label}</div>
          <div style={{ fontSize: 11, color: '#a08f5e', marginTop: 1 }}>{detail}</div>
        </div>
        <span style={{ fontSize: 20, fontWeight: 800, color: letterColor(item.letter), lineHeight: 1 }}>{item.letter}</span>
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 15, color: '#bcab7c', marginLeft: 2 }} aria-hidden="true" />
      </button>
      {open && <SubjectDetail item={item} />}
    </div>
  );
}

function SubjectDetail({ item }) {
  return (
    <div style={{ padding: '2px 0 12px 21px' }}>
      {item.key === 'nutrition' ? <NutritionDetail macros={item.macros} /> : <HabitDetail item={item} />}
    </div>
  );
}

function NutritionDetail({ macros }) {
  const isOff = m => (m.dir === 'floor' ? m.avg < m.target : m.avg > m.target) && m.score < 0.999;
  const issues = macros.filter(isOff).map(m =>
    (m.dir === 'floor' ? 'not enough ' : 'too much ') + MACRO_META[m.key].label.toLowerCase());
  const summary = issues.length ? cap(issues.join(', ')) : 'Everything on target 🎉';
  return (
    <div>
      <div style={{ fontSize: 10.5, color: '#b0a070', marginBottom: 6 }}>Average per logged day vs daily target</div>
      {macros.map(m => {
        const meta = MACRO_META[m.key];
        const off = isOff(m);
        const status = !off ? 'OK' : m.dir === 'floor' ? 'not enough' : 'too much';
        return (
          <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6a6048', width: 66 }}>{meta.label}</span>
            <span style={{ fontSize: 12, color: '#a08f5e', flex: 1 }}>{round(m.avg)} / {round(m.target)} {meta.unit}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: off ? '#c4631e' : '#1d9e75' }}>{status}</span>
          </div>
        );
      })}
      <div style={{ fontSize: 12, fontWeight: 700, color: COMMENT_INK, marginTop: 8 }}>{summary}</div>
    </div>
  );
}

function HabitDetail({ item }) {
  const met = +item.actual >= item.target;
  const diff = +item.actual - item.target;
  const unit = item.unit;
  const fmtN = n => (unit === 'km' ? (+n).toFixed(1) : round(n));
  const summary = met
    ? `Target met 🎯${diff > 0 ? ` (+${fmtN(diff)} ${unit})` : ''}`
    : `${fmtN(-diff)} ${unit} short of target`;
  return (
    <div>
      <div style={{ fontSize: 10.5, color: '#b0a070', marginBottom: 6 }}>This week vs weekly target</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6a6048', width: 66 }}>This week</span>
        <span style={{ fontSize: 12, color: '#a08f5e', flex: 1 }}>{fmtN(item.actual)} / {item.target} {unit}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: met ? '#1d9e75' : '#c4631e' }}>{met ? 'OK' : 'under'}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: COMMENT_INK, marginTop: 8 }}>{summary}</div>
    </div>
  );
}
