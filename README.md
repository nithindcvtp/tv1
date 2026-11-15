# S1 TV – simple home IPTV (GitHub Pages)

Watch live channels on the TV/computer and change channel, volume and mute from a phone.
**No QR code, no codes to type, no installs** – open the TV page, open the remote page, done.
Made to be easy for family at home.

- `index.html` – the **TV page** (open on the TV / computer).
- `remote.html` – the **phone remote** (open on the phone; bookmark it or add it to the home screen).
- `channels_ml.json` – channel list. Edit in GitHub to add/remove/reorder channels (remote channel number = position in the file).
- `config.js` – optional home setting (see below).
- `s1-host.js` / `s1-remote.js` – the TV-side and phone-side link code.

## Publish
1. Create a GitHub repository and upload all files in this folder (keep `.nojekyll`).
2. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. After a minute the pages are at
   - TV: `https://<user>.github.io/<repo>/`
   - Remote: `https://<user>.github.io/<repo>/remote.html`

## Use
1. Open the **TV page** on the TV/computer (it starts playing by itself; click once for sound + fullscreen if the browser mutes it).
2. Open the **remote page** on the phone (same home Wi‑Fi). It connects automatically and keeps reconnecting if the TV page is opened later.
3. Pick a channel. The star sets the TV's start-up channel (saved in the TV's browser).

## How the two pages find each other
By default they meet automatically based on your home internet connection (public IP), so any phone on the same Wi‑Fi
finds the TV with no setup. If two homes share one internet address (some mobile/fibre providers do this) or you want to
use the remote from outside the house, open `config.js` and set a private name, e.g. `HOME_NAME: 'kumar-house-4821'`.
The TV page and remote page of that site then always find each other. This is intentionally light security for home use –
don't put anything private behind it.

## Not available in this version (needs a PC host)
Recording and playback, mouse/keyboard control, power/open-close TV, YouTube launcher. These buttons are hidden.

## What changed from the original
- Removed the QR code (and `qrcode.js`) and the code-entry screen.
- Automatic pairing between TV page and remote page (`config.js`).
- Remote retries by itself until the TV page is found.
