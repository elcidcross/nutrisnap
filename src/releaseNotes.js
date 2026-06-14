// Release notes shown in the in-app "What's new" panel (see ReleaseNotes.jsx).
//
// Newest release first. Each entry:
//   version — matches the deployed app version (the one shown in the bottom nav).
//   date    — release date/time in JST (Asia/Tokyo), the timezone the app is used in.
//   notes   — short, user-facing bullets. Lead with how it changes the experience,
//             not the implementation. Tech-savvy reader, not a developer.
//
// When cutting a release, add a new entry at the top before tagging.

const RELEASE_NOTES = [
  {
    version: '2.0.0',
    date: '2026-06-14 23:30 JST',
    notes: [
      'NutriSnap 2.0 — our biggest release yet. From the very start, the point of this app was never tracking for its own sake; it’s setting goals and actually reaching them. Tracking is the means, not the end — and 2.0 finally puts that front and centre.',
      'New Goals app: set an outcome with a deadline — say “16% body fat by July 14” — and see exactly how close you are, with an honest verdict when the day arrives: achieved or missed. Tap the title at the top to switch to it.',
      'New Report Card: every finished week earns a real letter grade — one for each habit (nutrition, jogging, meditation, workouts) plus an overall mark — so a single glance tells you whether you’re winning. Swipe back through past weeks, tap any subject to see exactly why you earned it, and screenshot the kind of A+ that’s worth sharing.',
      'Your weekly targets now live in each activity’s “Targets” tab, with sensible defaults out of the box — so your Report Card grades you from the very first week.',
    ],
  },
  {
    version: '1.4.22',
    date: '2026-06-14 16:30 JST',
    notes: [
      'The Body Report now charts all metrics — adding body water, bone mass, BMR, visceral fat and leg score alongside the existing weight, body fat and muscle charts.',
      'Adding a new body measurement pre-fills the form with your previous reading, so you only need to change what actually shifted.',
      'The add form now follows the Tanita DC-430A printout order and shows Japanese field names alongside English.',
      'Bone mass and visceral fat charts use a wider y-axis so small day-to-day shifts don’t look like dramatic swings.',
    ],
  },
  {
    version: '1.4.19',
    date: '2026-06-09 21:15 JST',
    notes: [
      "Fixed meals that scanned “successfully” but logged zero calories and macros. On busier meals (several components, like a bento), the AI was running out of room and cutting its answer short before the numbers came through — so the meal saved empty. It now returns the full result every time.",
      'Snap is quicker, too: meal analysis no longer spends time on hidden deliberation it doesn’t need for reading a label or photo, so results come back faster.',
      'Added this “What’s new” panel — tap the bell in the top-right anytime to see what changed.',
    ],
  },
  {
    version: '1.4.18',
    date: '2026-06-05 00:29 JST',
    notes: [
      'When you log the same meal again, Snap now starts from the amount you last logged it as — so re-logging your regular coffee or lunch takes one fewer adjustment.',
    ],
  },
  {
    version: '1.4.17',
    date: '2026-06-04 09:19 JST',
    notes: [
      'Fixed an annoying stuck “0” when retyping a macro value on the review screen — the field now clears cleanly as you’d expect.',
    ],
  },
  {
    version: '1.4.16',
    date: '2026-06-04 08:13 JST',
    notes: [
      'You can now enter meals in the units you actually think in — “2 slices,” “1 egg” — and NutriSnap handles the grams behind the scenes.',
      'Goals and Reports are now tailored per activity, so each part of the app tracks against the targets that make sense for it.',
    ],
  },
  {
    version: '1.4.15',
    date: '2026-06-02 21:17 JST',
    notes: [
      'The Body tracker now records full smart-scale readings — body fat, muscle, water and more — for a complete composition picture, not just weight.',
    ],
  },
  {
    version: '1.4.14',
    date: '2026-06-02 11:49 JST',
    notes: [
      'Meal analysis now retries automatically when your connection drops for a moment, instead of giving up on the first hiccup.',
    ],
  },
  {
    version: '1.4.13',
    date: '2026-06-02 09:31 JST',
    notes: [
      'NutriSnap grew into a wellness hub: tap the title at the top to switch between Nutrition, Body, Workouts, Jogging and more — all sharing one app and one login.',
    ],
  },
  {
    version: '1.4.11',
    date: '2026-06-01 00:09 JST',
    notes: [
      'As you type a meal name, NutriSnap suggests foods you’ve logged before — so your regulars are a tap to fill in.',
    ],
  },
  {
    version: '1.4.10',
    date: '2026-05-31 23:36 JST',
    notes: [
      'Meal photos are now shrunk on your phone before uploading. Large photos no longer fail with an error, and uploads are noticeably faster.',
    ],
  },
  {
    version: '1.4.9',
    date: '2026-05-31 23:23 JST',
    notes: [
      'Reports now open to the Week view by default — a more useful overview than a single day.',
    ],
  },
  {
    version: '1.4.8',
    date: '2026-05-31 22:56 JST',
    notes: [
      'Report charts now label real days and dates (Sun–Sat, 1–31), making your weekly and monthly trends much easier to read.',
    ],
  },
  {
    version: '1.4.5',
    date: '2026-05-28 21:45 JST',
    notes: [
      'Re-logging is simpler: every entry in your log now has a quick re-add button, replacing the separate Recents list.',
    ],
  },
  {
    version: '1.4.4',
    date: '2026-05-28 20:58 JST',
    notes: [
      'In a hurry? Snap a meal and save the photo to analyze later, instead of waiting for the AI right then and there.',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-05-26 21:53 JST',
    notes: [
      'The app stays quick to open even as your history grows — meal thumbnails now load in the background after the list appears.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-05-26 21:29 JST',
    notes: [
      'Your in-progress meal review now survives an accidental phone lock or page reload — pick up right where you left off.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-05-26 01:40 JST',
    notes: [
      'Reports show all four nutrition charts — calories, protein, carbs and fat — at once.',
      'Step through earlier periods with previous/next arrows on the Report view.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-05-26 01:16 JST',
    notes: [
      'Tap a logged meal’s photo to view it full-screen.',
      'A confirmation step now guards against deleting a log entry by accident.',
      'Snap shows your last few days of meals for quick re-logging, and each report bubble shows that period’s target.',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-05-22 01:20 JST',
    notes: [
      'The first NutriSnap release: snap a photo of a meal and get an AI estimate of its calories and macros.',
      'Bring your own AI key and pick your provider — Claude, OpenAI or Gemini — in Settings.',
      'Type meals by name or choose from your gallery, edit any logged meal, and export or import your history as CSV.',
      'Goals are tracked over time, so past days always compare against the targets you had back then.',
    ],
  },
];

export default RELEASE_NOTES;
export const CURRENT_VERSION = RELEASE_NOTES[0].version;
