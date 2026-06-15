import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import AppShell from '../components/AppShell';
import { getLogs, getGoals, getGoalsHistory, getAppGoals, getObjectives, getBodyMetrics, getReportCardNotes, saveReportCardNote, jogs, meditations, workouts } from '../utils/db';
import { reportCardFor, recentWeekStarts, letterColor, buildNoteContext } from '../utils/reportcard';
import { computeGoalState, goalTitle, dueLabel, findMetric } from '../utils/goals';
import { getReportCardNote } from '../utils/api';

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

// Manila-folder look: a flat, faded-yellow card with dark ink, no gradients.
const MANILA = '#f4e8c2';
const MANILA_EDGE = '#e3d2a2';
const INK = '#46412f';

const DAY = 86400000;

export default function ReportCardApp({ user, active, apps, activeApp, onSwitch }) {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [notes, setNotes] = useState({}); // `${weekStart}|${persona}` -> { text? | loading? | error? }
  const notesRef = useRef(notes);
  notesRef.current = notes;

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
      getObjectives(user.id).catch(() => []),
      getBodyMetrics(user.id).catch(() => []),
      getReportCardNotes(user.id).catch(() => ({})),
    ]).then(([logs, , hist, jgGoals, mdGoals, wkGoals, jg, md, wk, objectives, bodyEntries, savedNotes]) => {
      if (cancelled) return;
      setData({
        nutritionLogs: logs,
        goalsHistory: hist,
        appGoals: { jog: jgGoals, meditation: mdGoals, workout: wkGoals },
        entriesByApp: { jog: jg, meditation: md, workout: wk },
        objectives, bodyEntries,
      });
      setNotes(Object.fromEntries(Object.entries(savedNotes).map(([k, text]) => [k, { text }])));
    }).catch(console.error).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [active, user.id]);

  if (!active) return null;

  const now = Date.now();
  const weeks = data ? recentWeekStarts(13).map(ws => reportCardFor(ws, data)) : [];
  // Only finished weeks with a grade — the in-progress week isn't shown until it ends.
  const shown = weeks.filter(w => w.weekEnd <= now && w.overall);

  // Active deadline goals (Body metrics) with current value, status, and recent
  // readings so the note can work out whether they're on pace for the deadline.
  const fmtDate = ts => (ts == null ? null : new Date(+ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
  const goalStates = (data?.objectives || []).filter(o => o.type === 'reach' && o.status === 'active').map(o => {
    const st = computeGoalState(o, data.bodyEntries || [], now);
    const def = findMetric(o.app, o.metric) || {};
    const history = (data.bodyEntries || [])
      .filter(e => def.field && e[def.field] != null)
      .slice(0, 5)
      .map(e => ({ value: e[def.field], daysAgo: Math.round((now - e.timestamp) / DAY) }));
    return {
      goal: goalTitle(o), current: st.current, target: st.target, unit: def.unit || '', status: st.status, history,
      period: { start: fmtDate(o.startTs ?? (o.createdAt ? new Date(o.createdAt).getTime() : null)), due: fmtDate(o.dueTs) },
      dueIn: dueLabel(o),
    };
  });

  // Generate a note for a week+persona and persist it. All generation is
  // user-triggered (a teacher's "View Comment" / ↻) — nothing fires on load.
  // loadNote skips if a note is already present or in flight; refreshNote overwrites.
  const runGenerate = (week, persona) => {
    const key = `${week.weekStart}|${persona}`;
    setNotes(prev => ({ ...prev, [key]: { loading: true } }));
    const i = shown.findIndex(w => w.weekStart === week.weekStart);
    const prior = i >= 0 ? shown.slice(i + 1) : [];
    getReportCardNote(buildNoteContext(week, prior, goalStates), persona)
      .then(({ text, _modelUsed }) => {
        setNotes(prev => ({ ...prev, [key]: { text } }));
        saveReportCardNote(user.id, week.weekStart, persona, text, _modelUsed).catch(console.error);
      })
      .catch(err => setNotes(prev => ({ ...prev, [key]: { error: noteError(err) } })));
  };
  const loadNote = (week, persona) => {
    const cur = notesRef.current[`${week.weekStart}|${persona}`];
    if (cur && (cur.text || cur.loading)) return;
    runGenerate(week, persona);
  };
  const refreshNote = (week, persona) => runGenerate(week, persona);

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
        <ReportCardBody weeks={shown} notes={notes} loadNote={loadNote} refreshNote={refreshNote} />
      )}
    </AppShell>
  );
}

