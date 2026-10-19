// Suivi des pages hors jeu (vidéo, démo, pitch, carte, AR) : même signal que le jeu, toutes les 30 s, vers /api/presence.
// Compte seulement le temps où la page est visible (et, pour une vidéo, seulement pendant la lecture).
// Jamais rien de montré au visiteur ; jamais d'erreur qui remonte ; rien d'envoyé en local.
(function () {
  try {
    if (/^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.)/.test(location.hostname)) return;
    var PAGE = (document.documentElement.getAttribute('data-suivi') || location.pathname).slice(0, 80);
    var CLE = 'jdp.session.' + PAGE, session = '';
    try { var s = sessionStorage.getItem(CLE); if (s && /^[0-9a-f-]{36}$/.test(s)) session = s; } catch (e) {}
    if (!session) {
      session = (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
      try { sessionStorage.setItem(CLE, session); } catch (e) {}
    }
    function appareil() {
      var ua = navigator.userAgent;
      var sys = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
        : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'autre';
      var nav = /SamsungBrowser/.test(ua) ? 'Samsung' : /Edg\//.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox'
        : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'autre';
      return sys + ' · ' + nav + ' · ' + screen.width + '×' + screen.height;
    }
    // actif = visible, et (si la page le précise) en lecture
    function enActivite() { try { if (window.JDP_SUIVI_ACTIF && !window.JDP_SUIVI_ACTIF()) return false; } catch (e) {} return document.visibilityState === 'visible'; }
    var depuis = enActivite() ? Date.now() : 0, dernierEnvoi = Date.now();
    function envoyer(final) {
      try {
        var maintenant = Date.now();
        var delta = depuis ? Math.min(120, Math.round((maintenant - depuis) / 1000)) : 0;
        depuis = enActivite() ? maintenant : 0; dernierEnvoi = maintenant;
        var corps = JSON.stringify({ session: session, delta: delta, page: PAGE, langue: (document.documentElement.lang || '').slice(0, 5) || null, appareil: appareil() });
        if (final && navigator.sendBeacon) { navigator.sendBeacon('/api/presence', new Blob([corps], { type: 'application/json' })); return; }
        fetch('/api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corps, keepalive: true }).catch(function () {});
      } catch (e) {}
    }
    // changement d'état (lecture / pause / onglet caché) : on arrête ou reprend le compteur sans attendre
    window.JDP_SUIVI_MAJ = function () { try { if (enActivite()) { if (!depuis) depuis = Date.now(); } else if (depuis) envoyer(false); } catch (e) {} };
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') envoyer(true); else { depuis = enActivite() ? Date.now() : 0; if (Date.now() - dernierEnvoi > 30000) envoyer(false); } });
    window.addEventListener('pagehide', function () { envoyer(true); });
    setInterval(function () { envoyer(false); }, 30000);
    envoyer(false);
  } catch (e) {}
})();
