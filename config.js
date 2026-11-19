/* S1 TV - home settings (edit this one file, nothing else needs to change).

   HOME_NAME  - optional. A private name for YOUR house, e.g. 'kumar-house-4821'.
                The TV page and the remote page that use the same name find each other automatically,
                from the same Wi-Fi or from anywhere on the internet. Leave it '' to rely on the
                TV's QR code (scan it once; the phone remembers the TV afterwards).

   TURN       - optional, for the most reliable connection from OUTSIDE the house (mobile data, other Wi-Fi).
                The app already uses a free shared relay server automatically; if you want your own
                (for example a free account at metered.ca / a Twilio / Cloudflare TURN), fill it in like:
                  TURN: { urls: ['turn:your.server:3478', 'turns:your.server:443?transport=tcp'], username: '...', credential: '...' }

   The phone and the TV always try the fastest route first (same Wi-Fi, direct) and switch to the
   internet relay by themselves when that is not possible. Nothing to choose, nothing shown.
*/
window.S1_CONFIG = { HOME_NAME: '', TURN: null };

(function () {
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  function clean(x) { return String(x || '').toLowerCase().replace(/[^a-z0-9-]/g, ''); }

  /* Connection servers shared by TV and phone: same Wi-Fi goes direct; otherwise STUN, then the internet relay. */
  window.S1_ICE = function () {
    var servers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: ['stun:stun.cloudflare.com:3478', 'stun:global.stun.twilio.com:3478'] },
      { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' }
    ];
    var t = window.S1_CONFIG && S1_CONFIG.TURN;
    if (t && t.urls) servers.push({ urls: t.urls, username: t.username || '', credential: t.credential || '' });
    return { iceServers: servers, sdpSemantics: 'unified-plan' };
  };

  function homeRoom() { var n = clean(window.S1_CONFIG && S1_CONFIG.HOME_NAME); return n ? 's1iptv-n-' + n : ''; }

  /* room based on this connection's public internet address (same Wi-Fi => same room) */
  function ipRoom() {
    var ip = Promise.race([
      fetch('https://api.ipify.org?format=json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { return String(d.ip || ''); }),
      new Promise(function (res) { setTimeout(function () { res(''); }, 5000); })
    ]).catch(function () { return ''; });
    return ip.then(function (addr) {
      if (!addr) return '';
      var bytes = new TextEncoder().encode('s1-home|' + addr);
      if (window.crypto && crypto.subtle) {
        return crypto.subtle.digest('SHA-256', bytes).then(function (b) {
          return 's1iptv-ip-' + Array.from(new Uint8Array(b)).slice(0, 10).map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
        });
      }
      var h = 5381; for (var i = 0; i < bytes.length; i++) h = ((h * 33) ^ bytes[i]) >>> 0;
      return 's1iptv-ip-' + h.toString(16);
    });
  }

  /* TV page: its room is the home name if set, otherwise the Wi-Fi's public address */
  window.S1_ROOM = function () { var h = homeRoom(); return h ? Promise.resolve(h) : ipRoom(); };

  /* Phone remote: rooms to try, best first. The first that has a TV in it wins.
       1. the room in the TV's QR link (remote.html?r=...)  - works from anywhere
       2. the home name from this file
       3. the TV the phone remembers from the last QR scan   - works from anywhere
       4. the Wi-Fi's public address                          - same-Wi-Fi auto find, no scan needed (also remembered)
     keep = remember this room after it connects. */
  window.S1_ROOM_CANDIDATES = function () {
    var list = [], seen = {};
    function add(get, keep, key) { if (key && seen[key]) return; if (key) seen[key] = 1; list.push({ get: get, keep: keep }); }
    var q = ''; try { q = clean(new URLSearchParams(location.search).get('r')); } catch (e) {}
    if (q) add(function () { return Promise.resolve('s1iptv-' + q); }, true, q);
    var h = homeRoom(); if (h) add(function () { return Promise.resolve(h); }, false, h);
    var saved = clean(store('s1_room')); if (saved) add(function () { return Promise.resolve('s1iptv-' + saved); }, true, saved);
    add(ipRoom, true, '');
    return list;
  };
})();
