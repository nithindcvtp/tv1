/* S1 IPTV - web edition, TV side.
   The TV page is its own "host": it keeps the channel state, answers the phone remote's commands
   and answers the phone remote's commands. The phone talks to it over a direct peer link (PeerJS).
   The TV page shows a QR code (hide/show it from the remote) that opens the remote page; both pages
   automatically meet in the same "room" (see config.js), so there is no code to type. */
(function () {
  'use strict';
  var realFetch = window.fetch.bind(window);

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }

  /* ---------- channel state (what iptv_host.py kept on the PC) ---------- */
  var state = { id: 0, name: '', url: '', index: 0, volume: 70, muted: false };
  state.qr = store('s1_qr') !== '0';   /* QR code for the remote: shown by default, hide/show from the phone remote */
  var CHANNELS = [];
  var notice = { msg: '', at: 0, n: 0 };
  function say(msg) { notice.msg = msg; notice.at = Date.now() / 1000; notice.n++; }
  function getDefault() { try { var d = JSON.parse(store('s1_default') || 'null'); if (d && /^https?:\/\//.test(d.url || '')) return d; } catch (e) {} return { name: '', url: '' }; }
  function tune(n) {
    if (!CHANNELS.length) return;
    n = ((n - 1) % CHANNELS.length + CHANNELS.length) % CHANNELS.length + 1;
    var c = CHANNELS[n - 1];
    state.id++; state.index = n; state.name = c.name; state.url = c.url;
  }
  function applyDefault() {
    var d = getDefault();
    if (!d.url) { tune(1); return; }   /* nothing saved yet: start with the first channel so the TV is never blank */
    for (var i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].url === d.url) { tune(i + 1); return; }
    state.id++; state.name = d.name || ''; state.url = d.url; state.index = 0;
  }
  var channelsReady = realFetch('channels_ml.json?ts=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (d) { CHANNELS = d.filter(function (c) { return /^https?:\/\//.test(String(c.url || '')); }); })
    .catch(function () { CHANNELS = []; })
    .then(applyDefault);

  function snapshot() {
    var now = Date.now() / 1000, d = {}, k;
    for (k in state) d[k] = state[k];
    d.tv = true; d.yt = false; d.browse = false; d.browse_sel = 0; d.browse_list = [];
    d.notice = (now - notice.at) < 5 ? notice.msg : ''; d.notice_id = notice.n;
    /* recording / recordings playback / power / YouTube need the PC host: not available on the web version */
    d.rec_on = false; d.rec_secs = 0; d.rec_name = ''; d.rec_file = ''; d.rec_saved = ''; d.rec_error = '';
    d.play_file = ''; d.play_id = 0; d.play_seek = 0; d.play_toggle = 0; d.play_msg = ''; d.play_error = '';
    d.power_state = 'idle'; d.power_count = 0;
    return d;
  }

  function runCmd(cmd, value) {
    var n;
    switch (cmd) {
      case 'ch': n = parseInt(value, 10); if (isNaN(n)) return null; if (n >= 1 && n <= CHANNELS.length) tune(n); break;
      case 'ch_up': tune((state.index || 0) + 1); break;
      case 'ch_down': tune((state.index || 1) - 1); break;
      case 'vol_up': state.volume = Math.min(100, state.volume + 5); state.muted = false; break;
      case 'vol_down': state.volume = Math.max(0, state.volume - 5); break;
      case 'vol': n = parseInt(value, 10); if (isNaN(n)) return null; state.volume = Math.max(0, Math.min(100, n)); break;
      case 'mute': state.muted = !state.muted; break;
      case 'qr':   /* value: 'show' | 'hide' | anything else = toggle */
        state.qr = value === 'show' ? true : value === 'hide' ? false : !state.qr;
        store('s1_qr', state.qr ? '1' : '0'); paintQr(); break;
      case 'set_default':
        n = parseInt(value, 10); if (isNaN(n) || n < 1 || n > CHANNELS.length) return null;
        var c = CHANNELS[n - 1];
        if (getDefault().url === c.url) store('s1_default', null);
        else store('s1_default', JSON.stringify({ name: c.name, url: c.url }));
        break;
      case 'rec': case 'rec_play': case 'rec_stop': case 'rec_toggle': case 'rec_seek': case 'rec_folder':
        say('Recording is not available in the web version'); break;
      default: break;   /* joy, power, tv, yt_*, browse_* : PC-only, ignored */
    }
    return snapshot();
  }

  function remoteUrl() { var u = new URL('remote.html', location.href); u.search = ''; u.hash = ''; return u.href; }

  /* ---------- API router: same endpoints iptv_host.py had, answered locally ---------- */
  function route(method, url, body) {
    var p = String(url).split('?')[0];
    return channelsReady.then(function () {
      var ok = function (data) { return { status: 200, data: data }; };
      if (method === 'GET') {
        if (p === '/api/current') return ok(snapshot());
        if (p === '/api/default') return ok(getDefault());
        if (p === '/api/channels') { var df = getDefault().url; return ok(CHANNELS.map(function (c) { return { name: c.name, note: c.quality || '', 'default': c.url === df }; })); }
        if (p === '/api/info') return ok({ sender_url: remoteUrl(), all_urls: [remoteUrl()] });
        if (p === '/api/recordings') return ok([]);
        return { status: 404, data: {} };
      }
      body = body || {};
      if (p === '/api/cmd') { var s = runCmd(String(body.cmd || ''), body.value); return s ? ok(s) : { status: 400, data: {} }; }
      if (p === '/api/push' || p === '/api/default') {
        var name = String(body.name || '').slice(0, 300), u = String(body.url || '').slice(0, 5000);
        if (!/^https?:\/\//.test(u)) return { status: 400, data: {} };
        if (p === '/api/default') { store('s1_default', JSON.stringify({ name: name, url: u })); return ok({ ok: true, 'default': true }); }
        state.id++; state.name = name; state.url = u;
        state.index = 0; for (var i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].url === u) { state.index = i + 1; break; }
        return ok({ ok: true, id: state.id });
      }
      if (p === '/api/click' || p === '/api/input') return ok({ ok: false });   /* needs the PC: not available */
      return { status: 404, data: {} };
    });
  }

  /* the TV page's own code keeps calling fetch('/api/...'): answer those locally */
  window.fetch = function (input, init) {
    var u = typeof input === 'string' ? input : (input && input.url) || '';
    if (u.indexOf('/api/') === 0) {
      var m = ((init && init.method) || 'GET').toUpperCase(), b = null;
      try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) {}
      return route(m, u, b).then(function (r) { return new Response(JSON.stringify(r.data), { status: r.status, headers: { 'Content-Type': 'application/json' } }); });
    }
    return realFetch(input, init);
  };

  /* ---------- PIN: the phone must know it. It is inside the QR code (so scanning fills it in by itself)
     or typed on the phone by hand. It also doubles as a second, always-the-same "address" for this TV,
     so a phone anywhere on the internet can find the TV with just the PIN. ---------- */
  var pin = '', fixedPin = false;
  function newPin() {
    var n = 0;
    try { var a = new Uint32Array(1); crypto.getRandomValues(a); n = a[0] % 1000000; } catch (e) { n = Math.floor(Math.random() * 1000000); }
    var p = ('000000' + n).slice(-6); store('s1_pin', p); return p;
  }
  (function () {
    var cfg = String((window.S1_CONFIG && S1_CONFIG.PIN) || '').trim().toLowerCase();
    if (cfg === 'off') return;                                   /* PIN switched off in config.js */
    if (/^\d{4,8}$/.test(cfg)) { pin = cfg; fixedPin = true; return; }   /* fixed PIN from config.js */
    var saved = store('s1_pin');
    pin = /^\d{6}$/.test(saved || '') ? saved : newPin();        /* otherwise: a random PIN made once, kept in this browser */
  })();
  function pinText() { return pin.length === 6 ? pin.slice(0, 3) + ' ' + pin.slice(3) : pin; }

  var badTries = 0, lockUntil = 0;
  function checkPin(given) {                       /* -> 'ok' | 'need' (none given) | 'bad' | 'locked' */
    if (!pin) return 'ok';
    var now = Date.now();
    if (now < lockUntil) return 'locked';
    if (!given) return 'need';
    if (given === pin) { badTries = 0; return 'ok'; }
    if (++badTries >= 5) { lockUntil = now + 60000; badTries = 0; }   /* 5 wrong PINs: wait a minute */
    return 'bad';
  }

  /* ---------- link to the phone remote ---------- */
  var conns = [], status = 'Starting...', box = null;
  var links = { room: { peer: null, t: 0, taken: 0 }, pin: { peer: null, t: 0, taken: 0 } };
  function paintStatus() {
    if (!box) return;
    box.textContent = conns.length ? '\u25CF ' + conns.length + ' remote' + (conns.length > 1 ? 's' : '') + ' connected' : status;
  }
  function onConn(conn) {
    conn.on('data', function (m) {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hello') {
        var r = checkPin(String(m.pin || '').replace(/\D/g, ''));
        if (r === 'ok') {
          if (conns.indexOf(conn) < 0) conns.push(conn);
          conn.send({ t: 'welcome' }); say('\uD83D\uDCF1 Remote connected'); paintStatus();
          pairing = false; paintQr();
        } else if (r === 'locked') {
          conn.send({ t: 'locked', secs: Math.max(1, Math.ceil((lockUntil - Date.now()) / 1000)) }); showPairing();
        } else {
          conn.send({ t: 'need_pin', bad: r === 'bad' }); showPairing();   /* show the QR + PIN on the TV for a while, even if hidden */
        }
      } else if (m.t === 'rpc' && conns.indexOf(conn) >= 0) {
        route(m.method, m.path, m.body).then(function (r) { conn.send({ t: 'res', id: m.id, status: r.status, data: r.data }); });
      }
    });
    var gone = function () { var i = conns.indexOf(conn); if (i >= 0) conns.splice(i, 1); paintStatus(); };
    conn.on('close', gone); conn.on('error', gone);
  }
  /* one link = one address on the relay. 'room' = Wi-Fi / home name, 'pin' = the PIN address (works from anywhere) */
  function startLink(name, idFn, primary) {
    var L = links[name];
    clearTimeout(L.t);
    try { if (L.peer) L.peer.destroy(); } catch (e) {}
    L.peer = null;
    var retry = function (ms) { clearTimeout(L.t); L.t = setTimeout(function () { startLink(name, idFn, primary); }, ms || 0); };
    if (!window.Peer) { if (primary) { status = 'Needs internet'; paintStatus(); } return retry(8000); }
    idFn().then(function (id) {
      if (!id) { if (!primary) return; status = 'No internet - retrying...'; paintStatus(); return retry(8000); }
      if (primary) { qrRoom = id; drawQr(); }
      var p = new Peer(id, { debug: 0, config: window.S1_ICE() });
      L.peer = p;
      p.on('open', function () { L.taken = 0; if (primary) { status = 'Waiting for the remote...'; paintStatus(); } });
      p.on('connection', onConn);
      p.on('disconnected', function () { if (primary) { status = 'Reconnecting...'; paintStatus(); } setTimeout(function () { try { p.reconnect(); } catch (e) {} }, 2000); });
      p.on('error', function (err) {
        if (err && err.type === 'peer-unavailable') return;
        /* 'unavailable-id' = the relay still holds our previous session (quick refresh): just retry */
        var taken = !!(err && err.type === 'unavailable-id');
        if (primary) { status = taken ? 'Reconnecting...' : 'Offline - retrying...'; paintStatus(); }
        /* the PIN address is used by another TV for minutes on end (very unlikely): pick a new PIN */
        if (!primary && taken && !fixedPin && ++L.taken >= 24) { L.taken = 0; pin = newPin(); drawQr(); }
        retry(5000);
      });
    });
  }
  function startPeer() {
    startLink('room', function () { return window.S1_ROOM(); }, true);
    startLink('pin', function () { return Promise.resolve(pin ? 's1iptv-pin-' + pin : ''); }, false);
  }

  /* ---------- QR code for the remote: scan it with the phone to open remote.html (the PIN rides along) ---------- */
  var qrBox = null, qrImg = null, qrPinEl = null, qrRoom = '', pairing = false, pairT = 0;
  function buildQr() {
    qrBox = document.createElement('div'); qrBox.id = 's1qr';
    qrBox.style.cssText = 'position:fixed;right:10px;bottom:44px;z-index:45;background:#fff;color:#111;' +
      'border-radius:10px;padding:6px 6px 6px;width:118px;text-align:center;font:700 9px Arial,sans-serif;' +
      'box-shadow:0 3px 12px #0008;display:none;pointer-events:none;opacity:.92';
    qrBox.innerHTML = '<div style="margin-bottom:4px">Scan for remote</div><div id="s1qrimg" style="width:104px;height:104px;margin:0 auto"></div>' +
      '<div id="s1qrpin" style="font:700 12px Arial,sans-serif;letter-spacing:.12em;margin-top:5px"></div>';
    qrImg = qrBox.querySelector('#s1qrimg'); qrPinEl = qrBox.querySelector('#s1qrpin');
    document.body.appendChild(qrBox);
    drawQr();
  }
  /* The QR holds the remote address plus the PIN after the # (a # part is never sent to any server).
     Without a PIN it carries the room name instead (?r=...). */
  function drawQr() {
    if (!qrImg) return;
    var url = remoteUrl();
    if (pin) url += '#p=' + pin; else if (qrRoom) url += '?r=' + encodeURIComponent(qrRoom.replace(/^s1iptv-/, ''));
    var svg = '';
    try { var q = qrcode(0, 'L'); q.addData(url); q.make(); svg = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); } catch (e) {}
    qrImg.innerHTML = svg;
    var el = qrImg.querySelector('svg'); if (el) { el.style.width = '100%'; el.style.height = '100%'; el.style.display = 'block'; }
    if (qrPinEl) qrPinEl.textContent = pin ? 'PIN ' + pinText() : '';
  }
  /* a phone is asking for the PIN: show the QR + PIN on the TV for a minute and a half, even if it was hidden */
  function showPairing() {
    if (!pin) return;
    pairing = true; paintQr();
    clearTimeout(pairT); pairT = setTimeout(function () { pairing = false; paintQr(); }, 90000);
  }
  function paintQr() {
    if (!qrBox) return;
    qrBox.style.display = (state.qr || pairing) ? 'block' : 'none';
  }

  /* ---------- tiny status text + auto fullscreen/unmute on first touch ---------- */
  function ready() {
    box = document.createElement('div'); box.id = 's1status';
    box.style.cssText = 'position:fixed;right:14px;bottom:12px;z-index:50;color:#fff;background:#0007;font:600 12px Arial;padding:5px 10px;border-radius:12px;opacity:.55;pointer-events:none';
    document.body.appendChild(box); paintStatus();
    buildQr(); paintQr();
    document.addEventListener('mousemove', function () { box.style.opacity = '.9'; clearTimeout(box._t); box._t = setTimeout(function () { box.style.opacity = '.55'; }, 2500); });

    /* no blocking "click to start" screen: the TV starts by itself (muted if the browser demands it).
       The first real click / key / touch on the TV page (if it ever happens) goes fullscreen and un-mutes. */
    var hint = document.createElement('div'); hint.id = 's1hint';
    hint.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:50;background:#000b;color:#fff;font:600 14px Arial;padding:8px 16px;border-radius:20px;display:none;pointer-events:none';
    hint.textContent = '\uD83D\uDD07 Muted by the browser \u2013 click or press any key once on this screen for sound + fullscreen';
    document.body.appendChild(hint);
    window.s1ShowHint = function (on) { hint.style.display = on ? 'block' : 'none'; };
    var go = function () {
      document.removeEventListener('pointerdown', go, true); document.removeEventListener('keydown', go, true); document.removeEventListener('touchstart', go, true);
      try { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); } catch (e) {}
      if (typeof window.s1Unmute === 'function') window.s1Unmute();
    };
    document.addEventListener('pointerdown', go, true); document.addEventListener('keydown', go, true); document.addEventListener('touchstart', go, true);
    startPeer();
    try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js'); } catch (e) {}   /* lets the TV page be installed as an app */
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
