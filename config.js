/* S1 TV - home settings (edit this one file, nothing else needs to change).

   HOME_NAME  - optional. A private name for YOUR house, e.g. 'kumar-house-4821'.
                The TV page and the remote page that use the same name find each other automatically.
                Leave it '' to pair automatically by Wi-Fi instead (TV and phone must be on the same
                home internet connection). If two houses ever clash on that, set a HOME_NAME.
*/
window.S1_CONFIG = { HOME_NAME: '' };

/* Shared by tv (index.html) and remote (remote.html): works out the "room" both sides meet in. */
window.S1_ROOM = function () {
  /* Opened from the TV's QR code (remote.html?r=...): use exactly that room, no guessing from the internet address. */
  try {
    var r = new URLSearchParams(location.search).get('r');
    r = String(r || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (r) return Promise.resolve('s1iptv-' + r);
  } catch (e) {}
  var name = String((window.S1_CONFIG && S1_CONFIG.HOME_NAME) || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (name) return Promise.resolve('s1iptv-n-' + name);
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
};
