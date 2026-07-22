# Snapbooth

A self-contained, static photobooth website: guests turn on their camera, take a
sequence of photos with a countdown, get them composited into a customizable
printed "strip," then download or share it. A password-protected staff
dashboard lets you restyle the strip and change booth rules without touching code.

No backend, database, or build step — it's plain HTML/CSS/JS, so it deploys to
Vercel as a static site in about a minute.

## What's included

```
index.html        the booth (guest-facing page)
admin.html         the staff dashboard (login-gated)
css/style.css       shared styling for both pages
js/app.js           camera, countdown, strip compositing, download/share
js/admin.js         login, settings form, live preview, backup/reset
vercel.json         static hosting config
```

## Deploy to Vercel

**Option A — Vercel CLI**
```bash
npm i -g vercel
cd snapbooth
vercel        # first deploy, follow the prompts
vercel --prod # promote to production
```

**Option B — GitHub + Vercel dashboard**
1. Push this folder to a new GitHub repo.
2. In Vercel: **Add New → Project**, import the repo.
3. Framework preset: **Other** (it's static — no build command needed).
4. Deploy.

That's it — Vercel will serve `index.html` and `admin.html` directly.

## Using the booth

1. Open the site, click **Turn on camera**, and allow browser camera access.
2. Pick a shot count and filter (if the staff dashboard allows guest choice).
3. Click **Start photos** — each shot fires after a countdown with a flash.
4. The finished strip "prints" onto the page. Guests can **Download** it,
   **Share** it (uses the native share sheet on phones; falls back to copying
   the image on desktop), or **Retake**.

Photos are captured and composited entirely in the browser — nothing is
uploaded anywhere, which also means it works great for events with unreliable
Wi-Fi.

## Staff dashboard

Go to `/admin.html` (linked at the bottom of the booth page).

- **Default login:** `admin` / `admin123` — **change this immediately** from
  the *Account & data* tab after your first sign-in.
- **Branding:** booth name and tagline shown on the marquee.
- **Strip design:** paper/frame/accent colors, header text or logo image,
  footer text (supports a `{date}` token), toggle perforations and date stamp,
  with a live preview.
- **Session rules:** which shot counts are offered, the default, whether
  guests can choose it, countdown length, and filter defaults.
- **Account & data:** change the staff username/password, export your settings
  as a JSON file (handy backup or to copy the look to another device/browser),
  import a settings file, or reset everything to defaults.

### How settings are stored

Everything is saved in the browser's `localStorage`, scoped to whichever
device/browser is running the booth. That means:

- Settings you change in the dashboard only apply on **that same browser**.
  If your booth runs on a kiosk laptop, sign in and configure it on that same
  laptop's browser.
- Clearing site data/cookies on that browser will remove your customization
  (back it up first with **Export settings**).
- There's no shared database, so this setup is built for a **single booth /
  single device** at a time. If you need multiple kiosks to share one live
  configuration, you'd want to swap `localStorage` for a small backend (e.g. a
  Vercel KV store or a lightweight API) — happy to help wire that up if you
  need it.

### A note on the admin login

The staff login is a convenience lock, not a hardened authentication system:
it checks a SHA-256 password hash entirely in the browser, so it's meant to
keep casual guests out of the settings screen at an event, not to protect
sensitive data. Don't reuse a password you use elsewhere, and don't rely on it
for anything beyond "keep event guests from messing with the settings."

## Customizing further

- Swap the Google Fonts import at the top of `css/style.css` to change the
  typography.
- Filter presets live in `DEFAULT_SETTINGS.filters` in both `js/app.js` and
  `js/admin.js` (kept in sync) if you want to add/edit filter CSS.
- The strip layout (margins, cell size, perforation spacing) is in
  `buildStrip()` in `js/app.js`.

## Browser support notes

- Camera capture requires HTTPS (Vercel gives you this by default) or
  `localhost` for local testing.
- The native **Share** button needs a browser that supports
  `navigator.share` with files (most mobile browsers). Desktop browsers fall
  back to copying the image to the clipboard, or guests can just use
  Download.
