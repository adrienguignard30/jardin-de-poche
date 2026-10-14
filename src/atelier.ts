// =============================================================================================
//  L'ATELIER : le joueur entre un code à usage unique, décrit un objet de déco, Tripo le fabrique en 3D (1 à 3 minutes),
//  et l'objet arrive dans « Mes objets » (téléphone) pour être posé sur le balcon.
//  Tout ce qui touche à Tripo passe par le serveur (api/atelier.js). Ici : l'écran, la liste locale des objets, l'attente.
// =============================================================================================
import { lang } from './i18n';
import { sb } from './enligne';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface Objet { id: string; prompt: string; statut: 'en_cours' | 'pret' | 'echec'; progres: number; url?: string; image?: string; erreur?: string; cree: number }
const CLE = 'jdp.objets';
const T = {
  fr: { titre: 'Atelier', sous: 'Crée tes objets de déco', bientot: 'Bientôt : ton personnage jouable', carteObjet: 'Un objet de déco pour ton balcon', carteObjetTexte: 'Décris-le, Tripo le fabrique en 3D. Tu le retrouveras dans ton téléphone, appli Atelier, pour le poser sur ton balcon.', cartePerso: 'Ton personnage jouable', cartePersoTexte: 'Décris-le, il sera créé avec le même squelette que Léa, Marcel et Jimy, et jouable comme eux.', arrive: 'Arrive bientôt', code: 'Ton code', codeAide: 'Un code = un objet. Demande-le à Adrien.', decris: 'Décris ton objet', exemple: 'ex. : un nain de jardin pirate, un flamant rose en bois', creer: '✨ Créer', fabrique: 'Tripo fabrique ton objet…', patience: '1 à 3 minutes. Tu peux fermer, il t’attendra dans ton téléphone.', pret: 'Ton objet est prêt !', ouTrouver: 'Il est dans ton téléphone, appli Atelier : touche « Poser sur le balcon ».', placer: 'Poser sur le balcon', retirer: 'Retirer du balcon', voir: 'Voir ma création', fermer: 'Fermer', mesObjets: 'Mes objets', aucun: 'Aucun objet pour l’instant.', creerUn: '✨ Créer un objet', echec: 'La fabrication a échoué. Ton code a été rendu si Tripo n’a rien fait.', pose: 'Posé sur le balcon', e_code_inconnu: 'Ce code n’existe pas.', e_code_deja_utilise: 'Ce code a déjà servi.', e_texte_longueur: 'Décris ton objet en 3 à 120 caractères.', e_texte_interdit: 'Ce texte n’est pas accepté : décris un objet de déco (pas de personnes, ni d’armes).', e_pas_configure: 'L’Atelier n’est pas encore branché.', e_reseau: 'Pas de connexion. Réessaie.', e_tripo: 'Tripo n’a pas accepté la demande. Ton code est rendu, réessaie.', retrouverTitre: 'Déjà un code utilisé ?', retrouver: 'Retrouver mon objet', retrouverAide: 'Ton code est la clé de ton objet : tape-le sur n’importe quel téléphone pour le retrouver.', garde: 'Garde ta carte : avec ton code tu retrouveras ton objet sur un autre téléphone. Avec un compte, il te suit partout.', e_code_pas_utilise: 'Ce code n’a pas encore servi : crée ton objet avec.', scanner: '📷 Scanner le QR code', scanAide: 'Vise le QR code, le code se remplit tout seul.', scanErr: 'Caméra indisponible : tape le code à la main.', scanMauvais: 'Ce QR code n’est pas un code Atelier.', confTitre: 'On vérifie avant de lancer', confTexte: 'Tu vas créer :', confAvert: 'Un code = un objet. Une fois lancé, pas de retour en arrière.', modifier: 'Modifier', confirmer: '✨ Confirmer et créer', voir3d: 'Voir en 3D', capture: '📸 Capture', captureOk: 'Image enregistrée', chargement: 'Chargement de l’objet…', e_chargement: 'Impossible de charger l’objet.', tourner: 'Tourne avec le doigt · pince pour zoomer' },
  en: { titre: 'Workshop', sous: 'Create your decor objects', bientot: 'Coming soon: your playable character', carteObjet: 'A decor object for your balcony', carteObjetTexte: 'Describe it, Tripo builds it in 3D. You will find it in your phone, Workshop app, to place it on your balcony.', cartePerso: 'Your playable character', cartePersoTexte: 'Describe it: it will be built with the same skeleton as Léa, Marcel and Jimy, and playable like them.', arrive: 'Coming soon', code: 'Your code', codeAide: 'One code = one object. Ask Adrien.', decris: 'Describe your object', exemple: 'e.g. a pirate garden gnome, a wooden pink flamingo', creer: '✨ Create', fabrique: 'Tripo is building your object…', patience: '1 to 3 minutes. You can close this, it will wait in your phone.', pret: 'Your object is ready!', ouTrouver: 'It is in your phone, Workshop app: tap “Place on the balcony”.', placer: 'Place on the balcony', retirer: 'Remove from the balcony', voir: 'See my creation', fermer: 'Close', mesObjets: 'My objects', aucun: 'No object yet.', creerUn: '✨ Create an object', echec: 'Building failed. Your code was given back if Tripo did nothing.', pose: 'Placed on the balcony', e_code_inconnu: 'This code does not exist.', e_code_deja_utilise: 'This code was already used.', e_texte_longueur: 'Describe your object in 3 to 120 characters.', e_texte_interdit: 'This text is not accepted: describe a decor object (no people, no weapons).', e_pas_configure: 'The Workshop is not connected yet.', e_reseau: 'No connection. Try again.', e_tripo: 'Tripo refused the request. Your code is given back, try again.', retrouverTitre: 'Already used a code?', retrouver: 'Find my object', retrouverAide: 'Your code is the key to your object: type it on any phone to get it back.', garde: 'Keep your card: with your code you can get your object back on another phone. With an account, it follows you everywhere.', e_code_pas_utilise: 'This code has not been used yet: create your object with it.', scanner: '📷 Scan the QR code', scanAide: 'Point at the QR code, the code fills in by itself.', scanErr: 'Camera unavailable: type the code by hand.', scanMauvais: 'This QR code is not a Workshop code.', confTitre: 'Check before starting', confTexte: 'You are about to create:', confAvert: 'One code = one object. Once started, there is no going back.', modifier: 'Edit', confirmer: '✨ Confirm and create', voir3d: 'View in 3D', capture: '📸 Snapshot', captureOk: 'Image saved', chargement: 'Loading the object…', e_chargement: 'Could not load the object.', tourner: 'Drag to rotate · pinch to zoom' },
  es: { titre: 'Taller', sous: 'Crea tus objetos de decoración', bientot: 'Pronto: tu personaje jugable', carteObjet: 'Un objeto de decoración para tu balcón', carteObjetTexte: 'Descríbelo, Tripo lo fabrica en 3D. Lo encontrarás en tu teléfono, app Taller, para ponerlo en tu balcón.', cartePerso: 'Tu personaje jugable', cartePersoTexte: 'Descríbelo: se creará con el mismo esqueleto que Léa, Marcel y Jimy, y será jugable como ellos.', arrive: 'Pronto', code: 'Tu código', codeAide: 'Un código = un objeto. Pídeselo a Adrien.', decris: 'Describe tu objeto', exemple: 'ej.: un gnomo de jardín pirata, un flamenco rosa de madera', creer: '✨ Crear', fabrique: 'Tripo está fabricando tu objeto…', patience: '1 a 3 minutos. Puedes cerrar, te esperará en tu teléfono.', pret: '¡Tu objeto está listo!', ouTrouver: 'Está en tu teléfono, app Taller: toca «Poner en el balcón».', placer: 'Poner en el balcón', retirer: 'Quitar del balcón', voir: 'Ver mi creación', fermer: 'Cerrar', mesObjets: 'Mis objetos', aucun: 'Ningún objeto todavía.', creerUn: '✨ Crear un objeto', echec: 'La fabricación falló. Tu código se devolvió si Tripo no hizo nada.', pose: 'Puesto en el balcón', e_code_inconnu: 'Este código no existe.', e_code_deja_utilise: 'Este código ya se usó.', e_texte_longueur: 'Describe tu objeto en 3 a 120 caracteres.', e_texte_interdit: 'Este texto no se acepta: describe un objeto de decoración (sin personas ni armas).', e_pas_configure: 'El Taller aún no está conectado.', e_reseau: 'Sin conexión. Inténtalo de nuevo.', e_tripo: 'Tripo no aceptó la petición. Tu código se devuelve, inténtalo de nuevo.', retrouverTitre: '¿Ya usaste un código?', retrouver: 'Recuperar mi objeto', retrouverAide: 'Tu código es la llave de tu objeto: escríbelo en cualquier teléfono para recuperarlo.', garde: 'Guarda tu tarjeta: con tu código recuperarás tu objeto en otro teléfono. Con una cuenta, te sigue a todas partes.', e_code_pas_utilise: 'Este código aún no se ha usado: crea tu objeto con él.', scanner: '📷 Escanear el código QR', scanAide: 'Apunta al código QR, el código se rellena solo.', scanErr: 'Cámara no disponible: escribe el código a mano.', scanMauvais: 'Este código QR no es un código del Taller.', confTitre: 'Comprobamos antes de lanzar', confTexte: 'Vas a crear:', confAvert: 'Un código = un objeto. Una vez lanzado, no hay vuelta atrás.', modifier: 'Modificar', confirmer: '✨ Confirmar y crear', voir3d: 'Ver en 3D', capture: '📸 Captura', captureOk: 'Imagen guardada', chargement: 'Cargando el objeto…', e_chargement: 'No se pudo cargar el objeto.', tourner: 'Gira con el dedo · pellizca para ampliar' },
};
const tt = () => T[lang() as 'fr' | 'en' | 'es'] ?? T.fr;
const el = <K extends HTMLElement = HTMLElement>(tag: string, cls = '', texte?: string) => { const e = document.createElement(tag) as K; if (cls) e.className = cls; if (texte != null) e.textContent = texte; return e; };

