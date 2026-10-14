// =============================================================================================
//  SUIVI : pendant qu'on joue, le jeu envoie un petit signal toutes les 30 s à /api/presence (temps de jeu, personnage,
//  langue, appareil, temps de chargement, images par seconde). Le serveur y ajoute la ville et le pays.
//  Il surveille aussi quelques problèmes que les erreurs classiques ne voient pas : chargement raté d'un fichier,
//  écran figé, WebGL perdu, chargement trop long, FPS faibles. Rien n'est jamais montré au joueur,
//  et rien ici ne peut gêner le jeu : tout est dans des try/catch et des appels sans attente.
// =============================================================================================
import { sb } from './enligne';
import { signalerBug, appareil } from './bugs';

const CLE_SESSION = 'jdp.session';
let session = '';
let dernierEnvoi = 0, actifDepuis = 0, bootMs: number | null = null, dejaBoot = false;
let frames = 0, fpsDepuis = 0, fpsMoyen: number | null = null, fpsFaiblesDepuis = 0, fpsSignale = false;
let derniereFrame = 0, visibleDepuis = 0, aEteCache = false;

function idSession(): string {
  try {
    const s = sessionStorage.getItem(CLE_SESSION);
    if (s && /^[0-9a-f-]{36}$/.test(s)) return s;
  } catch { /* stockage indisponible */ }
  const n = (crypto as any).randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  try { sessionStorage.setItem(CLE_SESSION, n); } catch { /* ignore */ }
  return n;
}
export const sessionId = () => session;

function perso(): string | null { const p = (window as any).__jdp?.state?.character; return typeof p === 'string' ? p : null; }
function langue(): string | null { const l = document.documentElement.lang; return l ? l.slice(0, 5) : null; }
function page(): string { return location.pathname + (new URLSearchParams(location.search).has('demo') ? '?demo' : ''); }

async function joueur(): Promise<string | null> {
  try { if (!sb) return null; const { data } = await sb.auth.getSession(); return data.session?.user?.id ?? null; } catch { return null; }
}

/** Envoie un signal (avec le temps actif écoulé depuis le précédent). */
async function battement(final = false) {
  try {
    const maintenant = Date.now();
    const delta = actifDepuis ? Math.min(120, Math.round((maintenant - actifDepuis) / 1000)) : 0;
    actifDepuis = document.visibilityState === 'visible' ? maintenant : 0;
    dernierEnvoi = maintenant;
    const corps = JSON.stringify({ session, delta, perso: perso(), langue: langue(), appareil: appareil(), page: page(), boot: bootMs, fps: fpsMoyen, joueur: final ? null : await joueur() });
    if (final && navigator.sendBeacon) { navigator.sendBeacon('/api/presence', new Blob([corps], { type: 'application/json' })); return; }
    fetch('/api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corps, keepalive: true }).catch(() => undefined);
  } catch { /* jamais d'erreur depuis le suivi */ }
}

function surveillerImages() {
  const boucle = (t: number) => {
    try {
      if (derniereFrame && document.visibilityState === 'visible' && t - visibleDepuis > 2000) {
        const ecart = t - derniereFrame;
        if (ecart > 4000 && ecart < 60000) signalerBug(`Écran figé ${Math.round(ecart / 1000)} s (${perso() ?? 'accueil'})`);   // > 60 s : veille ou onglet mis en pause, pas un gel
      }
      derniereFrame = t; frames++;
      if (!fpsDepuis) fpsDepuis = t;
      if (t - fpsDepuis >= 10000) {
        const fps = Math.round(frames * 1000 / (t - fpsDepuis));
        fpsMoyen = fpsMoyen == null ? fps : Math.round((fpsMoyen * 3 + fps) / 4);
        if (document.visibilityState === 'visible' && perso() && t - visibleDepuis > 10000) {
          if (fps < 15) { if (!fpsFaiblesDepuis) fpsFaiblesDepuis = t; else if (t - fpsFaiblesDepuis > 30000 && !fpsSignale) { fpsSignale = true; signalerBug(`FPS faibles : ${fps} images/s pendant 30 s (${appareil()})`); } }
          else fpsFaiblesDepuis = 0;
        }
        frames = 0; fpsDepuis = t;
      }
    } catch { /* ignore */ }
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
}

function surveillerChargement() {
  const l = document.getElementById('loading'); if (!l) return;
  const fini = () => { if (dejaBoot) return; dejaBoot = true; bootMs = Math.round(performance.now()); if (aEteCache) bootMs = null; else if (bootMs > 25000) signalerBug(`Chargement lent : ${Math.round(bootMs / 1000)} s (${appareil()})`); battement(); };
  if (l.classList.contains('hidden')) { fini(); return; }
  new MutationObserver(() => { if (l.classList.contains('hidden')) fini(); }).observe(l, { attributes: true, attributeFilter: ['class'] });
  setTimeout(() => { if (!dejaBoot && !aEteCache && document.visibilityState === 'visible') signalerBug(`Chargement bloqué : toujours sur l'écran de chargement après 60 s (${appareil()})`); }, 60000);
}

export const EN_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.)/.test(location.hostname);

export function demarrerSuivi() {
  try {
    if (session || EN_LOCAL) return;                           // en local (npm run dev), rien n'est envoyé
    session = idSession();
    actifDepuis = document.visibilityState === 'visible' ? Date.now() : 0;
    // fichiers qui ne se chargent pas (modèles, images, sons) : l'événement error des éléments, en phase de capture
    window.addEventListener('error', e => {
      const cible = e.target as any;
      if (cible && cible !== window && (cible.src || cible.href)) signalerBug(`Chargement raté : ${String(cible.src || cible.href).slice(0, 200)}`);
    }, true);
    const canvas = document.getElementById('c');
    canvas?.addEventListener('webglcontextlost', () => signalerBug(`WebGL perdu (${appareil()})`));
    surveillerChargement();
    surveillerImages();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { aEteCache = true; battement(true); }
      else { visibleDepuis = performance.now(); derniereFrame = 0; frames = 0; fpsDepuis = 0; fpsFaiblesDepuis = 0; actifDepuis = Date.now(); if (Date.now() - dernierEnvoi > 30000) battement(); }
    });
    if (document.visibilityState !== 'visible') aEteCache = true;
    visibleDepuis = performance.now();
    window.addEventListener('pagehide', () => battement(true));
    setInterval(() => { if (document.visibilityState === 'visible') battement(); }, 30000);
    battement();
  } catch { /* le suivi ne doit jamais créer d'erreur lui-même */ }
}
