// Les écrans du téléphone : Ma recette · Le marché · Boutique · Carnet. Rendu DOM pur, l'état vient du jeu.
import { CATALOG, ECO, prixProchainPot, type GameState } from './state';
import * as E from './economie';
import { t, tx, lang, quantite } from './i18n';
import { MUSIQUE } from './musique';
import * as EL from './enligne';
import { icon } from './ui';

export type Onglet = 'home' | 'classement' | 'jeu' | 'recette' | 'marche' | 'bourse' | 'boutique' | 'carnet' | 'recus' | 'voisins' | 'notifs' | 'musique' | 'reglages';
export interface TelHandlers {
  onCuisiner(): void; onOffrir(jardinId: string): void;
  onTroc(donne: E.Ingredient, cherche: E.Ingredient): void; onAccepter(annonceId: string): void; onRetirer(annonceId: string): void;
  onBuySeed(id: string): void; onBuyPot(): void;
  onDemain(): void; onChercher(graine: string): void; onFiche(recetteId: string): void; onSemer(graine: string): void; onMontrerPlat(): void; onCompte(): void;
  onApp(app: Onglet, detail?: string): void; onReglage(k: 'fond' | 'vibre' | 'son', v: string | boolean): void;
  onRepondre(evId: string, texte: { fr: string; en: string }): void;
}
const el = <T extends HTMLElement = HTMLElement>(tag: string, cls = '', html = '') => { const e = document.createElement(tag) as T; if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const nomG = (id: string) => { const g = ECO.graines.find(x => x.id === id); return g ? (lang() === 'en' ? g.nom_en : g.nom_fr) : id; };
const nomR = (r: E.Recette) => lang() === 'en' ? r.nom_en : r.nom_fr;
const typeR = (r: E.Recette) => ({ entree: lang() === 'en' ? 'starter' : 'entrée', plat: lang() === 'en' ? 'main' : 'plat', dessert: 'dessert' })[r.type];

/** L'image d'un plat, ou ses ingrédients tant qu'elle n'existe pas. */
export function imagePlat(re: E.Recette, cls = 'platImg'): HTMLElement {
  const img = el<HTMLImageElement>('img', cls); img.alt = ''; img.src = `ui/plats/${re.id}.png`;
  img.onerror = () => img.replaceWith(el('span', cls + ' repli', re.ingredients.map(i => icon(i.graine)).join('')));
  return img;
}
/** La fiche d'une recette : image, nom, ingrédients en quantités de cuisine, étapes, et sa touche d'amour. */
export function ficheRecette(re: E.Recette): HTMLElement {
  const s = t(), f = el('div', 'fiche');
  f.appendChild(imagePlat(re, 'ficheImg'));
  f.appendChild(el('h3', '', nomR(re)));
  const ph = lang() === 'en' ? re.phrase_en : re.phrase_fr; if (ph) f.appendChild(el('p', 'phrase', ph));
  f.appendChild(el('div', 'ttl', s.ingredients));
  const ul = el('ul', 'ingr'); for (const i of re.ingredients) ul.appendChild(el('li', '', `${icon(i.graine)} ${quantite(i.quantite, ECO.graine(i.graine))}`));
  const am = lang() === 'en' ? re.amour_en : re.amour_fr; if (am) ul.appendChild(el('li', 'amour', am));
  f.appendChild(ul);
  const et = lang() === 'en' ? re.etapes_en : re.etapes_fr;
  if (et?.length) { f.appendChild(el('div', 'ttl', s.laRecette)); const ol = el('ol', 'etapes'); for (const e of et) ol.appendChild(el('li', '', e)); f.appendChild(ol); }
  return f;
}
// ---------- les applis du téléphone : icône dessinée (trait), couleur, badge
const SVG = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const APPS: { id: Onglet; couleur: string; svg: string }[] = [
  { id: 'recette', couleur: '#f08a24', svg: SVG('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>') },
  { id: 'bourse', couleur: '#1f8a8a', svg: SVG('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>') },
  { id: 'marche', couleur: '#3f9a5a', svg: SVG('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>') },
  { id: 'boutique', couleur: '#3a7bd5', svg: SVG('<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>') },
  { id: 'carnet', couleur: '#b8741a', svg: SVG('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>') },
  { id: 'recus', couleur: '#d86f8a', svg: SVG('<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>') },
  { id: 'voisins', couleur: '#7a5ac9', svg: SVG('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>') },
  { id: 'notifs', couleur: '#e0533a', svg: SVG('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') },
  { id: 'jeu', couleur: '#7b1fa2', svg: SVG('<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="16" cy="11.5" r="1" fill="currentColor"/><circle cx="18.5" cy="13.5" r="1" fill="currentColor"/>') },
  { id: 'classement', couleur: '#f2a33a', svg: SVG('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>') },
  { id: 'musique', couleur: '#c2185b', svg: SVG('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>') },
  { id: 'reglages', couleur: '#6b7780', svg: SVG('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>') },
];
export const FONDS: Record<string, string> = {
  aube: 'linear-gradient(160deg, #ffd6a5, #fdffb6 55%, #ffadad)', menthe: 'linear-gradient(160deg, #caffbf, #9bf6ff)',
  lavande: 'linear-gradient(160deg, #bdb2ff, #ffc6ff)', nuit: 'linear-gradient(160deg, #1d2b53, #7e2553)',
  terracotta: 'linear-gradient(160deg, #f4a261, #e76f51)', paris: 'linear-gradient(180deg, #a2d2ff, #fefae0 70%, #e9c46a)',
};
export interface Reglages { fond: string; vibre: boolean; son: string }
export function reglagesTel(): Reglages {
  try { return { fond: 'paris', vibre: true, son: 'aucun', ...JSON.parse(localStorage.getItem('jdp.tel') || '{}') }; } catch { return { fond: 'paris', vibre: true, son: 'aucun' }; }
}
export function iconeApp(id: Onglet, taille = 54): string {
  const a = APPS.find(x => x.id === id)!;
  return `<span class="appIco" style="background:${a.couleur};width:${taille}px;height:${taille}px">${a.svg}</span>`;
}

/** Ce que le joueur a choisi dans le formulaire d'échange, gardé tant qu'il n'a pas publié. */
let RENDUS = 0;
const ETAT_TROC: { d?: string; c?: string; qD?: number; qC?: number; venuPour?: string } = {};
export const evId = (e: E.Evenement) => `${e.a}_${e.type}_${e.deId ?? ''}`;
/** Le graphique d'une récolte sur la semaine : valeur (ligne), demande (barres), voisins qui la cultivent (pointillés). */
function graphique(pts: { x: string; cours: number; demande: number; cultiv: number }[], leg: Record<string, string>): HTMLElement {
  const W = 300, Hh = 150, P = 26, n = Math.max(1, pts.length);
  const mx = (k: 'cours' | 'demande' | 'cultiv') => Math.max(1, ...pts.map(p => p[k]));
  const X = (i: number) => P + (n === 1 ? (W - 2 * P) / 2 : i * (W - 2 * P) / (n - 1));
  const Y = (v: number, m: number) => Hh - P - v / m * (Hh - 2 * P);
  const bw = Math.max(6, (W - 2 * P) / n * .45);
  const barres = pts.map((p, i) => `<rect x="${X(i) - bw / 2}" y="${Y(p.demande, mx('demande'))}" width="${bw}" height="${Hh - P - Y(p.demande, mx('demande'))}" rx="3" fill="#f2c77a"/>`).join('');
  const ligne = (k: 'cours' | 'cultiv', col: string, dash = '') => `<polyline fill="none" stroke="${col}" stroke-width="2.5" ${dash} points="${pts.map((p, i) => `${X(i)},${Y(p[k], mx(k))}`).join(' ')}"/>` + pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p[k], mx(k))}" r="3" fill="${col}"/>`).join('');
  const xs = pts.map((p, i) => `<text x="${X(i)}" y="${Hh - 8}" font-size="9" text-anchor="middle" fill="#5b6b75">${p.x}</text>`).join('');
  const w = el('div', 'graph');
  w.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" width="100%"><line x1="${P}" y1="${Hh - P}" x2="${W - P}" y2="${Hh - P}" stroke="#cfd6db"/>${barres}${ligne('cultiv', '#7a5ac9', 'stroke-dasharray="4 3"')}${ligne('cours', '#1f8a8a')}${xs}</svg>`
    + `<div class="legende"><span><i style="background:#1f8a8a"></i>${leg.cours}</span><span><i style="background:#f2c77a"></i>${leg.demande}</span><span><i style="background:#7a5ac9"></i>${leg.cultiv}</span></div>`;
  return w;
}
export function renderTelephone(c: HTMLElement, onglet: Onglet, st: GameState, h: TelHandlers, precedent?: Record<string, number>, cherche?: string) {
  const s = t(), j = st.eco.jardin, im = st.eco.immeuble;
  c.innerHTML = '';
  c.querySelectorAll('iframe.cadreJeu').forEach(f => { try { (f as HTMLIFrameElement).src = 'about:blank'; } catch { /* ignore */ } f.remove(); });
  c.classList.toggle('homeScreen', onglet === 'home'); c.classList.remove('avecBarre', 'avecJeu');
  const zoneA = c.parentElement?.querySelector('#telAction') as HTMLElement | null; if (zoneA) { zoneA.innerHTML = ''; zoneA.classList.add('hidden'); }
  c.dataset.rendu = String(++RENDUS);
  c.style.background = '';
  if (onglet === 'home') {                                                  // l'écran d'accueil : les applis
    const g = el('div', 'appsGrid');
    for (const a of APPS) {
      const b = el('button', 'appBtn', `${iconeApp(a.id)}<span class="appNom">${s.apps[a.id]}</span>`);
      b.dataset.app = a.id; b.onclick = () => h.onApp(a.id); g.appendChild(b);
    }
    c.appendChild(g); return;
  }
  if (onglet === 'recus') {                                                  // les plats que les voisins m'ont offerts
    const recus = im.plats.filter(p => p.a === j.id).reverse();
    if (!recus.length) { c.appendChild(el('p', 'empty', s.aucunRecu)); return; }
    for (const p of recus) {
      const re = ECO.recette(p.recette);
      const row = el('div', 'row carte'); row.append(imagePlat(re), el('span', '', `<b>${nomR(re)}</b><small>${s.recuDeQui(im.jardins.find(x => x.id === p.par)?.nom ?? '?')} · ${p.jour}</small>`));
      row.onclick = () => h.onFiche(re.id);
      const ev = im.evenements.find(e => e.type === 'plat_recu' && e.platId === p.id);
      if (ev) { const b = el('button', 'buy' + (ev.repondu ? ' off' : ''), s.repondre); b.onclick = (e) => { e.stopPropagation(); h.onApp('notifs', evId(ev)); }; row.appendChild(b); }
      c.appendChild(row);
    }
    return;
  }
  if (onglet === 'voisins') {
    for (const v of im.jardins.filter(x => x.id !== j.id)) {
      const mq = E.manque(v, ECO);
      c.appendChild(el('div', 'row', `<span><b>${v.nom}</b><small>${s.cultive} ${Object.keys(v.poche).map(g => `${icon(g)} ${nomG(g)}`).join(', ')}${mq.length ? ` · ${s.cherche} ${mq.map(m => nomG(m.graine)).join(', ')}` : ''} · ${v.plats_offerts} ${s.platsOfferts}</small></span>`));
    }
    return;
  }
  if (onglet === 'notifs' && cherche) {                                      // un message ouvert : répondre au voisin
    const ev = im.evenements.find(e => evId(e) === cherche);
    if (ev) {
      c.appendChild(el('div', 'bulleMsg', `<small>${ev.de ?? ''}</small>${lang() === 'en' ? ev.texte_en : ev.texte_fr}`));
      const reps = E.REPONSES[ev.type];
      if (reps && ev.deId) {
        if (ev.repondu) c.appendChild(el('p', 'small ok', s.dejaRepondu));
        else {
          c.appendChild(el('div', 'ttl', s.repondreA(ev.de ?? '')));
          for (const r of reps) { const b = el('button', 'seed', `<span>${lang() === 'en' ? r.en : r.fr}</span>`); b.onclick = () => h.onRepondre(cherche, r); c.appendChild(b); }
        }
      }
    }
    return;
  }
  if (onglet === 'bourse') {
    const H_ = im.historique, der = H_?.heures[H_.heures.length - 1];
    const nbRecettes = (g: string) => ECO.recettes.filter(r => r.ingredients.some(i => i.graine === g)).length;
    if (cherche) {                                                           // la fiche d'une récolte : sa semaine, et demain
      const g = cherche, gr = ECO.graine(g);
      const jours = [...(H_?.jours ?? []), ...(der ? [der] : [])].slice(-8);
      c.appendChild(el('h3', 'bourseTitre', `${icon(g)} ${nomG(g)} · ${im.cours[g] ?? gr.prix_base} ${s.points}`));
      c.appendChild(graphique(jours.map(d => ({ x: d.jour.slice(5), cours: d.cours[g] ?? 0, demande: d.demande[g] ?? 0, cultiv: d.cultivateurs[g] ?? 0 })), s.leg));
      const pv = E.prevision(im, ECO, g, Date.now());
      c.appendChild(el('div', 'row', `<span><b>${s.demain}</b><small>${pv.sens === 'hausse' ? s.prevHausse : pv.sens === 'baisse' ? s.prevBaisse : s.prevStable} (${pv.prix} ${s.points})</small></span>`));
      c.appendChild(el('div', 'row', `<span>${s.dansRecettes(nbRecettes(g))}<small>${s.cultivateurs(der?.cultivateurs[g] ?? 0)}</small></span>`));
      return;
    }
    c.appendChild(el('p', 'small', s.bourseExplique));
    const ligne = (g: string, dem: number) => {
      const pv = E.prevision(im, ECO, g, Date.now());
      const row = el('div', 'row', `<span>${icon(g)} ${nomG(g)}<small>${dem} ${s.demande} · ${s.cultivateurs(der?.cultivateurs[g] ?? 0)} · ${s.demain} : ${pv.sens === 'hausse' ? s.prevHausse : pv.sens === 'baisse' ? s.prevBaisse : s.prevStable}</small></span><b>${im.cours[g] ?? ECO.graine(g).prix_base} pts</b>`);
      row.onclick = () => h.onApp('bourse', g); row.style.cursor = 'pointer'; return row;
    };
    c.appendChild(el('div', 'ttl', s.bourseAuj));
    const auj = ECO.v1().map(g => ({ g: g.id, d: der?.demande[g.id] ?? 0 })).sort((a, b) => b.d - a.d);
    for (const x of auj.slice(0, 8)) c.appendChild(ligne(x.g, x.d));
    c.appendChild(el('div', 'ttl', s.bourseSemaine));
    const sem = ECO.v1().map(g => ({ g: g.id, d: Math.round((H_?.jours ?? []).reduce((t, j2) => t + (j2.demande[g.id] ?? 0), 0)) })).sort((a, b) => b.d - a.d);
    for (const x of sem.slice(0, 8)) c.appendChild(ligne(x.g, x.d));
    return;
  }
  if (onglet === 'notifs') {                                                 // l'historique des messages, du plus récent
    const ev = im.evenements.filter(e => e.pour === j.id).slice().reverse();
    if (!ev.length) { c.appendChild(el('p', 'empty', s.aucunMessage)); return; }
    for (const e of ev.slice(0, 40)) {
      const app: Onglet = e.type === 'plat_recu' ? 'recus' : e.type === 'troc_accepte' ? 'marche' : 'recette';
      const row = el('div', 'row msg', `${iconeApp(app, 30)}<span>${lang() === 'en' ? e.texte_en : e.texte_fr}<small>${e.jour ?? new Date(e.a).toLocaleString(lang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></span>`);
      row.onclick = () => E.REPONSES[e.type] && e.deId ? h.onApp('notifs', evId(e)) : h.onApp(app); c.appendChild(row);
    }
    return;
  }
  if (onglet === 'classement') {                                          // les meilleurs de l'immeuble… du monde
    if (!EL.EN_LIGNE) { c.appendChild(el('p', 'small', s.classementHorsLigne)); return; }
    const cats: [EL.Categorie, string][] = [['trocs', s.catTrocs], ['recoltes', s.catRecoltes], ['offerts', s.catOfferts], ['recus', s.catRecus]];
    const choix = (window as any).__catClassement as EL.Categorie ?? 'trocs';
    const onglets = el('div', 'ongletsClassement');
    for (const [k, nom] of cats) { const b = el('button', 'og' + (k === choix ? ' on' : ''), nom); b.onclick = () => { (window as any).__catClassement = k; h.onApp('classement'); }; onglets.appendChild(b); }
    c.appendChild(onglets);
    const liste = el('div', 'listeClassement', `<p class="small">…</p>`); c.appendChild(liste);
    EL.classement(choix).then(rangs => {
      liste.innerHTML = '';
      if (!rangs.length) { liste.appendChild(el('p', 'small', s.classementVide)); return; }
      for (const r of rangs) liste.appendChild(el('div', 'row rang' + (r.moi ? ' moi' : ''), `<span class="n">${r.rang <= 3 ? ['🥇', '🥈', '🥉'][r.rang - 1] : r.rang}</span><span class="nom">${r.nom.replace(/[<>&]/g, '')}${r.moi ? ` <i>(${s.toi})</i>` : ''}</span><b>${r.score}</b>`));
    });
    return;
  }
  if (onglet === 'jeu') {                                                  // le jeu du mois : un autre jeu, dans son cadre, avec SA musique
    const mj = (CATALOG as any).miniJeu as { titre?: string; url?: string } | undefined;
    if (!mj?.url) { c.appendChild(el('p', 'small', s.jeuBientot)); return; }
    c.classList.add('avecJeu');
    const cadre = el<HTMLIFrameElement>('iframe', 'cadreJeu');
    cadre.src = mj.url; cadre.allow = 'autoplay; fullscreen; gamepad'; cadre.title = mj.titre || s.jeuT;
    c.appendChild(cadre);
    MUSIQUE.pauseJeu(true);                                                // le jeu a sa musique : la nôtre attend
    return;
  }
  MUSIQUE.pauseJeu(false);
  if (onglet === 'musique') {                                               // l'appli Musique : les trois playlists, en choisir une
    const M = MUSIQUE, ec = M.enCours_;
    const PL: { id: string; titre: string; couleur: string }[] = [
      { id: 'lea', titre: s.plLea, couleur: '#d86f8a' }, { id: 'marcel', titre: s.plMarcel, couleur: '#b8741a' }, { id: 'jimy', titre: s.plJimy, couleur: '#3f9a5a' }];
    const lecteur = el('div', 'lecteur');
    const pl = ec ? PL.find(p => p.id === ec.id) : null;
    lecteur.appendChild(el('div', 'pochette', `<i style="background:${pl?.couleur ?? '#8a969e'}"></i>`));
    lecteur.appendChild(el('div', 'titreMorceau', ec ? `<b>${pl?.titre ?? ''}</b><small>${s.morceau(ec.index + 1, ec.total)}</small>` : `<small>${s.touchePourSon}</small>`));
    const cmd = el('div', 'commandes');
    const b1 = el('button', 'cmd', '⏮'); b1.onclick = () => { M.precedent(); setTimeout(() => h.onApp('musique'), 300); };
    const b2 = el('button', 'cmd grand', M.enPause || M.R.coupe ? '▶' : '⏸'); b2.onclick = () => { if (M.R.coupe) M.couper(false); else M.pause(!M.enPause); h.onApp('musique'); };
    const b3 = el('button', 'cmd', '⏭'); b3.onclick = () => { M.suivant(); setTimeout(() => h.onApp('musique'), 300); };
    cmd.append(b1, b2, b3); lecteur.appendChild(cmd);
    const vol = el<HTMLInputElement>('input', 'volTel'); vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.value = String(Math.round((M.R.coupe ? 0 : M.R.volume) * 100));
    vol.oninput = () => M.volume(+vol.value / 100);
    const lv = el('div', 'volLigne', '<span>🔈</span>'); lv.append(vol, el('span', '', '🔊')); lecteur.appendChild(lv);
    c.appendChild(lecteur);
    c.appendChild(el('div', 'ttl', s.playlists));
    const choixAuto = el('div', 'row radio' + (!M.R.playlist ? ' on' : ''), `<span><i class="dot"></i> ${s.plAuto}</span>`); choixAuto.onclick = () => { M.choisir(''); h.onApp('musique'); }; c.appendChild(choixAuto);
    for (const p of PL) {
      const r = el('div', 'row radio' + (M.R.playlist === p.id ? ' on' : ''), `<span><i class="dot"></i> <b style="color:${p.couleur}">${p.titre}</b></span>`);
      r.onclick = () => { M.choisir(p.id); setTimeout(() => h.onApp('musique'), 400); }; c.appendChild(r);
    }
    return;
  }
  if (onglet === 'reglages') {
    const R = reglagesTel();
    if (EL.EN_LIGNE) {                                                     // le compte
      const e = EL.etatCompte();
      c.appendChild(el('div', 'ttl', s.compteT));
      const lc = el('div', 'row', `<span>${e.connecte && !e.invite ? s.connecteComme(e.pseudo ?? '') : s.inviteEnCours}</span>`);
      const bc = el('button', 'buy', e.connecte && !e.invite ? s.deconnecterBtn : s.creerCompteT);
      bc.onclick = () => h.onCompte(); lc.appendChild(bc); c.appendChild(lc);
    }
    // la musique : marche / arrêt et volume
    c.appendChild(el('div', 'ttl', s.musiqueT));
    const M = MUSIQUE.R;
    const mb = el('button', 'toggle' + (!M.coupe ? ' on' : ''), `<i></i>`); mb.onclick = () => MUSIQUE.couper(!M.coupe);
    const lm = el('div', 'row'); lm.append(el('span', '', s.musiqueT), mb); c.appendChild(lm);
    const vol = el<HTMLInputElement>('input', 'volTel'); vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.value = String(Math.round(M.volume * 100));
    vol.oninput = () => MUSIQUE.volume(+vol.value / 100);
    const lv2 = el('div', 'row'); lv2.append(el('span', '', s.volumeT), vol); c.appendChild(lv2);
    c.appendChild(el('div', 'ttl', s.fondEcran));
    const fg = el('div', 'fondsGrid');
    for (const [k, v] of Object.entries(FONDS)) { const b = el('button', 'fondBtn' + (R.fond === k ? ' on' : ''), `<i style="background:${v}"></i><small>${s.fonds[k]}</small>`); b.onclick = () => h.onReglage('fond', k); fg.appendChild(b); }
    c.appendChild(fg);
    c.appendChild(el('div', 'ttl', s.vibreur));
    const vb = el('button', 'toggle' + (R.vibre ? ' on' : ''), `<i></i>`); vb.onclick = () => h.onReglage('vibre', !R.vibre);
    const lv = el('div', 'row'); lv.append(el('span', '', s.vibreur), vb); c.appendChild(lv);
    c.appendChild(el('div', 'ttl', s.sonNotif));
    for (const [k, lab] of [['aucun', s.sonAucun], ['bip', s.sonBip], ['cloche', s.sonCloche], ['goutte', s.sonGoutte]] as const) {
      const r = el('div', 'row radio' + (R.son === k ? ' on' : ''), `<span><i class="dot"></i> ${lab}</span>`); r.onclick = () => h.onReglage('son', k); c.appendChild(r);
    }
    return;
  }
  if (onglet === 'recette') {
    if (st.eco.platEnCours) {                                              // le plat prêt : tout en haut, impossible à rater
      const pe = st.eco.platEnCours;
      const bloc = el('div', 'offrirBloc', `<b>${s.platPret(nomR(ECO.recette(pe.recette)))}</b>`);
      for (const v of im.jardins.filter(x => x.id !== j.id)) {
        const b = el('button', 'seed', `<span>${s.offrirA} ${v.nom}</span><small>${Object.keys(v.poche).map(icon).join('')}</small>`);
        b.onclick = () => h.onOffrir(v.id); bloc.appendChild(b);
      }
      c.appendChild(bloc);
    }
    const rj = j.recette;
    if (!rj) { c.appendChild(el('p', 'empty', s.pasDeRecette)); return; }
    const re = ECO.recette(rj.recette);
    const tete = el('div', 'recetteTete'); tete.appendChild(imagePlat(re, 'recetteImg')); tete.onclick = () => h.onFiche(re.id); c.appendChild(tete);
    const demain = rj.jour > E.jourDe(Date.now());
    const titre = (re.accueil ? s.premiereRecette : demain ? s.demainTitre : s.recetteDuJour) + ` · ${demain ? s.pourDemain : s.pourAujourdhui}`;
    c.appendChild(el('div', 'recette', `<small>${titre} — ${typeR(re)}</small><b>${nomR(re)}</b>${re.phrase_fr ? `<em>${lang() === 'en' ? re.phrase_en ?? '' : re.phrase_fr}</em>` : ''}`));
    const manque = E.manque(j, ECO);
    let cout = 0;
    for (const ing of re.ingredients) {
      const ai = j.panier[ing.graine] ?? 0;
      const pousse = j.pots.filter(p => p && p.graine === ing.graine).length;
      const mq = Math.max(0, ing.quantite - ai);
      const cultivable = !!j.poche[ing.graine] || !!j.rares[ing.graine];
      if (mq) cout += mq * (im.cours[ing.graine] ?? 1);
      const recu = j.recus?.[ing.graine];
      const detail = !mq ? `<span class="ok">${s.ligneOk(ing.quantite)}</span>${recu ? ` <small>${s.ligneRecu(recu.de, recu.comment)}</small>` : ''}`
        : `<span class="warn">${s.ligneManque(ai, ing.quantite)}</span> <small>${cultivable ? (pousse ? s.lignePousse(pousse) : s.ligneSemer) : j.interdites.includes(ing.graine) ? s.ligneInterdite2 : s.ligneSansGraine(E.REGLES.BOUTIQUE[Math.max(0, Object.keys(j.poche).length - 3)] ?? 120)}</small>`;
      const row = el('div', 'row ingr' + (rj.faite ? ' faite' : ''), `<span><b>${icon(ing.graine)} ${nomG(ing.graine)}</b><br>${detail}</span>`);
      if (mq && !rj.faite) {                                   // tout ce qui manque : les chemins possibles, sous l'ingrédient
        row.classList.add('col');
        const btns = el('div', 'btnsLigne');
        const b1 = el('button', 'buy', s.echangerBtn); b1.onclick = () => h.onChercher(ing.graine); btns.appendChild(b1);
        const nP = Object.keys(j.poche).length;
        const enPousse = j.pots.some(p => p && p.graine === ing.graine);
        if (cultivable && !enPousse) {                                                // j'ai la graine : la semer
          const b2 = el('button', 'buy vert', s.semerBtn); b2.onclick = () => h.onSemer(ing.graine); btns.appendChild(b2);
        } else if (!cultivable && !j.interdites.includes(ing.graine) && nP < E.REGLES.POCHE_MAX) {   // je ne l'ai pas : l'acheter
          const prixG = E.REGLES.BOUTIQUE[nP - 3] ?? E.REGLES.BOUTIQUE[E.REGLES.BOUTIQUE.length - 1];
          const b2 = el('button', 'buy bleu', s.boutiqueBtn(prixG)); b2.onclick = () => h.onApp('boutique', ing.graine); btns.appendChild(b2);
        }
        row.appendChild(btns);
      }
      c.appendChild(row);
    }
    const amour = lang() === 'en' ? re.amour_en : re.amour_fr;
    if (amour) c.appendChild(el('div', 'row ingr amour', `<span><b>${amour}</b><br><span class="ok">${s.amourToujours}</span></span>`));
    const et = lang() === 'en' ? re.etapes_en : re.etapes_fr;
    if (et?.length) { c.appendChild(el('div', 'ttl', s.laRecette)); const ol = el('ol', 'etapes'); for (const e of et) ol.appendChild(el('li', '', e)); c.appendChild(ol); }
    {                                                               // ce que ce plat rapporte : valeur des ingrédients × type (× 3 avec un ingrédient rare)
      const v0 = re.ingredients.reduce((t_, i) => t_ + E.valeur(im, i), 0);
      const rare = re.ingredients.some(i => j.interdites.includes(i.graine));
      const mult = E.REGLES.MULT_TYPE[re.type] ?? 1;
      const nomType = ({ entree: lang() === 'en' ? 'a starter' : 'une entrée', plat: lang() === 'en' ? 'a main course' : 'un plat', dessert: lang() === 'en' ? 'a dessert' : 'un dessert' } as Record<string, string>)[re.type] ?? '';
      c.appendChild(el('p', 'small gain', s.gainPlat(Math.round(v0 * mult * (rare ? 3 : 1)), nomType, mult, rare)));
    }
    if (rj.faite) { c.querySelector('.recette')?.classList.add('faite'); c.appendChild(el('p', 'small ok', s.recetteFaiteBarre)); }
    else if (manque.length) c.appendChild(el('p', 'small', s.coutTotal(Math.round(cout))));
    else if (re.accueil) c.appendChild(el('p', 'small ok', s.touteTa));
    // LA barre d'action, collée en bas de l'écran du téléphone (comme « Ajouter au panier » dans les applis) : on la voit
    // sans descendre, et le contenu a assez de marge en bas pour qu'elle ne cache jamais rien.
    // la barre d'action : seulement quand il y a une action à faire (cuisiner, offrir, voir demain). Quand il manque des
    // ingrédients, pas de barre : chaque ingrédient a déjà ses boutons. Elle a sa propre place sous le contenu.
    const zone = c.parentElement?.querySelector('#telAction') as HTMLElement | null;
    if (zone) {
      let b: HTMLElement | null = null;
      if (st.eco.platEnCours) { b = el('button', 'primary', s.offrirLePlat); b.onclick = () => h.onMontrerPlat(); }
      else if (rj.faite) { b = el('button', 'primary', s.voirDemain); b.onclick = () => h.onDemain(); }
      else if (!manque.length) { b = el('button', 'primary', s.cuisiner); b.onclick = () => h.onCuisiner(); }
      if (b) { zone.appendChild(b); zone.classList.remove('hidden'); }
    }

    // en bas : ce que j'ai, ce qui pousse, ma poche
    const panier = Object.entries(j.panier).filter(([, n]) => n > 0);
    c.appendChild(el('div', 'row', `<span>🧺 ${s.basket}<small>${panier.length ? panier.map(([g, n]) => `${icon(g)} ${n}`).join(' · ') : s.basketEmpty}</small></span>`));
    const poche = Object.keys(j.poche);
    c.appendChild(el('div', 'row', `<span>🌱 ${s.enPoche}<small>${poche.map(g => `${icon(g)} ${nomG(g)}`).join(' · ')}${Object.keys(j.rares).length ? ' · ★ ' + Object.entries(j.rares).map(([g, n]) => `${icon(g)} ${nomG(g)} ×${n}`).join(' · ') : ''}</small></span>`));
  } else if (onglet === 'marche') {
    const mqAll = E.manque(j, ECO);
    const mq = mqAll.filter(m => !j.poche[m.graine] || !j.pots.some(p => p && p.graine === m.graine));
    const cible = cherche ?? mq[0]?.graine;
    const garde = (g: string) => (j.recette && !j.recette.faite ? ECO.recette(j.recette.recette).ingredients.find(i => i.graine === g)?.quantite ?? 0 : 0);
    const surplus = (g: string) => Math.max(0, (j.panier[g] ?? 0) - garde(g));
    const ouvertes = im.annonces.filter(a => !a.accepte_par).sort((a, b) => b.cree_a - a.cree_a);
    const ligneAnnonce = (a: E.Annonce) => {
      const de = im.jardins.find(x => x.id === a.de);
      const mienne = a.de === j.id;
      const quoi = (i: E.Ingredient) => i.graine === E.POINTS ? `${i.quantite} ${s.points}` : `${i.quantite} ${icon(i.graine)} ${nomG(i.graine)}`;
      const utile = !mienne && mq.some(m => m.graine === a.donne.graine);
      const jg = mienne ? E.jugement(im, a.cherche, a.donne) : E.jugement(im, a.donne, a.cherche);   // toujours de MON point de vue
      const puce = `<i class="verdict ${jg.verdict}">${s.verdict[jg.verdict]}</i>`;
      const row = el('div', 'row annonce' + (mienne ? ' mienne' : utile ? ' utile' : ''), `<span><b>${mienne ? s.monAnnonce : de?.nom ?? '?'}</b> ${puce}<small>${mienne ? s.jeDonneQ : s.donne} ${quoi(a.donne)} · ${s.contre} ${quoi(a.cherche)}</small><small class="vals">${s.valeurs(jg.recoit, jg.donne)}</small></span>`);
      if (!mienne) {
        const peut = a.cherche.graine === E.POINTS ? j.points >= a.cherche.quantite : surplus(a.cherche.graine) >= a.cherche.quantite;
        const bt = el<HTMLButtonElement>('button', 'buy' + (peut ? '' : ' off'), s.accepter); bt.onclick = () => h.onAccepter(a.id); row.appendChild(bt);
      } else { const bt = el<HTMLButtonElement>('button', 'buy off', s.retirer); bt.onclick = () => h.onRetirer(a.id); row.appendChild(bt); }
      return row;
    };
    // 1. ce qui sert à ma recette : les annonces qui ont ce qu'il me manque
    if (mq.length) {
      c.appendChild(el('div', 'ttl', s.pourTaRecette));
      const utiles = ouvertes.filter(a => a.de !== j.id && mq.some(m => m.graine === a.donne.graine));
      if (utiles.length) {
        c.appendChild(el('p', 'small', s.ontCeQuilManque));
        for (const a of utiles) c.appendChild(ligneAnnonce(a));
        // la meilleure annonce payable pour chaque ingrédient qui manque : tout valider d'un coup
        const payable = (a: E.Annonce) => a.cherche.graine === E.POINTS ? j.points >= a.cherche.quantite : surplus(a.cherche.graine) >= a.cherche.quantite;
        const choix = mq.map(m => utiles.find(a => a.donne.graine === m.graine && a.donne.quantite >= m.quantite && payable(a))).filter(Boolean) as E.Annonce[];
        if (choix.length >= 2) { const b = el('button', 'primary', s.toutAccepter(choix.length)); b.onclick = () => { for (const a of choix) h.onAccepter(a.id); }; c.appendChild(b); }
      }
      else c.appendChild(el('p', 'small warn', s.personnePoste(nomG(cible ?? mq[0].graine).toLowerCase())));
    }
    // 2. proposer un échange : je cherche (ce qui manque) contre ce que je donne (mes légumes en trop ; les points, c'est pour la Boutique). Tout reste équilibré :
    //    les deux quantités sont libres ; les compteurs tournent en rond (au-delà du max → 1, sous 1 → max) ; « Max » va au plus.
    const dons: [string, number][] = Object.keys(j.panier).filter(g => surplus(g) > 0).map(g => [g, surplus(g)] as [string, number]);
    c.appendChild(el('div', 'ttl', s.proposerTroc));
    if (!dons.length) c.appendChild(el('p', 'small warn', s.rienADonner));
    else {
      const form = el('div', 'troc2');
      const selD = el<HTMLSelectElement>('select'), selC = el<HTMLSelectElement>('select');
      for (const [g, n] of dons) { const o = document.createElement('option'); o.value = g; o.text = g === E.POINTS ? `${s.points} ${s.trocMax(n)}` : `${nomG(g)} ${s.trocMax(n)}`; selD.appendChild(o); }
      for (const g of ECO.v1()) { const o = document.createElement('option'); o.value = g.id; o.text = nomG(g.id); selC.appendChild(o); }
      // ce que le joueur avait choisi reste choisi (le téléphone peut se redessiner quand un voisin poste)
      selC.value = (cherche && cherche !== ETAT_TROC.venuPour ? cherche : ETAT_TROC.c) ?? cible ?? selC.value;
      if (ETAT_TROC.d && dons.some(d => d[0] === ETAT_TROC.d)) selD.value = ETAT_TROC.d;
      ETAT_TROC.venuPour = cherche;
      const coursDe = (g: string) => g === E.POINTS ? 1 : (im.cours[g] ?? 1);
      const maxD = () => dons.find(d => d[0] === selD.value)?.[1] ?? 1;
      const maxC = () => 20;                                                 // ce que je cherche : libre (le verdict dit si c'est juste)
      let qD = ETAT_TROC.d === selD.value && ETAT_TROC.qD ? ETAT_TROC.qD : 1, qC = ETAT_TROC.c === selC.value && ETAT_TROC.qC ? ETAT_TROC.qC : 1;
      const eq = el('p', 'small');
      const pub = el('button', 'primary', s.publier);
      const sauver = () => Object.assign(ETAT_TROC, { d: selD.value, c: selC.value, qD, qC });
      const maj = () => {
        qD = Math.min(Math.max(1, qD), maxD()); qC = Math.min(Math.max(1, qC), maxC());
        sD.v.textContent = String(qD); sC.v.textContent = String(qC);
        const vd = coursDe(selD.value) * qD, vc = coursDe(selC.value) * qC;
        const ratio = vc / Math.max(.01, vd);                                 // je reçois / je donne
        const dansLesClous = ratio <= 3 && ratio >= 1 / 3 && selD.value !== selC.value;
        const verdict = ratio >= 1.15 ? 'avantageux' : ratio >= .87 ? 'equitable' : 'desavantageux';
        eq.innerHTML = dansLesClous
          ? `<i class="verdict ${verdict}">${s.verdict[verdict]}</i> ${s.valeurs(Math.round(vc), Math.round(vd))}<br>${s.chanceAccept[verdict]}`
          : s.tropLoin;
        eq.className = 'small ' + (dansLesClous ? '' : 'warn');
        pub.classList.toggle('off', !dansLesClous); sauver();
      };
      const depuisC = () => maj(), depuisD = () => maj();                    // chaque compteur est indépendant
      const compteur = (get: () => number, set: (v: number) => void, max: () => number, apres: () => void) => {
        const w = el('div', 'stepper');
        const m = el('button', 'st', '−'), v = el('b', '', String(get())), p = el('button', 'st', '+'), mx = el('button', 'st max', s.maxBtn);
        m.onclick = (e) => { e.preventDefault(); set(get() - 1 < 1 ? max() : get() - 1); apres(); };
        p.onclick = (e) => { e.preventDefault(); set(get() + 1 > max() ? 1 : get() + 1); apres(); };
        mx.onclick = (e) => { e.preventDefault(); set(max()); apres(); };
        w.append(m, v, p, mx); return { w, v };
      };
      const sC = compteur(() => qC, x => qC = x, maxC, depuisC);
      const sD = compteur(() => qD, x => qD = x, maxD, depuisD);
      selD.onchange = () => { qD = 1; depuisD(); }; selC.onchange = () => { qC = mqAll.find(m => m.graine === selC.value)?.quantite ?? 1; depuisC(); };
      const l1 = el('div', 'tl'); l1.append(el('span', '', s.trocJeCherche), selC, sC.w);
      const l2 = el('div', 'tl'); l2.append(el('span', '', s.trocContreDonne), selD, sD.w);
      form.append(l1, l2, eq, pub); c.appendChild(form);
      pub.onclick = () => { h.onTroc({ graine: selD.value, quantite: qD }, { graine: selC.value, quantite: qC }); for (const k of Object.keys(ETAT_TROC)) delete (ETAT_TROC as Record<string, unknown>)[k]; };
      if (ETAT_TROC.c === selC.value && ETAT_TROC.d === selD.value) maj();
      else { qC = Math.max(qC, mqAll.find(m => m.graine === selC.value)?.quantite ?? 1); depuisC(); }
    }
    // 3. mes annonces (en vert), puis celles des voisins
    const miennes = ouvertes.filter(a => a.de === j.id);
    if (miennes.length) { c.appendChild(el('div', 'ttl vert', s.mesAnnonces)); for (const a of miennes) c.appendChild(ligneAnnonce(a)); }
    const autres = ouvertes.filter(a => a.de !== j.id && !mq.some(m => m.graine === a.donne.graine));
    c.appendChild(el('div', 'ttl', s.autresAnnonces));
    if (!autres.length) c.appendChild(el('p', 'empty', s.pasDAnnonce));
    for (const a of autres.slice(0, 12)) c.appendChild(ligneAnnonce(a));
  } else if (onglet === 'boutique') {
    c.appendChild(el('div', 'ttl', s.varietes));
    const n = Object.keys(j.poche).length;
    const prix = E.REGLES.BOUTIQUE[n - 3] ?? E.REGLES.BOUTIQUE[E.REGLES.BOUTIQUE.length - 1];
    c.appendChild(el('p', 'small', s.poche(n, E.REGLES.POCHE_MAX, j.points)));
    const tri = [...ECO.v1()].sort((a, b) => (+!!j.poche[b.id] - +!!j.poche[a.id]) || (+j.interdites.includes(a.id) - +j.interdites.includes(b.id)) || a.pousse_min - b.pousse_min);
    for (const g of tri) {
      const owned = !!j.poche[g.id], interdite = j.interdites.includes(g.id);
      const detail = interdite ? ((lang() === 'en' ? g.interdit_en : g.interdit_fr) || s.interdite)
        : `${g.pousse_min >= 60 ? Math.round(g.pousse_min / 60) + ' h' : g.pousse_min + ' min'} · ${g.recoltes} ${lang() === 'en' ? 'harvests' : 'récoltes'}`;
      const row = el('div', 'row' + (owned ? ' owned' : '') + (interdite ? ' locked' : '') + (cherche === g.id ? ' cible' : ''), `<span>${icon(g.id)} ${nomG(g.id)}<small>${detail}</small></span>`);
      if (cherche === g.id) setTimeout(() => row.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
      if (owned) row.appendChild(el('span', 'tag ok', s.aToi));
      else if (interdite) row.appendChild(el('span', 'tag', t().impossibleIci));
      else {
        const assez = j.points >= prix && n < E.REGLES.POCHE_MAX;
        const b = el<HTMLButtonElement>('button', 'buy' + (assez ? '' : ' off'), `${prix} pts`);
        b.onclick = () => h.onBuySeed(g.id); row.appendChild(b);            // le jeu dit pourquoi si ce n'est pas possible
      }
      c.appendChild(row);
    }
    c.appendChild(el('div', 'ttl', s.pots));
    const pp = prixProchainPot(st);
    const row = el('div', 'row', `<span>🪴 ${s.pots} <small>${st.pots.filter(p => p.id < 8).length}/8</small></span>`);
    if (pp === null) row.appendChild(el('span', 'tag ok', s.potsComplets));
    else { const b = el<HTMLButtonElement>('button', 'buy' + (j.points >= pp ? '' : ' off'), `${pp} pts`); b.onclick = () => h.onBuyPot(); row.appendChild(b); }
    c.appendChild(row);
  } else {
    c.appendChild(el('div', 'score', `<div><small>${s.platsOfferts}</small><b>${j.plats_offerts}</b></div><div><small>${s.raresRecues}</small><b>${j.rares_recues}</b></div><div><small>${s.echanges}</small><b>${j.unites_echangees}</b></div>`));
    const carte = (p: E.Plat, ligne: string) => {
      const re = ECO.recette(p.recette);
      const row = el('div', 'row carte');
      row.append(imagePlat(re), el('span', '', `<b>${nomR(re)}</b><small>${ligne}</small>`));
      row.onclick = () => h.onFiche(re.id);
      c.appendChild(row);
    };
    c.appendChild(el('div', 'ttl', s.platsOffertsT));
    if (!st.eco.carnet.length) c.appendChild(el('p', 'empty', s.carnetVide));
    for (const p of [...st.eco.carnet].reverse()) carte(p, `${s.offertA(im.jardins.find(x => x.id === p.a)?.nom ?? '?')} · ${p.jour} · ${p.valeur} pts`);
    // la collection : les 66 recettes, en couleur celles déjà cuisinées, en gris les autres
    const cuisinees = new Set(st.eco.carnet.map(p => p.recette));
    c.appendChild(el('div', 'ttl', s.collection(cuisinees.size, ECO.recettes.length)));
    const grille = el('div', 'collection');
    for (const re of ECO.recettes) {
      const fait = cuisinees.has(re.id);
      const cel = el('div', 'coll' + (fait ? ' fait' : ''));
      cel.append(imagePlat(re, 'collImg'), el('small', '', nomR(re)));
      cel.onclick = () => h.onFiche(re.id);
      grille.appendChild(cel);
    }
    c.appendChild(grille);
  }
  void CATALOG;
}
