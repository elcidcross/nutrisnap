import React, { useState, useEffect } from 'react';
import AppShell from '../components/AppShell';
import { getLogs, getGoals, getGoalsHistory, getAppGoals, jogs, meditations, workouts } from '../utils/db';
import { reportCardFor, recentWeekStarts, letterColor } from '../utils/reportcard';

// Report Card — its own app. Grades each week against the habits you've already
// defined in the other apps (Jog's weekly distance, Meditation's days/week, Workout's
// sessions/week) plus your nutrition macros, and rolls them into one letter grade.
// Read-only: there is nothing to create here, so the shell shows no add/tab nav.

const ACCENT = '#0e7490';

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

  const weeks = data ? recentWeekStarts(8).map(ws => reportCardFor(ws, data)) : [];
  const thisWeek = weeks[0];
  const hasInputs = weeks.some(w => w.items.length > 0);
  const subtitle = !loaded ? '' : (thisWeek && thisWeek.overall ? `This week: ${thisWeek.overall.letter}` : 'This week');

  return (
    <AppShell apps={apps} activeApp={activeApp} onSwitch={onSwitch} accent={ACCENT} title="Report Card" subtitle={subtitle}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {!loaded ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 30, height: 30, border: `3px solid ${ACCENT}22`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        </div>
      ) : !hasInputs ? (
        <div style={{ textAlign: 'center', padding: '56px 24px', color: '#aaa' }}>
          <i className="ti ti-report-analytics" style={{ fontSize: 56, display: 'block', marginBottom: 12, color: `${ACCENT}66` }} aria-hidden="true" />
          <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
            No grades yet.{'\n'}Set a weekly target in an app (e.g. Jog → Goals){'\n'}and log activity to start earning grades.
          </p>
        </div>
      ) : (
        <ReportCardBody weeks={weeks} />
      )}
    </AppShell>
  );
}

function ReportCardBody({ weeks }) {
  const thisWeek = weeks[0];
  return (
    <div>
      <div style={{ padding: '20px 16px 16px', borderBottom: '0.5px solid rgba(0,0,0,.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: thisWeek.items.length ? 14 : 0 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.5px' }}>{thisWeek.label}</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{thisWeek.overall ? thisWeek.range : 'Nothing graded yet'}</div>
          </div>
          {thisWeek.overall && <GradeBadge letter={thisWeek.overall.letter} size={52} />}
        </div>
        {thisWeek.items.map(it => <GradeRow key={it.key} item={it} />)}
      </div>

      {weeks.slice(1).some(w => w.overall) && (
        <>
          <div style={{ padding: '14px 16px 6px', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.5px', background: '#f5f5f0' }}>History</div>
          {weeks.slice(1).filter(w => w.overall).map(w => <HistoryWeek key={w.weekStart} week={w} />)}
        </>
      )}
    </div>
  );
}

// A past week, collapsed to a one-line summary; tap to reveal the per-habit
// breakdown so the user can see exactly where the grade came from and adjust.
function HistoryWeek({ week }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '0.5px solid rgba(0,0,0,.06)' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: open ? '#faf7f3' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{week.label}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {week.range} · {week.items.map(i => `${i.label} ${i.na ? 'N/A' : i.letter}`).join(' · ')}
          </div>
        </div>
        <GradeBadge letter={week.overall.letter} />
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 16, color: '#bbb' }} aria-hidden="true" />
      </button>
      {open && (
        <div style={{ padding: '4px 16px 14px' }}>
          {week.items.map(it => <GradeRow key={it.key} item={it} />)}
        </div>
      )}
    </div>
  );
}

function GradeBadge({ letter, size = 34 }) {
  const na = letter === 'N/A';
  const color = na ? '#a8a8a8' : letterColor(letter);
  return (
    <div style={{
      minWidth: size, height: size, padding: '0 8px', borderRadius: 9, background: na ? '#efefe9' : `${color}1a`,
      color, fontWeight: 800, fontSize: na ? (size >= 44 ? 15 : 11) : (size >= 44 ? 22 : 15), display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{letter}</div>
  );
}

function GradeRow({ item }) {
  if (item.na) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', opacity: 0.75 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</span>
            <span style={{ fontSize: 11, color: '#bbb' }}>{item.key === 'nutrition' ? 'no meals logged' : 'no activity logged'}</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: '#ececec' }} />
        </div>
        <GradeBadge letter="N/A" />
      </div>
    );
  }
  const color = letterColor(item.letter);
  const detail = item.key === 'nutrition'
    ? `${item.loggedDays} day${item.loggedDays === 1 ? '' : 's'} logged`
    : `${(+item.actual).toFixed(item.unit === 'km' ? 1 : 0)} / ${item.target} ${item.unit}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</span>
          <span style={{ fontSize: 11, color: '#aaa' }}>{detail}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: '#e8e8e4', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 3, background: color, width: `${Math.round(item.score * 100)}%` }} />
        </div>
      </div>
      <GradeBadge letter={item.letter} />
    </div>
  );
}
