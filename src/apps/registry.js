import NutriSnapApp from './NutriSnapApp';
import JogApp from './JogApp';
import WorkoutApp from './WorkoutApp';
import MeditationApp from './MeditationApp';
import BodyApp from './BodyApp';
import GoalsApp from './GoalsApp';
import ReportCardApp from './ReportCardApp';

// The installed "apps", shown in the header app-switcher dropdown in this order.
// Each is a self-contained module; the shell (App.jsx) keeps all of them mounted
// but only the active one renders (the rest return null), so switching is instant.
export const APPS = [
  { id: 'nutrisnap',  name: 'NutriSnap',  icon: 'ti-salad',   accent: '#1d9e75', Component: NutriSnapApp },
  { id: 'jog',        name: 'Jog',        icon: 'ti-run',     accent: '#378add', Component: JogApp },
  { id: 'workout',    name: 'Workout',    icon: 'ti-barbell', accent: '#ba7517', Component: WorkoutApp },
  { id: 'meditation', name: 'Meditation', icon: 'ti-yoga',    accent: '#8a63d2', Component: MeditationApp },
  { id: 'body',       name: 'Body',       icon: 'ti-scale',   accent: '#d4537e', Component: BodyApp },
  { id: 'goals',      name: 'Goals',      icon: 'ti-target',   accent: '#c2410c', Component: GoalsApp },
  { id: 'reportcard', name: 'Report Card', icon: 'ti-report-analytics', accent: '#0e7490', Component: ReportCardApp },
];

export const APP_IDS = APPS.map(a => a.id);