// ---------- la liste locale des objets (ce téléphone / ce navigateur)
export function objets(): Objet[] { try { const l = JSON.parse(localStorage.getItem(CLE) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } }
function garder(l: Objet[]) { try { localStorage.setItem(CLE, JSON.stringify(l.slice(0, 30))); } catch { /* ignore */ } }
function majObjet(o: Partial<Objet> & { id: string }) { const l = objets(); const i = l.findIndex(x => x.id === o.id); if (i >= 0) l[i] = { ...l[i], ...o }; else l.unshift(o as Objet); garder(l); }

async function appel(corps: object): Promise<any> {
  const r = await fetch('/api/atelier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  let j: any = null; try { j = await r.json(); } catch { j = null; }
  if (!r.ok) throw new Error(j?.erreur || `http_${r.status}`);
  return j;
}
async function joueur(): Promise<string | null> { try { if (!sb) return null; const { data } = await sb.auth.getSession(); return data.session?.user?.id ?? null; } catch { return null; } }

/** Remet à jour les objets en cours (appelé par le téléphone et par l'attente). */
export async function rafraichir(): Promise<Objet[]> {
  const l = objets(); const enCours = l.filter(o => o.statut === 'en_cours').map(o => o.id);
  if (!enCours.length) return l;
  try {
    const j = await appel({ action: 'liste', ids: enCours });
    for (const c of j.creations ?? []) majObjet({ id: c.id, statut: c.statut, progres: c.progres ?? 0, url: c.url ?? undefined, image: c.image ?? undefined, erreur: c.erreur ?? undefined });
  } catch { /* on réessaiera */ }
  return objets();
}

// ---------- le style (une seule fois)
function style() {
  if (document.getElementById('atelierStyle')) return;
  const s = el('style'); s.id = 'atelierStyle';
  s.textContent = `
#atelier{position:fixed;inset:0;z-index:950;background:rgba(20,30,25,.55);display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto}
#atelier .at{width:min(560px,100%);max-height:calc(100vh - 28px);overflow:auto;background:#fffdf7;border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:18px 18px 20px;font:15px/1.4 Nunito,system-ui,sans-serif;color:#1e2a24;position:relative}
#atelier .atX{position:absolute;top:10px;right:10px;width:40px;height:40px;border:0;border-radius:50%;background:#eef1ea;font-size:18px;cursor:pointer}
#atelier h2{margin:4px 0 2px;font-size:24px}
#atelier .atSous{margin:0 0 14px;color:#4b5a52}
#atelier .atCarte{border:2px solid #dfe6dd;border-radius:16px;padding:14px;margin-bottom:12px;background:#fff}
#atelier .atCarte.off{opacity:.6;background:#f6f7f3}
#atelier .atCarte h3{margin:0 0 4px;font-size:17px}
#atelier .atCarte p{margin:0 0 10px;color:#4b5a52;font-size:14px}
#atelier .atBadge{display:inline-block;background:#ffe8a6;color:#6b4a00;font-weight:800;font-size:12px;padding:3px 10px;border-radius:99px;margin-bottom:6px}
#atelier label{display:block;font-weight:800;font-size:13px;margin:8px 0 4px}
#atelier input,#atelier textarea{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:10px 12px;border:2px solid #cfd8cc;border-radius:12px;background:#fff}
#atelier textarea{min-height:64px;resize:vertical}
#atelier .atAide{font-size:12px;color:#6b7770;margin-top:3px}
#atelier .atBtn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border:0;border-radius:14px;background:#3f9a3a;color:#fff;font:800 16px Nunito,system-ui,sans-serif;cursor:pointer;margin-top:12px}
#atelier .atBtn:disabled{opacity:.5;cursor:default}
#atelier .atBtn.sec{background:#eef1ea;color:#1e2a24}
#atelier .atErr{color:#b3261e;font-weight:700;margin-top:8px;min-height:1.2em}
#atelier .atConf{border:2px solid #ffd34d;background:#fff8e1;border-radius:14px;padding:12px 14px;margin-top:10px}
#atelier .atConf blockquote{margin:6px 0 8px;padding:8px 12px;background:#fff;border-left:4px solid #3f9a3a;border-radius:8px;font-weight:800;font-size:17px;word-break:break-word}
#atelier .atConf .atAvert{color:#8a5a00;font-weight:700;font-size:13px}
#atelier .atBarre{height:10px;background:#e6ebe3;border-radius:99px;overflow:hidden;margin:10px 0 6px}
#atelier .atBarre i{display:block;height:100%;width:0;background:#3f9a3a;transition:width .6s}
#atelier .atImg{width:100%;max-height:260px;object-fit:contain;border-radius:12px;background:#f3f5f0;margin-top:8px}
#atelier .atObj{display:flex;gap:10px;align-items:center;border-top:1px solid #e6ebe3;padding:8px 0}
#atelier .atObj img,#atelier .atObj .ph{width:56px;height:56px;border-radius:10px;object-fit:cover;background:#eef1ea;flex:none;display:grid;place-items:center;font-size:22px}
#atelier .atObj .n{flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#atelier .atObj small{display:block;font-weight:400;color:#6b7770}
#vue3d{position:fixed;inset:0;z-index:970;background:#0f1713;display:flex;flex-direction:column;font:15px Nunito,system-ui,sans-serif;color:#fff}
#vue3d canvas{flex:1;width:100%;height:100%;display:block;touch-action:none}
#vue3d .v3Haut{position:absolute;top:0;left:0;right:0;padding:12px 14px;display:flex;align-items:center;gap:10px;background:linear-gradient(rgba(0,0,0,.55),transparent)}
#vue3d .v3Haut .n{flex:1;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#vue3d .v3Bas{position:absolute;bottom:0;left:0;right:0;padding:14px;display:flex;gap:10px;justify-content:center;align-items:center;background:linear-gradient(transparent,rgba(0,0,0,.6))}
#vue3d button{border:0;border-radius:14px;padding:12px 16px;font:800 15px Nunito,system-ui,sans-serif;cursor:pointer;background:rgba(255,255,255,.14);color:#fff;min-height:46px}
#vue3d button.principal{background:#3f9a3a}
#vue3d .v3Aide{position:absolute;bottom:76px;left:0;right:0;text-align:center;font-size:12.5px;opacity:.8}
#vue3d .v3Msg{position:absolute;inset:0;display:grid;place-items:center;font-weight:800;pointer-events:none}
.telObjets .atObj img,.telObjets .atObj .ph{cursor:pointer}
#atelier .atScan{position:fixed;inset:0;z-index:5;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center}
#atelier .atScan video{width:100%;max-height:70vh;object-fit:cover}
#atelier .atScan p{color:#fff;font-weight:700;margin:12px;text-align:center}
#atelier .atScan .atBtn{margin:0 0 20px}
.btnAtelierAccueil{display:block;width:min(360px,100%);margin:6px auto 2px;padding:12px 16px;border:0;border-radius:16px;background:linear-gradient(135deg,#ffd34d,#ff8fab);color:#3a2a00;font:800 16px/1.2 Nunito,system-ui,sans-serif;box-shadow:0 8px 24px rgba(255,150,80,.35);cursor:pointer;text-align:center}
.btnAtelierAccueil small{display:block;font-weight:700;font-size:12px;opacity:.85;margin-top:3px}
.telObjets .atObj{display:flex;gap:10px;align-items:center;border-bottom:1px solid #e6ebe3;padding:8px 0}
.telObjets .atObj img,.telObjets .atObj .ph{width:54px;height:54px;border-radius:10px;object-fit:cover;background:#eef1ea;flex:none;display:grid;place-items:center;font-size:22px}
.telObjets .atObj .n{flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.telObjets .atObj small{display:block;font-weight:400;color:#6b7770}
.telObjets .atObj button{font:800 13px Nunito,system-ui,sans-serif;padding:8px 10px;border:0;border-radius:10px;background:#3f9a3a;color:#fff;cursor:pointer}
.telObjets .atObj button.sec{background:#eef1ea;color:#1e2a24}
.telObjets .atBarre{height:8px;background:#e6ebe3;border-radius:99px;overflow:hidden;margin-top:6px}
.telObjets .atBarre i{display:block;height:100%;background:#3f9a3a}`;
  document.head.appendChild(s);
}

const CLE_CODE = 'jdp.codeAtelier';
let codeLienTraite = false;
/** Le code reçu par le lien du QR code (?code=POTAGER-XXXX) : gardé dans le téléphone, pré-rempli dans l'Atelier. */
function codeDuLien(): string | null {
  try {
    const u = new URL(location.href); const c = (u.searchParams.get('code') || '').trim().toUpperCase();
    if (/^[A-Z0-9-]{6,24}$/.test(c)) {
      localStorage.setItem(CLE_CODE, c);
      u.searchParams.delete('code'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);   // le code reste dans le téléphone, pas dans l'adresse
      return c;
    }
    return localStorage.getItem(CLE_CODE) || null;
  } catch { return null; }
}
function oublierCode() { try { localStorage.removeItem(CLE_CODE); } catch { /* ignore */ } }

/** Le bouton mis en avant à l'accueil. */
export function boutonAtelierAccueil(): HTMLButtonElement {
  style();
  const x = tt();
  const b = el<HTMLButtonElement>('button', 'btnAtelierAccueil'); b.type = 'button';
  b.append(`✨ ${x.sous}`, el('small', '', x.bientot));
  b.onclick = () => ouvrirAtelier();
  if (!codeLienTraite) {   // arrivée par un QR code : on ouvre l'Atelier tout de suite, le code déjà écrit
    codeLienTraite = true;
    let parLien = false; try { parLien = new URL(location.href).searchParams.has('code'); } catch { /* ignore */ }
    const c = codeDuLien();
    if (c && parLien) setTimeout(() => ouvrirAtelier(), 400);
  }
  return b;
}

let surPret: ((o: Objet) => void) | null = null;
/** Quand un objet est prêt (pour que le téléphone se rafraîchisse). */
export function quandPret(f: (o: Objet) => void) { surPret = f; }

/** Le décodeur QR (public/jsqr.js, chargé seulement quand on scanne). */
function chargerJsQR(): Promise<(d: Uint8ClampedArray, w: number, h: number, o?: any) => { data: string } | null> {
  return new Promise((ok, ko) => {
    const w = window as any; if (w.jsQR) { ok(w.jsQR); return; }
    const sc = document.createElement('script'); sc.src = 'jsqr.js'; sc.onload = () => w.jsQR ? ok(w.jsQR) : ko(new Error('jsqr')); sc.onerror = () => ko(new Error('jsqr')); document.head.appendChild(sc);
  });
}
/** Lit un code Atelier dans le texte d'un QR : le lien du tableau (…?code=POTAGER-XXXX) ou le code tout seul. */
function codeDansQr(texte: string): string | null {
  try { const u = new URL(texte); const c = (u.searchParams.get('code') || '').toUpperCase(); if (/^[A-Z0-9-]{6,24}$/.test(c)) return c; } catch { /* pas un lien */ }
  const t = texte.trim().toUpperCase(); return /^[A-Z0-9-]{6,24}$/.test(t) ? t : null;
}
/** Ouvre la caméra dans l'Atelier et appelle quandLu(code) dès qu'un QR code Atelier est vu. */
async function scannerQr(conteneur: HTMLElement, quandLu: (code: string) => void, erreur: (msg: string) => void) {
  const x = tt();
  if (!navigator.mediaDevices?.getUserMedia) { erreur(x.scanErr); return; }
  let flux: MediaStream | null = null, actif = true;
  const zone = el('div', 'atScan'); const video = el<HTMLVideoElement>('video'); video.setAttribute('playsinline', ''); video.muted = true;
  const aide = el('p', '', x.scanAide); const annuler = el<HTMLButtonElement>('button', 'atBtn sec', x.fermer); annuler.type = 'button';
  zone.append(video, aide, annuler); conteneur.appendChild(zone);
  const fermer = () => { actif = false; flux?.getTracks().forEach(t => t.stop()); zone.remove(); };
  annuler.onclick = fermer;
  try {
    const [jsQR, f] = await Promise.all([chargerJsQR(), navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })]);
    flux = f; video.srcObject = f; await video.play();
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    let dernierMauvais = 0;
    const tick = () => {
      if (!actif) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const w = Math.min(640, video.videoWidth), h = Math.round(video.videoHeight * w / video.videoWidth);
        canvas.width = w; canvas.height = h; ctx.drawImage(video, 0, 0, w, h);
        const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (r?.data) {
          const c = codeDansQr(r.data);
          if (c) { fermer(); quandLu(c); return; }
          if (Date.now() - dernierMauvais > 2000) { dernierMauvais = Date.now(); aide.textContent = x.scanMauvais; }
        }
      }
      setTimeout(tick, 120);
    };
    tick();
  } catch { fermer(); erreur(x.scanErr); }
}

