/* S1 IPTV - web edition, phone remote side.
   Replaces the old "talk to the PC's Python host" requests with messages to the TV page, over a
   direct peer link. No QR code / typing: it finds the TV automatically (room from config.js). */
(function () {
  'use strict';
  var realFetch = window.fetch.bind(window);
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }

  /* The TV's QR link carries the PIN after the # (remote.html#p=123456): remember it and tidy the address bar. */
  try {
    var hm = String(location.hash || '').match(/[#&]p=(\d{4,8})/);
    if (hm) { store('s1_pin', hm[1]); history.replaceState(null, '', location.pathname + location.search); }
  } catch (e) {}
  try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js'); } catch (e) {}   /* lets the remote be installed as an app */

  var room = '', ovKind = '';

  var peer = null, conn = null, connected = false, waiters = [], pending = {}, seq = 0, attempt = 0, timer = 0, retryT = 0;
  var cands = [], ci = 0, keepRoom = false, fails = 0;

  /* ---------- UI: status + messages ---------- */
  var css = document.createElement('style');
  css.textContent =
    '#s1bar{position:fixed;left:0;right:0;top:0;z-index:60;display:flex;gap:8px;align-items:center;justify-content:center;padding:max(6px,env(safe-area-inset-top)) 12px 6px;background:#1b2740;color:#cfe0ff;font:600 12px system-ui,Arial;text-align:center}' +
    '#s1bar button{background:none;border:0;color:#9fb4e8;font-size:16px;padding:0 4px}' +
    '#s1ov{position:fixed;inset:0;z-index:70;background:#0a0d14ee;display:none;align-items:center;justify-content:center;padding:22px;text-align:center}' +
    '#s1ov .card{max-width:330px;background:#1e2331;border:1px solid #2c3448;border-radius:22px;padding:24px 20px;box-shadow:0 18px 50px #000a}' +
    '#s1ov h2{margin:6px 0 10px;font:800 19px system-ui,Arial}#s1ov p{margin:8px 0;color:#b8c2dd;font:14px/1.5 system-ui,Arial}' +
    '#s1ov .ico{font-size:40px}#s1ov .wifi{background:#0c1a14;border:1px solid #22382c;color:#9fe8c0;border-radius:12px;padding:10px;font-weight:700}' +
    '#s1ov button,#s1ov input{font:700 15px system-ui,Arial;border-radius:12px;border:1px solid #3a4360;padding:12px 16px;margin-top:10px;width:100%}' +
    '#s1ov button{background:#1769ff;color:#fff;border:0;cursor:pointer}#s1ov button.alt{background:#272d3f;border:1px solid #3a4360;color:#e8edf8}' +
    '#s1ov input{background:#0f131d;color:#fff;text-align:center;letter-spacing:.2em;text-transform:uppercase;-webkit-user-select:text;user-select:text}' +
    'body{padding-top:44px!important}';
  document.head.appendChild(css);

  var bar, ov, barTxt;
  function ui() {
    bar = document.createElement('div'); bar.id = 's1bar';
    bar.innerHTML = '<span id="s1bt"></span><button id="s1bx" aria-label="Hide">\u00D7</button>';
    document.body.appendChild(bar); barTxt = bar.querySelector('#s1bt');
    bar.querySelector('#s1bx').onclick = function () { bar.style.display = 'none'; };
    ov = document.createElement('div'); ov.id = 's1ov'; document.body.appendChild(ov);
  }
  function overlay(html, kind) { ov.innerHTML = '<div class="card">' + html + '</div>'; ov.style.display = 'flex'; ovKind = kind || ''; }
  function hideOverlay() { ov.style.display = 'none'; ovKind = ''; }

  function showConnecting() {
    overlay('<div class="ico">\uD83D\uDCF6</div><h2>Connecting to the TV\u2026</h2><p>Make sure the TV page is open.</p>', 'conn');
  }
  var PIN_INPUT = '<input id="s1pn" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="PIN" autocomplete="off">';
  /* typing the PIN: save it and start looking again (the PIN is also the TV's address, so it finds the TV from anywhere) */
  function wirePin() {
    var inp = ov.querySelector('#s1pn'), btn = ov.querySelector('#s1pb');
    var go = function () {
      var v = String(inp.value || '').replace(/\D/g, '');
      if (v.length < 4) { inp.focus(); return; }
      store('s1_pin', v); attempt = 0; showConnecting(); connect();
    };
    btn.onclick = go;
    inp.onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }
  function showNoTv(why) {
    if (ovKind === 'notv' && ov.style.display === 'flex') return;   /* already showing: don't wipe what is being typed */
    overlay('<div class="ico">\uD83D\uDCFA</div><h2>Can\u2019t find the TV</h2>' +
      '<p>' + (why === 'noip' ? 'No internet connection.' : 'Open the TV page on the TV / computer and make sure it is online.') + ' Trying again automatically\u2026</p>' +
      '<p>Or type the PIN shown on the TV:</p>' + PIN_INPUT +
      '<button id="s1pb">CONNECT WITH PIN</button><button class="alt" id="s1re">TRY NOW</button>', 'notv');
    ov.querySelector('#s1re').onclick = function () { attempt = 0; connect(); };
    wirePin();
  }
  function showPin(bad, lockedSecs) {
    var msg = lockedSecs ? 'Too many wrong tries. Wait ' + lockedSecs + ' seconds, then try again.' :
      bad ? 'That PIN is not right (it may have been changed on the TV). Try again.' : 'Type the PIN shown on the TV screen.';
    overlay('<div class="ico">\uD83D\uDD12</div><h2>Enter PIN</h2><p>' + msg + '</p>' + PIN_INPUT + '<button id="s1pb">UNLOCK</button>', 'pin');
    wirePin();
    var i = ov.querySelector('#s1pn'); if (i) try { i.focus(); } catch (e) {}
  }
  function setBar(t) { if (barTxt) barTxt.textContent = t; }

  /* ---------- link ---------- */
  function setConnected(on) {
    connected = on;
    var led = document.getElementById('led'); if (led) led.classList.toggle('on', on);
    setBar(on ? '\u25CF connected' : '');
    if (on) { var w = waiters; waiters = []; w.forEach(function (f) { f(); }); }
  }
  function fail(reason) {
    setConnected(false); clearTimeout(timer); clearTimeout(retryT);
    try { if (peer) peer.destroy(); } catch (e) {}
    showNoTv(reason);
    retryT = setTimeout(function () { if (!connected) connect(); }, 4000);   /* keep looking: the TV may be opened later */
  }
  function connect() {
    clearTimeout(timer); clearTimeout(retryT); setConnected(false);
    if (!ov.style.display || ov.style.display === 'none') showConnecting();
    try { if (peer) peer.destroy(); } catch (e) {}
    if (!window.Peer) { overlay('<div class="ico">\u26A0\uFE0F</div><h2>Needs internet</h2><p>The link library could not be loaded.</p><button onclick="location.reload()">RELOAD</button>'); return; }
    var myAttempt = ++attempt;
    cands = window.S1_ROOM_CANDIDATES(); ci = 0; fails = 0;
    /* generous: a connection that has to go round through the internet relay takes a few seconds longer */
    timer = setTimeout(function () { if (!connected && myAttempt === attempt) fail('notv'); }, 25000);
    peer = new Peer({ debug: 0, config: window.S1_ICE() });
    peer.on('open', function () { dial(myAttempt); });
    peer.on('error', function (err) {
      if (myAttempt !== attempt) return;
      if (err && err.type === 'peer-unavailable') { ci++; return dial(myAttempt); }   /* no TV in that room: try the next one */
      if (!connected) fail('notv');
    });
    peer.on('disconnected', function () { try { peer.reconnect(); } catch (e) {} });
  }
  function dial(myAttempt) {
    if (myAttempt !== attempt || connected) return;
    var c = cands[ci];
    if (!c) return fail('notv');
    c.get().then(function (r) {
      if (myAttempt !== attempt || connected) return;
      if (!r) { ci++; return cands[ci] ? dial(myAttempt) : fail('noip'); }
      room = r; keepRoom = !!c.keep;
      var cn = peer.connect(room, { reliable: true, serialization: 'json' });
      conn = cn;
      cn.on('open', function () { cn.send({ t: 'hello', pin: store('s1_pin') || '' }); });
      cn.on('data', onData);
      cn.on('close', function () { if (connected && cn === conn) { setConnected(false); showConnecting(); setTimeout(function () { if (!connected && myAttempt === attempt) connect(); }, 1500); } });
      cn.on('error', function () {});
    });
  }
  function onData(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'need_pin' || m.t === 'locked') {
      clearTimeout(timer); clearTimeout(retryT);          /* stop retrying: wait for the person to type the PIN */
      if (m.t === 'need_pin' && m.bad) store('s1_pin', null);
      showPin(m.t === 'need_pin' && !!m.bad, m.t === 'locked' ? m.secs : 0);
      return;
    }
    if (m.t === 'welcome') {
      clearTimeout(timer); hideOverlay(); setConnected(true);
      if (keepRoom && room) store('s1_room', room.replace(/^s1iptv-/, ''));   /* remember this TV: next time it works from anywhere */
      if (typeof window.loadChannels === 'function') window.loadChannels();
      if (typeof window.poll === 'function') window.poll();
      return;
    }
    if (m.t === 'res') fails = 0;
    if (m.t === 'res' && pending[m.id]) { var p = pending[m.id]; delete pending[m.id]; clearTimeout(p.t); p.ok(m); }
  }

  /* ---------- the page's own fetch('/api/...') calls now go to the TV ---------- */
  function rpc(method, path, body) {
    return new Promise(function (resolve, reject) {
      var send = function () {
        var id = ++seq, t = setTimeout(function () { delete pending[id]; reject(new Error('timeout')); if (connected && ++fails >= 2) { fails = 0; setConnected(false); showConnecting(); connect(); } }, 6000);
        pending[id] = { t: t, ok: resolve };
        try { conn.send({ t: 'rpc', id: id, method: method, path: path, body: body }); } catch (e) { clearTimeout(t); delete pending[id]; reject(e); }
      };
      if (connected) return send();
      waiters.push(send); setTimeout(function () { var i = waiters.indexOf(send); if (i >= 0) { waiters.splice(i, 1); reject(new Error('offline')); } }, 8000);
    });
  }
  window.fetch = function (input, init) {
    var u = typeof input === 'string' ? input : (input && input.url) || '';
    if (u.indexOf('/api/') !== 0) return realFetch(input, init);
    var method = ((init && init.method) || 'GET').toUpperCase(), body = null;
    try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) {}
    return rpc(method, u, body).then(function (m) { return new Response(JSON.stringify(m.data), { status: m.status, headers: { 'Content-Type': 'application/json' } }); });
  };

  function ready() { ui(); connect(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
