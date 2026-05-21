# NutriSnap – AI Nutrition Tracker

Snap a photo of any meal → AI estimates calories & macros → track against your daily goals → get smart nudges to stay on track.

Live: **https://nutrisnap-lovat.vercel.app**

## Demo

<table>
  <tr>
    <td align="center"><b>Sign in</b><br><img src="docs/screenshots/01-lock.png" alt="Sign-in screen" width="240"></td>
    <td align="center"><b>Today's log</b><br><img src="docs/screenshots/02-log.png" alt="Log view with rings, progress bars, and nudge" width="240"></td>
    <td align="center"><b>Snap a meal</b><br><img src="docs/screenshots/03-snap-idle.png" alt="Snap tab with text and photo inputs" width="240"></td>
  </tr>
  <tr>
    <td align="center"><b>Two-phase AI review</b><br><img src="docs/screenshots/04-snap-review.png" alt="Review screen showing AI-estimated per-unit macros" width="240"></td>
    <td align="center"><b>Reports — calories</b><br><img src="docs/screenshots/05-report-calories.png" alt="Day chart with calories selected" width="240"></td>
    <td align="center"><b>Tap a tile to switch</b><br><img src="docs/screenshots/06-report-protein.png" alt="Day chart switched to protein view" width="240"></td>
  </tr>
</table>

Type a food name or snap a photo. **Phase 1** identifies the food, amount, and a natural reference unit (grams for loose foods, eggs/slices/cups for discrete items). **Phase 2** fetches per-unit macros — but only the first time. Re-logging the same food hits a per-user library cache and skips the AI call entirely. The review screen lets you tweak the amount and the macros rescale live; saving the per-unit values back updates the library so future logs are even faster.

---

## Prerequisites

- **Node.js 18+** — https://nodejs.org
- **npm** (comes with Node)
- An **Anthropic API key** — https://console.anthropic.com

---

## 1 — First-time setup

```bash
# Clone or unzip this project, then:
cd nutrisnap
npm install
```

---

## 2 — Add your API key

Open `src/utils/api.js` and replace the fetch headers with your key:

```js
headers: {
  'Content-Type': 'application/json',
  'x-api-key': 'sk-ant-YOUR_KEY_HERE',        // ← add this line
  'anthropic-version': '2023-06-01',            // ← add this line
  'anthropic-dangerous-direct-browser-access': 'true',  // ← required for browser
},
```

> **Security note:** For production, proxy API calls through your own backend so the key is never exposed in the browser bundle.

---

## 3 — Run locally (any browser)

```bash
npm start
```

Opens at **http://localhost:3000**. Works immediately as a web app on desktop and mobile browsers on your local network (`http://YOUR_IP:3000`).

---

## 4 — Build for production / hosting

```bash
npm run build
```

Outputs a `build/` folder. Deploy it to any static host:

Deploy to Vercel:

```bash
vercel --prod
```

Once deployed at an **HTTPS** URL, the PWA is fully installable on all platforms.

---

## 5 — Install on iOS (iPhone / iPad)

1. Open **Safari** and go to your deployed HTTPS URL  
2. Tap the **Share** button (box with arrow)  
3. Scroll down and tap **"Add to Home Screen"**  
4. Tap **Add** — NutriSnap appears as a full-screen app  

> Requires HTTPS. Works on iOS 16.4+ with full PWA support including offline mode.

---

## 6 — Install on Android

**Chrome (recommended):**
1. Open **Chrome** and go to your deployed HTTPS URL  
2. Tap the **⋮ menu** (top-right)  
3. Tap **"Add to Home screen"** or **"Install app"**  
4. Tap **Install** — NutriSnap installs like a native app  

**Samsung Internet:**
1. Tap the **☰ menu → Add page to → Home screen**

> Android PWAs get their own launcher icon, app drawer entry, and full-screen experience — indistinguishable from a native app.

---

## 7 — Install on Desktop (Chrome / Edge)

1. Visit your HTTPS URL in Chrome or Edge  
2. Look for the **install icon** (⊕) in the address bar  
3. Click it → **Install**  

Or via menu: **⋮ → Save and share → Install NutriSnap**

---

## 8 — Native app (optional — React Native)

For a true App Store / Play Store submission, the `src/` folder is structured to be ported to **React Native** or **Expo**:

```bash
npx create-expo-app NutriSnapNative
# Copy component logic across — the API calls and storage utilities
# are identical; only JSX styling changes (StyleSheet instead of inline CSS)
```

Key differences to handle:
- `expo-camera` for photo capture instead of `<input type="file">`
- `@react-native-async-storage/async-storage` instead of `localStorage`
- `expo-notifications` for proper push notifications
- `expo-image-picker` for gallery access

---

## Project structure

```
nutrisnap/
├── public/
│   ├── index.html          # HTML shell
│   ├── manifest.json       # PWA manifest (icons, theme, display mode)
│   ├── icon-192.png        # App icon
│   └── icon-512.png        # App icon (large)
├── src/
│   ├── index.js            # Entry point + service worker registration
│   ├── index.css           # Global styles + CSS variables
│   ├── App.jsx             # App shell, navigation, state
│   ├── service-worker.js   # Workbox offline caching + push handler
│   ├── serviceWorkerRegistration.js
│   ├── components/
│   │   ├── SnapView.jsx    # Photo capture + AI analysis flow
│   │   ├── LogView.jsx     # Daily log + progress rings + nudge card
│   │   ├── ReportView.jsx  # Day/week/month chart with goal line
│   │   ├── SettingsView.jsx # Goals + notification settings
│   │   ├── Ring.jsx        # SVG progress ring
│   │   ├── ProgressBar.jsx # Macro progress bar
│   │   └── NudgeCard.jsx   # AI nudge banner
│   └── utils/
│       ├── api.js          # Claude API calls (analyzeFood, getNudge)
│       ├── storage.js      # localStorage helpers + defaults
│       └── date.js         # Date formatting helpers
```

---

## Features

- **Photo → macros** — Claude AI estimates calories, protein, carbs, fat, fiber from any food photo
- **Editable estimates** — review and correct before saving
- **Progress rings** — real-time visual of today's intake vs goal
- **AI nudges** — context-aware suggestions like "Need 25g more protein — eat a boiled egg and chicken now"
- **Reports** — day / week / month calorie charts with goal line
- **Daily goals** — set per-macro targets in the Goals tab
- **Push reminders** — configurable morning / afternoon / evening alerts
- **Offline support** — service worker caches app shell for offline use
- **PWA** — installable on iOS, Android, and desktop