function noteError(err) {
  const m = (err && err.message) || '';
  if (/api key|No API key/i.test(m)) return 'Add an AI key in Settings to get your teacher’s note.';
  return 'Couldn’t write a note right now — tap ↻ to retry.';
}

// Swipeable stack of weekly report cards in chronological order — the most recent is
// the last (rightmost) card and the view opens on it; swipe back (right) for older
// weeks. Below is an at-a-glance history list (newest first); tapping a row pages the
// carousel to that week and scrolls it into view, so the list doubles as a contents.
function ReportCardBody({ weeks, notes, loadNote, refreshNote }) {
  const chrono = [...weeks].reverse(); // oldest → newest (newest last)
  const trackRef = useRef(null);
  const [active, setActive] = useState(chrono.length - 1);
  const [open, setOpen] = useState({}); // `${weekStart}|${teacherId}` -> comment expanded?

  // Collapse all comments when the visible card changes — otherwise a tall expanded
  // card you swiped away from leaves a big empty gap below a shorter one.
  useEffect(() => { setOpen({}); }, [active]);
  const toggleComment = (week, id) => setOpen(o => {
    const k = `${week.weekStart}|${id}`;
    return { ...o, [k]: !o[k] };
  });

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
            <ReportCardHero week={w} notes={notes} loadNote={loadNote} refreshNote={refreshNote} open={open} onToggle={toggleComment} />
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

function ReportCardHero({ week, notes, loadNote, refreshNote, open, onToggle }) {
  const [info, setInfo] = useState(false);
  const subjects = week.items.filter(i => !i.na); // N/A subjects are hidden, not listed
  const grade = week.overall ? week.overall.letter : '—';
  const ink = week.overall ? letterColor(week.overall.letter) : '#9a8f63';

  return (
    <div style={{
      position: 'relative', borderRadius: 16,
      background: MANILA, border: `1px solid ${MANILA_EDGE}`,
      boxShadow: '0 10px 26px rgba(120,100,40,.18)', padding: '22px 22px 18px',
    }}>
      {/* header — title left, overall grade top-right (where Share used to be) */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '2px', color: '#8a7f55', textTransform: 'uppercase' }}>Report Card</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: INK }}>{week.label}</div>
          <div style={{ fontSize: 12, color: '#9a8f63', marginTop: 1 }}>{week.range}</div>
        </div>
        <div style={{ fontSize: grade.length > 1 ? 48 : 58, fontWeight: 800, color: ink, lineHeight: 1, letterSpacing: '-1px', textShadow: '0 1px 1px rgba(255,255,255,.5)', flexShrink: 0, marginTop: -2 }}>{grade}</div>
      </div>

      {/* transcript */}
      <div style={{ marginTop: 16, background: 'rgba(255,253,245,.55)', borderRadius: 12, padding: '2px 14px', border: '1px solid rgba(180,160,90,.18)' }}>
        {subjects.map((it, i) => <SubjectRow key={it.key} item={it} last={i === subjects.length - 1} />)}
      </div>

      {/* Comments — pick a teacher to read their take (nothing loads until asked) */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '1px', color: '#8a7f55', textTransform: 'uppercase' }}>Comments</span>
          <button onClick={() => setInfo(true)} aria-label="How comments work"
            style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#b0a070', fontSize: 14, lineHeight: 0, display: 'flex' }}>
            <i className="ti ti-info-circle" aria-hidden="true" />
          </button>
        </div>
        {TEACHERS.map(t => (
          <TeacherRow key={t.id} teacher={t} note={notes[`${week.weekStart}|${t.id}`]}
            isOpen={!!open[`${week.weekStart}|${t.id}`]} onToggle={() => onToggle(week, t.id)}
            onLoad={() => loadNote(week, t.id)} onRefresh={() => refreshNote(week, t.id)} />
        ))}
      </div>

      {/* footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, color: '#a79a6e', fontSize: 11, fontWeight: 600 }}>
        <i className="ti ti-salad" aria-hidden="true" style={{ color: '#1d9e75' }} />
        NutriSnap
      </div>

      {info && <CommentsInfo onClose={() => setInfo(false)} />}
    </div>
  );
}

function CommentsInfo({ onClose }) {
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="How comments work"
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 340, background: '#fff', borderRadius: 16, padding: 22, boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10, color: INK }}>Your AI coaches</div>
        <p style={{ fontSize: 13.5, color: '#555', lineHeight: 1.6, margin: 0 }}>
          Tap a teacher to get a short, personalized take on your week. Each one reads your grades, your week-to-week trend, and your goals — then tells you the one thing to focus on next.
        </p>
        <p style={{ fontSize: 13.5, color: '#555', lineHeight: 1.6, margin: '10px 0 0' }}>
          They just differ in tone: the analyst sticks to the numbers, the coach gives tough love, and the guide keeps it encouraging. Tap a teacher’s avatar to collapse their note, or ↻ for a fresh take.
        </p>
        <button onClick={onClose} style={{ marginTop: 18, width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Got it</button>
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
    </div>
  );
}

function HabitDetail({ item }) {
  const met = +item.actual >= item.target;
  const unit = item.unit;
  const fmtN = n => (unit === 'km' ? (+n).toFixed(1) : round(n));
  return (
    <div>
      <div style={{ fontSize: 10.5, color: '#b0a070', marginBottom: 6 }}>This week vs weekly target</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6a6048', width: 66 }}>This week</span>
        <span style={{ fontSize: 12, color: '#a08f5e', flex: 1 }}>{fmtN(item.actual)} / {item.target} {unit}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: met ? '#1d9e75' : '#c4631e' }}>{met ? 'OK' : 'under'}</span>
      </div>
    </div>
  );
}

// --- Teachers: stylized flat-illustration avatars + the "Comments" rows ---
// Original archetype avatars (not likenesses of any real person): a young trainer,
// an intense coach (headband + shades + moustache), and a serene yoga instructor.

function TrainerAvatar({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ borderRadius: 10, display: 'block', flexShrink: 0 }}>
      <rect width="48" height="48" rx="11" fill="#dbeafe" />
      <rect x="20" y="35" width="8" height="7" fill="#e3b07f" />
      <ellipse cx="24" cy="24" rx="11" ry="12" fill="#f1c693" />
      <path d="M12.5 23 Q13 10 24 10 Q35 10 35.5 23 Q31 15.5 24 15.5 Q17 15.5 12.5 23Z" fill="#5b3a22" />
      <rect x="17.6" y="20.6" width="4.4" height="1.5" rx="0.75" fill="#5b3a22" />
      <rect x="26" y="20.6" width="4.4" height="1.5" rx="0.75" fill="#5b3a22" />
      <circle cx="20" cy="24" r="1.5" fill="#2a2a2a" />
      <circle cx="28" cy="24" r="1.5" fill="#2a2a2a" />
      <path d="M20 29 Q24 32.5 28 29" stroke="#a9603f" strokeWidth="1.7" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function CoachAvatar({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ borderRadius: 10, display: 'block', flexShrink: 0 }}>
      <rect width="48" height="48" rx="11" fill="#fde68a" />
      <rect x="20" y="35" width="8" height="7" fill="#c98c52" />
      <ellipse cx="24" cy="24.5" rx="11" ry="12" fill="#e0a96d" />
      <path d="M13 22 Q13 13 24 13 Q35 13 35 22 L35 19.5 Q30 16.5 24 16.5 Q18 16.5 13 19.5Z" fill="#2f2f2f" />
      <rect x="12" y="17.5" width="24" height="4.4" rx="1.4" fill="#e0556e" />
      <rect x="12" y="17.5" width="24" height="1.5" rx="1" fill="#c23a54" />
      <rect x="14.5" y="23" width="7.5" height="5.2" rx="1.6" fill="#1f1f1f" />
      <rect x="26" y="23" width="7.5" height="5.2" rx="1.6" fill="#1f1f1f" />
      <rect x="21.6" y="24.6" width="4.8" height="1.6" fill="#1f1f1f" />
      <path d="M18.5 31.5 Q24 34 29.5 31.5 Q24 30.2 18.5 31.5Z" fill="#2a2a2a" />
      <path d="M21 35 Q24 33.8 27 35" stroke="#7a3b2a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function YogaAvatar({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ borderRadius: 10, display: 'block', flexShrink: 0 }}>
      <rect width="48" height="48" rx="11" fill="#dcfce7" />
      <rect x="20" y="35" width="8" height="7" fill="#e3b07f" />
      <path d="M12 27 Q12 12 24 12 Q36 12 36 27 Q36 35 32 37 L32 25 Q31 18.5 24 18.5 Q17 18.5 16 25 L16 37 Q12 35 12 27Z" fill="#4a3322" />
      <circle cx="24" cy="9.5" r="4.2" fill="#4a3322" />
      <ellipse cx="24" cy="25.5" rx="10.5" ry="11.5" fill="#f6cfa0" />
      <path d="M17.8 25 Q20 27.2 22.2 25" stroke="#5a4030" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M25.8 25 Q28 27.2 30.2 25" stroke="#5a4030" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <circle cx="17.8" cy="29.5" r="1.7" fill="#f3a9b8" opacity="0.7" />
      <circle cx="30.2" cy="29.5" r="1.7" fill="#f3a9b8" opacity="0.7" />
      <path d="M21 30.5 Q24 33.5 27 30.5" stroke="#c46a7e" strokeWidth="1.7" fill="none" strokeLinecap="round" />
    </svg>
  );
}

const TEACHERS = [
  { id: 'analytical',  Avatar: TrainerAvatar },
  { id: 'tough',       Avatar: CoachAvatar },
  { id: 'encouraging', Avatar: YogaAvatar },
];

const teacherBtn = { border: 'none', background: ACCENT, color: '#fff', fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 999, cursor: 'pointer', flexShrink: 0 };
const inlineRefresh = { border: 'none', background: 'none', color: '#9a8f55', cursor: 'pointer', fontSize: 13, padding: '0 0 0 6px', verticalAlign: 'baseline' };

function TeacherRow({ teacher, note, isOpen, onToggle, onLoad, onRefresh }) {
  const Avatar = teacher.Avatar;
  const loading = note && note.loading;
  const text = note && note.text;
  const error = note && note.error;
  const toggle = () => { if (!isOpen) onLoad(); onToggle(); };
  return (
    <div style={{ borderTop: '1px solid rgba(150,130,70,.18)', padding: '3px 0 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={toggle} aria-label={isOpen ? 'Collapse comment' : 'View comment'}
          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}>
          <Avatar size={40} />
        </button>
        {!isOpen && <button onClick={toggle} style={teacherBtn}>View Comment</button>}
      </div>
      {isOpen && (
        <div style={{ padding: '6px 2px 0 52px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8a7f55', fontSize: 12.5 }}>
              <span style={{ width: 13, height: 13, border: '2px solid #cdbd8a', borderTopColor: '#8a7f55', borderRadius: '50%', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
              Writing…
            </div>
          ) : error ? (
            <div style={{ fontSize: 12.5, color: '#a79a6e', lineHeight: 1.5 }}>{error}</div>
          ) : text ? (
            <div style={{ fontSize: 13, color: '#4a4636', lineHeight: 1.55 }}>
              “{text}”
              <button onClick={onRefresh} aria-label="Regenerate" style={inlineRefresh}><i className="ti ti-refresh" /></button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
