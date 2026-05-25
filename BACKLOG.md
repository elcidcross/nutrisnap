# Backlog

- [x] Fix iPhone UI: header text overlaps system status bar
- [x] Snap tab: select a previously logged meal from history to re-log
- [x] Goal history: track goal changes over time so past logs aren't retroactively affected
- [x] Export meals to CSV
- [x] Import meals from CSV
- [x] Add semver version number and improve build stamp display
- [x] Migrate hosting from Netlify to Vercel
- [x] Gallery picker: open photos directly without submenu
- [ ] Log the photo even when AI analysis fails — don't lose the photo on error
- [ ] "Re-analyze" button on logged items that weren't analyzed the first time
- [ ] Tap a logged item's photo to expand it (lightbox)
- [ ] Delete: add an undo toast (fallback: confirm dialog if undo is too involved)
- [ ] Snap tab "Recent" list: show last 3 days of items (more likely to repeat yesterday's meal than the same day's)
- [ ] BUG: editing a logged item's amount — clearing all digits then retyping fails to repopulate calories/macros (workaround: cancel and retry)
- [ ] BUG: after snapping, clearing all digits in the amount field shows a leading zero (cosmetic only)
- [ ] Reports: show the target alongside each bubble value (e.g. "0 / 210 kcal"), target on a small second line
