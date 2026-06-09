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
];

export default RELEASE_NOTES;
export const CURRENT_VERSION = RELEASE_NOTES[0].version;