/** L'écran de l'Atelier (par-dessus l'accueil ou le jeu). */
export function ouvrirAtelier(mode: 'creer' | 'retrouver' = 'creer') {
  style();
  if (document.getElementById('atelier')) return;
  const x = tt();
  const fond = el('div'); fond.id = 'atelier'; fond.setAttribute('role', 'dialog'); fond.setAttribute('aria-modal', 'true'); fond.setAttribute('aria-label', x.titre);
  const at = el('div', 'at'); fond.appendChild(at);
  const X = el<HTMLButtonElement>('button', 'atX', '✕'); X.type = 'button'; X.setAttribute('aria-label', x.fermer); X.onclick = fermer; at.appendChild(X);
  at.appendChild(el('h2', '', `✨ ${x.titre}`)); at.appendChild(el('p', 'atSous', x.sous));
  let minuterie = 0;
  function fermer() { clearInterval(minuterie); fond.remove(); }
  fond.addEventListener('click', e => { if (e.target === fond) fermer(); });

  // carte 1 : l'objet
  const c1 = el('div', 'atCarte'); at.appendChild(c1);
  c1.appendChild(el('h3', '', `🪴 ${x.carteObjet}`)); c1.appendChild(el('p', '', x.carteObjetTexte));
  const form = el('div'); c1.appendChild(form);
  const lCode = el('label', '', x.code); const iCode = el<HTMLInputElement>('input'); iCode.placeholder = 'POTAGER-XXXX'; iCode.autocapitalize = 'characters'; iCode.autocomplete = 'off'; iCode.maxLength = 24;
  const codeGarde = codeDuLien(); if (codeGarde) iCode.value = codeGarde;
  const lTxt = el('label', '', x.decris); const iTxt = el<HTMLTextAreaElement>('textarea'); iTxt.placeholder = x.exemple; iTxt.maxLength = 120;
  const go = el<HTMLButtonElement>('button', 'atBtn', x.creer); go.type = 'button'; go.disabled = true;
  const err = el('div', 'atErr'); err.setAttribute('role', 'alert');
  const pret = () => /^[A-Z0-9-]{6,24}$/.test(iCode.value.trim().toUpperCase()) && iTxt.value.trim().length >= 3;
  const majGo = () => { go.disabled = !pret(); };
  iCode.addEventListener('input', majGo); iTxt.addEventListener('input', majGo); majGo();
  const bScan = el<HTMLButtonElement>('button', 'atBtn sec', x.scanner); bScan.type = 'button'; bScan.style.marginTop = '6px';
  bScan.onclick = () => scannerQr(at, c => { iCode.value = c; err.textContent = ''; majGo(); iTxt.focus(); }, m => { err.textContent = m; });
  form.append(lCode, iCode, bScan, el('div', 'atAide', x.codeAide), lTxt, iTxt, go, err);
  const attente = el('div'); attente.hidden = true; c1.appendChild(attente);

  function montrerAttente(o: Objet) {
    form.hidden = true; attente.hidden = false; attente.replaceChildren();
    attente.appendChild(el('h3', '', x.fabrique)); attente.appendChild(el('p', '', x.patience));
    const barre = el('div', 'atBarre'); const i = el('i'); barre.appendChild(i); attente.appendChild(barre);
    const pct = el('div', 'atAide', `${o.progres} %`); attente.appendChild(pct);
    const f = el<HTMLButtonElement>('button', 'atBtn sec', x.fermer); f.type = 'button'; f.onclick = fermer; attente.appendChild(f);
    const tick = async () => {
      try {
        const e = await appel({ action: 'etat', id: o.id });
        majObjet({ id: o.id, statut: e.statut, progres: e.progres ?? 0, url: e.url ?? undefined, image: e.image ?? undefined, erreur: e.erreur ?? undefined });
        i.style.width = `${Math.max(4, e.progres ?? 0)}%`; pct.textContent = `${e.progres ?? 0} %`;
        if (e.statut === 'pret') { clearInterval(minuterie); montrerPret(objets().find(z => z.id === o.id)!); }
        if (e.statut === 'echec') { clearInterval(minuterie); attente.replaceChildren(el('h3', '', '😕'), el('p', '', x.echec), f); }
      } catch { /* réseau : on réessaie au prochain tick */ }
    };
    tick(); minuterie = window.setInterval(tick, 5000);
  }
  function montrerPret(o: Objet) {
    attente.replaceChildren();
    attente.appendChild(el('h3', '', `🎉 ${x.pret}`)); attente.appendChild(el('p', '', x.ouTrouver)); attente.appendChild(el('p', 'atAide', `🔑 ${x.garde}`));
    if (o.image) { const im = el<HTMLImageElement>('img', 'atImg'); im.src = o.image; im.alt = o.prompt; attente.appendChild(im); }
    const v3 = el<HTMLButtonElement>('button', 'atBtn', `🧊 ${x.voir3d}`); v3.type = 'button'; v3.onclick = () => voirEn3D(o); attente.appendChild(v3);
    const f = el<HTMLButtonElement>('button', 'atBtn sec', x.fermer); f.type = 'button'; f.style.marginLeft = '8px'; f.onclick = fermer; attente.appendChild(f);
    surPret?.(o);
  }
  let conf: HTMLElement | null = null;
  go.onclick = () => {
    err.textContent = ''; const code = iCode.value.trim().toUpperCase(), texte = iTxt.value.trim();
    if (!/^[A-Z0-9-]{6,24}$/.test(code)) { err.textContent = x.e_code_inconnu; return; }
    if (texte.length < 3) { err.textContent = x.e_texte_longueur; return; }
    conf?.remove();
    conf = el('div', 'atConf'); conf.setAttribute('role', 'alertdialog');
    conf.appendChild(el('h3', '', x.confTitre)); conf.appendChild(el('p', '', x.confTexte)); conf.appendChild(el('blockquote', '', `« ${texte} »`));
    conf.appendChild(el('p', 'atAvert', `⚠️ ${x.confAvert}`));
    const bMod = el<HTMLButtonElement>('button', 'atBtn sec', x.modifier); bMod.type = 'button'; bMod.onclick = () => { conf?.remove(); conf = null; go.style.display = ''; iTxt.focus(); };
    const bOk = el<HTMLButtonElement>('button', 'atBtn', x.confirmer); bOk.type = 'button'; bOk.style.marginLeft = '8px'; bOk.onclick = () => lancer(code, texte, bOk);
    conf.append(bMod, bOk); go.style.display = 'none'; form.appendChild(conf); conf.scrollIntoView({ block: 'nearest' });
  };
  const lancer = async (code: string, texte: string, bouton: HTMLButtonElement) => {
    bouton.disabled = true;
    try {
      const j = await appel({ action: 'creer', code, prompt: texte, langue: lang(), joueur: await joueur() });
      const o: Objet = { id: j.id, prompt: texte, statut: 'en_cours', progres: 0, cree: Date.now() };
      oublierCode(); majObjet(o); montrerAttente(o);
    } catch (e) {
      const k = `e_${(e as Error).message}` as keyof typeof x;
      err.textContent = (x as any)[k] ?? x.e_reseau;
      conf?.remove(); conf = null; go.style.display = ''; majGo();
    } finally { bouton.disabled = false; }
  };

  // retrouver un objet avec son code (autre téléphone, navigateur vidé)
  const cR = el('div', 'atCarte'); at.appendChild(cR);
  cR.appendChild(el('h3', '', `🔑 ${x.retrouverTitre}`)); cR.appendChild(el('p', '', x.retrouverAide));
  const iR = el<HTMLInputElement>('input'); iR.placeholder = 'POTAGER-XXXX'; iR.autocapitalize = 'characters'; iR.autocomplete = 'off'; iR.maxLength = 24; iR.setAttribute('aria-label', x.code);
  const bR = el<HTMLButtonElement>('button', 'atBtn sec', x.retrouver); bR.type = 'button';
  const errR = el('div', 'atErr'); errR.setAttribute('role', 'alert');
  const bScanR = el<HTMLButtonElement>('button', 'atBtn sec', x.scanner); bScanR.type = 'button'; bScanR.style.marginRight = '8px';
  bScanR.onclick = () => scannerQr(at, c => { iR.value = c; errR.textContent = ''; bR.click(); }, m => { errR.textContent = m; });
  cR.append(iR, bScanR, bR, errR);
  bR.onclick = async () => {
    errR.textContent = ''; const code = iR.value.trim().toUpperCase();
    if (!/^[A-Z0-9-]{6,24}$/.test(code)) { errR.textContent = x.e_code_inconnu; return; }
    bR.disabled = true;
    try {
      const e = await appel({ action: 'retrouver', code });
      const o: Objet = { id: e.id, prompt: e.prompt || '', statut: e.statut, progres: e.progres ?? 0, url: e.url ?? undefined, image: e.image ?? undefined, erreur: e.erreur ?? undefined, cree: Date.now() };
      majObjet(o); cR.hidden = true;
      if (o.statut === 'pret') { form.hidden = true; attente.hidden = false; montrerPret(o); } else if (o.statut === 'en_cours') montrerAttente(o); else { form.hidden = true; attente.hidden = false; attente.replaceChildren(el('h3', '', '😕'), el('p', '', x.echec)); }
    } catch (e) {
      const k = `e_${(e as Error).message}` as keyof typeof x;
      errR.textContent = (x as any)[k] ?? x.e_reseau;
    } finally { bR.disabled = false; }
  };

  // carte 2 : le personnage (bientôt)
  const c2 = el('div', 'atCarte off'); at.appendChild(c2);
  c2.appendChild(el('span', 'atBadge', x.arrive)); c2.appendChild(el('h3', '', `🧑‍🌾 ${x.cartePerso}`)); c2.appendChild(el('p', '', x.cartePersoTexte));

  // mes objets (rappel)
  const l = objets();
  if (l.length) {
    const c3 = el('div', 'atCarte'); at.appendChild(c3); c3.appendChild(el('h3', '', x.mesObjets));
    for (const o of l.slice(0, 5)) c3.appendChild(ligneObjet(o));
    const enCours = l.find(o => o.statut === 'en_cours'); if (enCours) { montrerAttente(enCours); }
  }
  document.body.appendChild(fond);
  setTimeout(() => (mode === 'retrouver' ? iR : iCode.value ? iTxt : iCode).focus(), 60);
  if (mode === 'retrouver') setTimeout(() => cR.scrollIntoView({ block: 'center' }), 80);
}

