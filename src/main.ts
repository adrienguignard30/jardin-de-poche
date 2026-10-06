import './style.css';
import { Game } from './game';

// ---------- toute erreur s'affiche À L'ÉCRAN, en rouge, avec un bouton pour la copier : plus besoin d'ouvrir la console
const erreurs: string[] = [];
const deja = new Map<string, number>();
function montrerErreur(msg: string) {
  if (!new URLSearchParams(location.search).has('debug')) { console.error(msg); return; }   // le cadre rouge seulement avec ?debug=1
  const n = (deja.get(msg) ?? 0) + 1; deja.set(msg, n);
  if (n > 1) { const i = erreurs.findIndex(e => e.startsWith(msg.slice(0, 80))); if (i >= 0) erreurs[i] = `${msg}\n(×${n})`; }
  else { erreurs.push(msg); if (erreurs.length > 8) erreurs.shift(); }       // 8 erreurs différentes au plus
  if (n > 1 && n % 30 !== 0 && document.getElementById('boiteErreur')) return;  // une erreur qui se répète : on ne redessine pas à chaque fois
  let box = document.getElementById('boiteErreur');
  if (!box) {
    box = document.createElement('div'); box.id = 'boiteErreur';
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:#b3261e;color:#fff;font:13px/1.45 ui-monospace,Consolas,monospace;padding:12px 14px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.4);max-height:45vh;overflow:auto;white-space:pre-wrap';
    const titre = document.createElement('div'); titre.style.cssText = 'font:700 15px sans-serif;margin-bottom:6px;display:flex;gap:10px;align-items:center';
    titre.innerHTML = '<span style="flex:1">Une erreur est arrivée — copie-la et envoie-la à Claude</span>';
    const copier = document.createElement('button'); copier.textContent = 'Copier';
    copier.style.cssText = 'background:#fff;color:#b3261e;border:0;border-radius:8px;padding:6px 12px;font:700 13px sans-serif;cursor:pointer';
    copier.onclick = () => { navigator.clipboard?.writeText(erreurs.join('\n\n')); copier.textContent = 'Copié ✓'; };
    const fermer = document.createElement('button'); fermer.textContent = '✕';
    fermer.style.cssText = 'background:transparent;color:#fff;border:0;font:700 16px sans-serif;cursor:pointer';
    fermer.onclick = () => box!.remove();
    titre.append(copier, fermer); box.appendChild(titre);
    const corps = document.createElement('div'); corps.id = 'boiteErreurCorps'; box.appendChild(corps);
    document.body.appendChild(box);
  }
  document.getElementById('boiteErreurCorps')!.textContent = erreurs.join('\n\n');
}
const texteErreur = (e: unknown) => e instanceof Error ? `${e.message}\n${(e.stack ?? '').split('\n').slice(0, 6).join('\n')}` : String(e);
window.addEventListener('error', ev => montrerErreur(texteErreur(ev.error ?? ev.message)));
window.addEventListener('unhandledrejection', ev => montrerErreur(texteErreur(ev.reason)));

const canvas = document.getElementById('c') as HTMLCanvasElement;
const game = new Game(canvas);
(window as any).__jdp = game;
game.boot().catch(err => {
  console.error(err);
  montrerErreur(texteErreur(err));
  const el = document.getElementById('loadLabel');
  if (el) el.textContent = String(err?.message ?? err);
});
