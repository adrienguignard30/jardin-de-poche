// =============================================================================================
//  BUGS : chaque erreur du jeu part toute seule vers le tableau de bord (page /tableau/), sans rien montrer au joueur.
//  Chaque erreur part avec l'identifiant de session (sessionStorage 'jdp.session', posé par suivi.ts) pour retrouver le visiteur.
//  Au plus 10 erreurs différentes par visite, chacune une seule fois. Si la base ne répond pas, on n'insiste pas :
//  le signalement ne peut jamais gêner le jeu.
// =============================================================================================
import { sb } from './enligne';

const envoyees = new Set<string>();
const BRUIT = /ResizeObserver loop|^Script error\.?$/i;   // messages du navigateur sans intérêt

/** « iPhone · Safari · 390×844 » : de quoi retrouver l'appareil, sans rien de personnel. */
export function appareil(): string {
  const ua = navigator.userAgent;
  const sys = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'autre';
  const nav = /SamsungBrowser/.test(ua) ? 'Samsung' : /Edg\//.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'autre';
  return `${sys} · ${nav} · ${screen.width}×${screen.height}`;
}

export function signalerBug(texte: string) {
  try {
    if (!sb || envoyees.size >= 10) return;
    const [premiere, ...reste] = String(texte).split('\n');
    const message = premiere.trim().slice(0, 500);
    if (!message || BRUIT.test(message) || envoyees.has(message)) return;
    envoyees.add(message);
    const perso = (window as any).__jdp?.state?.character;
    let session: string | null = null; try { session = sessionStorage.getItem('jdp.session'); } catch { /* ignore */ }
    if (session && !/^[0-9a-f-]{36}$/.test(session)) session = null;
    sb.rpc('signaler_bug', {
      p_message: message,
      p_pile: reste.join('\n').slice(0, 1500) || null,
      p_appareil: appareil(),
      p_page: location.pathname + (new URLSearchParams(location.search).has('demo') ? '?demo=1' : ''),
      p_perso: typeof perso === 'string' ? perso : null,
      p_session: session,
    }).then(() => undefined, () => undefined);
  } catch { /* le signalement ne doit jamais créer d'erreur lui-même */ }
}