function ligneObjet(o: Objet, actions?: HTMLElement[]): HTMLElement {
  const x = tt();
  const d = el('div', 'atObj');
  if (o.image) { const im = el<HTMLImageElement>('img'); im.src = o.image; im.alt = ''; d.appendChild(im); } else d.appendChild(el('span', 'ph', o.statut === 'echec' ? '😕' : o.statut === 'en_cours' ? '⏳' : '🪴'));
  const n = el('div', 'n', o.prompt);
  if (o.statut === 'en_cours') { n.appendChild(el('small', '', `${x.fabrique} ${o.progres} %`)); const b = el('div', 'atBarre'); const i = el('i'); i.style.width = `${Math.max(4, o.progres)}%`; b.appendChild(i); n.appendChild(b); }
  else if (o.statut === 'echec') n.appendChild(el('small', '', x.echec));
  d.appendChild(n);
  for (const a of actions ?? []) d.appendChild(a);
  return d;
}

/** La visionneuse 3D d'un objet (comme dans Tripo) : tourner, zoomer, et 📸 pour garder une image (devient la vignette). */
export function voirEn3D(o: Objet) {
  style();
  if (!o.url || document.getElementById('vue3d')) return;
  const x = tt();
  const fond = el('div'); fond.id = 'vue3d'; fond.setAttribute('role', 'dialog'); fond.setAttribute('aria-label', x.voir3d);
  const canvas = el<HTMLCanvasElement>('canvas'); fond.appendChild(canvas);
  const haut = el('div', 'v3Haut'); const X = el<HTMLButtonElement>('button', '', '✕'); X.type = 'button'; X.setAttribute('aria-label', x.fermer);
  haut.append(X, el('div', 'n', o.prompt)); fond.appendChild(haut);
  const msg = el('div', 'v3Msg', x.chargement); fond.appendChild(msg);
  const aide = el('div', 'v3Aide', x.tourner); fond.appendChild(aide);
  const bas = el('div', 'v3Bas'); const bCap = el<HTMLButtonElement>('button', 'principal', x.capture); bCap.type = 'button'; bCap.disabled = true;
  const bFermer = el<HTMLButtonElement>('button', '', x.fermer); bFermer.type = 'button'; bas.append(bCap, bFermer); fond.appendChild(bas);
  document.body.appendChild(fond);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1b2a22);
  const camera = new THREE.PerspectiveCamera(40, 1, .01, 100); camera.position.set(0, .6, 2.4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7a6e, 1.1));
  const soleil = new THREE.DirectionalLight(0xffffff, 1.6); soleil.position.set(2, 3, 2); scene.add(soleil);
  const contre = new THREE.DirectionalLight(0xdde8ff, .6); contre.position.set(-2, 1, -2); scene.add(contre);
  const sol = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), new THREE.MeshStandardMaterial({ color: 0x24362c, roughness: 1 })); sol.rotation.x = -Math.PI / 2; sol.position.y = -.5; scene.add(sol);
  const controles = new OrbitControls(camera, canvas); controles.enableDamping = true; controles.autoRotate = true; controles.autoRotateSpeed = 2.5; controles.target.set(0, 0, 0); controles.minDistance = .8; controles.maxDistance = 6; controles.enablePan = false;
  let vivant = true;
  const taille = () => { const w = fond.clientWidth, h = fond.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  taille(); window.addEventListener('resize', taille);
  const boucle = () => { if (!vivant) return; controles.update(); renderer.render(scene, camera); requestAnimationFrame(boucle); };
  boucle();
  const fermer = () => { vivant = false; window.removeEventListener('resize', taille); controles.dispose(); renderer.dispose(); fond.remove(); };
  X.onclick = fermer; bFermer.onclick = fermer;

  const loader = new GLTFLoader(); const draco = new DRACOLoader(); draco.setDecoderPath('draco/'); loader.setDRACOLoader(draco);
  loader.load(o.url, g => {
    const obj = g.scene; const boite = new THREE.Box3().setFromObject(obj); const dim = new THREE.Vector3(); boite.getSize(dim); const centre = new THREE.Vector3(); boite.getCenter(centre);
    const k = 1 / Math.max(dim.x, dim.y, dim.z, 1e-6); obj.scale.setScalar(k); obj.position.set(-centre.x * k, -boite.min.y * k - .5, -centre.z * k);
    scene.add(obj); msg.remove(); bCap.disabled = false;
    // cadrage : l'objet entier visible, en portrait comme en paysage
    const sphere = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
    const vfov = THREE.MathUtils.degToRad(camera.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = sphere.radius / Math.sin(Math.min(vfov, hfov) / 2) * 1.12;
    controles.target.copy(sphere.center); camera.position.set(sphere.center.x, sphere.center.y + dist * .25, sphere.center.z + dist); controles.minDistance = dist * .35; controles.maxDistance = dist * 3; controles.update();
  }, undefined, () => { msg.textContent = x.e_chargement; });

  bCap.onclick = () => {
    try {
      controles.update(); renderer.render(scene, camera);
      // vignette (petite) gardée dans le téléphone + image en grand à télécharger
      const petit = document.createElement('canvas'); const cote = 320; const w = canvas.width, h = canvas.height, m = Math.min(w, h);
      petit.width = cote; petit.height = cote; petit.getContext('2d')!.drawImage(canvas, (w - m) / 2, (h - m) / 2, m, m, 0, 0, cote, cote);
      const vignette = petit.toDataURL('image/jpeg', .85); majObjet({ id: o.id, image: vignette }); o.image = vignette;
      const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = `${(o.prompt || 'objet').slice(0, 40).replace(/[^\w\u00C0-\u017F -]+/g, '')}.png`; a.click();
      bCap.textContent = `✓ ${x.captureOk}`; setTimeout(() => { bCap.textContent = x.capture; }, 1800);
      surVignette?.(o);
    } catch { /* ignore */ }
  };
}
let surVignette: ((o: Objet) => void) | null = null;

/** L'appli « Atelier » du téléphone : mes objets, poser / retirer, créer. */
export function rendreMesObjets(c: HTMLElement, decoPosee: string | undefined, h: { placer(o: Objet): void; retirer(): void; voir(): void }) {
  style();
  const x = tt();
  const zone = el('div', 'telObjets'); c.appendChild(zone);
  const dessiner = () => {
    zone.replaceChildren();
    const titre = el('div', 'ttl', x.mesObjets); zone.appendChild(titre);
    const l = objets();
    if (!l.length) zone.appendChild(el('p', 'small', x.aucun));
    for (const o of l) {
      const actions: HTMLElement[] = [];
      if (o.statut === 'pret' && o.url) {
        const b3 = el<HTMLButtonElement>('button', 'sec', '🧊 3D'); b3.type = 'button'; b3.title = x.voir3d; b3.setAttribute('aria-label', x.voir3d); b3.onclick = () => voirEn3D(o); actions.push(b3);
        if (decoPosee === o.id) {
          const r = el<HTMLButtonElement>('button', 'sec', x.retirer); r.type = 'button'; r.onclick = () => { h.retirer(); decoPosee = undefined; dessiner(); };
          const v = el<HTMLButtonElement>('button', '', '👀'); v.type = 'button'; v.title = x.voir; v.setAttribute('aria-label', x.voir); v.onclick = () => h.voir();
          actions.push(v, r);
        } else { const p = el<HTMLButtonElement>('button', '', x.placer); p.type = 'button'; p.onclick = () => { h.placer(o); decoPosee = o.id; dessiner(); }; actions.push(p); }
      }
      const ligne = ligneObjet(o, actions); if (decoPosee === o.id) ligne.querySelector('.n')!.appendChild(el('small', '', `✅ ${x.pose}`));
      if (o.statut === 'pret' && o.url) { const im = ligne.querySelector('img, .ph') as HTMLElement | null; if (im) im.onclick = () => voirEn3D(o); }
      zone.appendChild(ligne);
    }
    const creer = el<HTMLButtonElement>('button', 'buy', x.creerUn); creer.type = 'button'; creer.style.marginTop = '10px'; creer.onclick = () => ouvrirAtelier(); zone.appendChild(creer);
    const retr = el<HTMLButtonElement>('button', 'sec', `🔑 ${x.retrouver}`); retr.type = 'button'; retr.style.cssText = 'margin:8px 0 0 8px;font:800 13px Nunito,system-ui,sans-serif;padding:8px 10px;border:0;border-radius:10px;background:#eef1ea;color:#1e2a24;cursor:pointer'; retr.onclick = () => ouvrirAtelier('retrouver'); zone.appendChild(retr);
  };
  dessiner(); surVignette = () => { if (zone.isConnected) dessiner(); };
  if (objets().some(o => o.statut === 'en_cours')) { rafraichir().then(dessiner); const m = window.setInterval(async () => { if (!zone.isConnected) { clearInterval(m); return; } await rafraichir(); dessiner(); if (!objets().some(o => o.statut === 'en_cours')) clearInterval(m); }, 6000); }
}
