/* S1 IPTV - web edition, TV side.
   The TV page is its own "host": it keeps the channel state, answers the phone remote's commands
   and answers the phone remote's commands. The phone talks to it over a direct peer link (PeerJS).
   There is no QR code and no code to type: both pages automatically meet in the same "room"
   (see config.js), so just open the TV page and the remote page and they connect. */
(function () {
  'use strict';
  var realFetch = window.fetch.bind(window);

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }

  /* ---------- channel state (what iptv_host.py kept on the PC) ---------- */
  var state = { id: 0, name: '', url: '', index: 0, volume: 70, muted: false };
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
    var d = getDefault(); if (!d.url) return;
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

  /* ---------- link to the phone remote (no QR / code: both pages meet in the same "room") ---------- */
  var peer = null, conns = [], status = 'Starting...', box = null, retryT = 0;
  function paintStatus() {
    if (!box) return;
    box.textContent = conns.length ? '\u25CF ' + conns.length + ' remote' + (conns.length > 1 ? 's' : '') + ' connected' : status;
  }
  function onConn(conn) {
    conn.on('data', function (m) {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hello') {
        if (conns.indexOf(conn) < 0) conns.push(conn);
        conn.send({ t: 'welcome' }); say('\uD83D\uDCF1 Remote connected'); paintStatus();
      } else if (m.t === 'rpc' && conns.indexOf(conn) >= 0) {
        route(m.method, m.path, m.body).then(function (r) { conn.send({ t: 'res', id: m.id, status: r.status, data: r.data }); });
      }
    });
    var gone = function () { var i = conns.indexOf(conn); if (i >= 0) conns.splice(i, 1); paintStatus(); };
    conn.on('close', gone); conn.on('error', gone);
  }
  function restart(delay) {
    clearTimeout(retryT);
    try { if (peer) peer.destroy(); } catch (e) {}
    peer = null;
    retryT = setTimeout(startPeer, delay || 0);
  }
  function startPeer() {
    if (!window.Peer) { status = 'Needs internet'; paintStatus(); return restart(8000); }
    window.S1_ROOM().then(function (room) {
      if (!room) { status = 'No internet - retrying...'; paintStatus(); return restart(8000); }
      peer = new Peer(room, { debug: 0 });
      peer.on('open', function () { status = 'Waiting for the remote...'; paintStatus(); });
      peer.on('connection', onConn);
      peer.on('disconnected', function () { status = 'Reconnecting...'; paintStatus(); setTimeout(function () { try { peer.reconnect(); } catch (e) {} }, 2000); });
      peer.on('error', function (err) {
        if (err && err.type === 'peer-unavailable') return;
        /* 'unavailable-id' = the relay still holds our previous session (quick refresh): just retry */
        status = (err && err.type === 'unavailable-id') ? 'Reconnecting...' : 'Offline - retrying...'; paintStatus(); restart(5000);
      });
    });
  }

  /* ---------- tiny status text + auto fullscreen/unmute on first touch ---------- */
  function ready() {
    box = document.createElement('div'); box.id = 's1status';
    box.style.cssText = 'position:fixed;right:14px;bottom:12px;z-index:50;color:#fff;background:#0007;font:600 12px Arial;padding:5px 10px;border-radius:12px;opacity:.55;pointer-events:none';
    document.body.appendChild(box); paintStatus();
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
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
