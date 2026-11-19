# S1 TV – simple home IPTV (GitHub Pages)

Watch live channels on the TV/computer and change channel, volume and mute from a phone.
**No codes to type, no installs** – open the TV page, scan the QR code on it with your phone (or open the remote page), done.
Made to be easy for family at home.

- `index.html` – the **TV page** (open on the TV / computer).
- `remote.html` – the **phone remote** (open on the phone; bookmark it or add it to the home screen).
- `channels_ml.json` – channel list. Edit in GitHub to add/remove/reorder channels (remote channel number = position in the file).
- `config.js` – optional home setting (see below).
- `s1-host.js` / `s1-remote.js` – the TV-side and phone-side link code.
- `manifest-tv.json`, `manifest-remote.json`, `sw.js`, `icon-*.png` – make the TV page and the remote installable as apps (PWA).
- `qrcode.js` – small QR generator (MIT, bundled so it works without extra downloads).

## Publish
1. Create a GitHub repository and upload all files in this folder (keep `.nojekyll`).
2. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. After a minute the pages are at
   - TV: `https://<user>.github.io/<repo>/`
   - Remote: `https://<user>.github.io/<repo>/remote.html`

## Use
1. Open the **TV page** on the TV/computer (it starts playing the first channel by itself, or your starred channel; click once for sound + fullscreen if the browser mutes it).
2. Scan the **QR code** shown in the corner of the TV page with the phone camera (or open the remote page by hand). It connects automatically and keeps reconnecting if the TV page is opened later.
3. To clear the picture, tap **HIDE QR** in the remote's tools row (tap **SHOW QR** to bring it back). The choice is remembered on the TV.
4. Pick a channel. The star sets the TV's start-up channel (saved in the TV's browser).

## How the two pages find each other
By default they meet automatically based on your home internet connection (public IP), so any phone on the same Wi‑Fi
finds the TV with no setup. If two homes share one internet address (some mobile/fibre providers do this) or you want to
use the remote from outside the house, open `config.js` and set a private name, e.g. `HOME_NAME: 'kumar-house-4821'`.
The TV page and remote page of that site then always find each other. This is intentionally light security for home use –
don't put anything private behind it.

## Not available in this version (needs a PC host)
Recording and playback, mouse/keyboard control, power/open-close TV, YouTube launcher. These buttons are hidden.

## What changed from the original
- Removed the code-entry screen. The QR code is back: it is on the TV page and only opens the remote page (no code involved); it can be hidden/shown from the remote.
- Automatic pairing between TV page and remote page (`config.js`).
- Remote retries by itself until the TV page is found.

## Works at home and away (automatic)
The phone first tries the fastest route (same Wi-Fi, direct). If that is not possible (mobile data, another Wi-Fi,
a router that blocks device-to-device traffic) it switches by itself to the internet relay. Nothing is shown or
chosen by the user. After you scan the QR code once, the phone remembers the TV, so the bookmarked/home-screen
remote works from anywhere. If the TV's home internet address changes, scan the QR again (or set a `HOME_NAME`
in `config.js` so it never changes).
A free shared relay is used by default. For the most dependable connection from outside the house, put your own
TURN server details in `TURN` in `config.js`.

## PIN
The TV has a PIN (random 6 digits, made once and kept in the TV's browser, shown under the QR code).
- **Scan the QR code** with the phone: the PIN is inside the link, so nothing to type.
- **Open the remote page directly** (bookmark / app icon): the first time it asks for the PIN. When it asks, the TV
  shows the QR + PIN for 90 seconds even if the QR was hidden. After that the phone remembers it.
- The PIN is also the TV's address on the internet, so a phone on mobile data or another Wi-Fi can find the TV
  with just the PIN ("Can't find the TV" screen has a PIN box).
- 5 wrong PINs in a row lock the TV's remote for 1 minute.
- Choose your own in `config.js` (`PIN: '482913'`, 4-8 digits) or switch it off (`PIN: 'off'`).

## Install as apps (PWA)
- **TV PC (Chrome / Edge):** open the TV page, then the install icon in the address bar (or menu → Install S1 TV).
  Installed apps are allowed to play sound without a click.
- **Android:** open the remote page in Chrome, menu → Install app / Add to Home screen.
- **iPhone:** open the remote page in Safari, Share → Add to Home Screen.
