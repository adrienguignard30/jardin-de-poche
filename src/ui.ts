import { t, tx, lang, setLang, fmtTime, type Lang } from './i18n';
import { CATALOG, ECO, type GameState, type CharacterDef, type Perso } from './state';
import * as E from './economie';
import { MUSIQUE } from './musique';
import * as EL from './enligne';
import { renderTelephone, ficheRecette, imagePlat, reglagesTel, iconeApp, FONDS, type Onglet, type TelHandlers } from './telephone';

export interface UIHandlers {
  onStart(characterId: string, nickname: string, perso: Perso): void;
  /** Les matières colorables du personnage choisi (nom, couleur actuelle). */
  getCouleurs(characterId: string): { name: string; hex: string }[];
  /** Applique une couleur à une matière du personnage de l'accueil (aperçu en direct). */
  setCouleur(characterId: string, name: string, hex: string): void;
  /** Photo du personnage de l'accueil, en petit carré (dataURL). */
  photo(characterId: string): string;
  onPick(characterId: string): void;
  /** Mode personnalisation : seul ce personnage, en pied (on = true), ou retour à l'accueil (false). */
  onFocus(characterId: string, on: boolean): void;
  onPersoSave(characterId: string, perso: Perso): void;
  onZone(zone: string): void;
  onContinue(perso?: string): void;
  onNewGame(): void;
  onSow(slot: number, plant: string): void;
  onBuySeed(plant: string): void;
  onBuyPot(): void;
  onCuisiner(): void; onOffrir(jardinId: string): void;
  onTroc(donne: E.Ingredient, cherche: E.Ingredient): void; onAccepter(annonceId: string): void; onRetirer(annonceId: string): void;
  onDemain(): void; onChercher(graine: string): void; onFiche(recetteId: string): void; onSemer(graine: string): void; onMontrerPlat(): void; onCompte(): void; onConnecte(): void;
  onRepondre(evId: string, texte: { fr: string; en: string }): void;
  onLang(l: Lang): void;
  onNight(mode: 'auto' | 'day' | 'night'): void;
  onReset(): void;
  onHome(): void;
  onPhoneOpen(open: boolean): void;
  onSheet(open: boolean): void;
  onBubble(slot: number): void;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
/** Un bouton qui agit dès l'appui (pas au relâchement : l'écran peut se redessiner entre les deux et avaler le clic),
 *  affiche tout de suite qu'il travaille, et ignore un deuxième appui pendant ce temps. */
function agir(b: HTMLElement, fn: () => unknown) {
  let occupe = false;
  const go = (e: Event) => {
    if ((e as PointerEvent).button > 0) return;
    e.preventDefault(); if (occupe) return; occupe = true;
    b.classList.add('charge');
    Promise.resolve().then(fn).finally(() => setTimeout(() => { occupe = false; b.classList.remove('charge'); }, 1200));
  };
  b.addEventListener('pointerdown', go); b.addEventListener('click', go);
}
const LISIBLE = 'color:#24313a;background:rgba(36,49,58,.08);border:1px solid rgba(36,49,58,.2);font-weight:600;';
const el = <T extends HTMLElement = HTMLElement>(tag: string, cls = '', html = '') => { const e = document.createElement(tag) as T; if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

const STYLE_PANIER = `
/* ===== le chargement : un croquis du balcon qui se dessine en boucle, des pousses qui grandissent ===== */
#loading .croquis { width: min(320px, 70vw); height: auto; color: #6b4f2a; margin: 6px auto 10px; display: block; opacity: .9; }
#loading .croquis .t { stroke-dasharray: 1200; stroke-dashoffset: 1200; animation: dessine 7s linear infinite; }
#loading .croquis .t2 { animation-delay: .6s; } #loading .croquis .t3 { animation-delay: 1.2s; } #loading .croquis .t4 { animation-delay: 1.9s; } #loading .croquis .t5 { animation-delay: 2.4s; }
#loading .croquis .pousse { stroke: #3f9a3a; stroke-width: 2.6; transform-box: fill-box; transform-origin: 50% 100%; transform: scale(0); animation: pousseCroquis 7s cubic-bezier(.3,1.5,.5,1) infinite; }
#loading .croquis .p2 { animation-delay: .4s; } #loading .croquis .p3 { animation-delay: .8s; }
@keyframes dessine { 0% { stroke-dashoffset: 1200; } 45% { stroke-dashoffset: 0; } 85% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: 1200; } }
@keyframes pousseCroquis { 0%, 38% { transform: scale(0); } 55% { transform: scale(1.05); } 85% { transform: scale(1); } 100% { transform: scale(0); } }
#loading .chantierMot { color: #6b4f2a; font-weight: 700; min-height: 1.4em; }
#loading.chantier { z-index: 45; }

.pill.panier { cursor: pointer; display: inline-flex; align-items: center; gap: 4px; z-index: 6; background: #fff; border: 1px solid rgba(36,49,58,.14); box-shadow: 0 3px 0 rgba(36,49,58,.10), 0 6px 16px rgba(0,0,0,.12); }
.pill.panier .pan { font-size: 18px; } .pill.panier b { font-size: 15px; }
.pill.panier.bump { animation: bumpPanier .35s cubic-bezier(.3,1.8,.5,1); }
@keyframes bumpPanier { 0% { transform: scale(1); } 50% { transform: scale(1.22); } 100% { transform: scale(1); } }
.legumeVole { position: fixed; z-index: 70; pointer-events: none; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; font-size: 34px; filter: drop-shadow(0 4px 6px rgba(0,0,0,.25)); }
.legumeVole img { width: 100%; height: 100%; object-fit: contain; }
.fenPanier { min-width: min(380px, 86vw); }
.fenPanier .grillePanier { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 10px; margin-top: 10px; }
.fenPanier .casePanier { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 6px; background: #fffaf0; border: 1px solid rgba(36,49,58,.08); border-radius: 14px; text-align: center; }
.fenPanier .casePanier img { width: 64px; height: 64px; object-fit: contain; } .fenPanier .casePanier .em { font-size: 40px; line-height: 64px; }
.fenPanier .casePanier b { font-size: 15px; color: #24313a; } .fenPanier .casePanier small { font-size: 12px; color: #5b6b75; }
.fenPanier .casePanier.pourRecette { border: 2px solid #f2c46b; background: #fff7e3; } .fenPanier .tagRecette { font-style: normal; font-size: 10px; font-weight: 800; color: #b07a12; text-transform: uppercase; letter-spacing: .04em; }
@media (max-width: 700px), (orientation: portrait) {
  .pill.recetteHud { flex-wrap: nowrap !important; gap: 6px !important; padding: 6px 10px !important; max-width: calc(100vw - 28px) !important; font-size: 12px !important; }
  .recetteHud:has(b) em { display: none; }
  .recetteHud b { flex-basis: auto !important; flex: 0 1 auto; min-width: 0; max-width: 40vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px !important; }
  .recetteHud span { white-space: nowrap; font-size: 12px !important; }
}
`;
if (typeof document !== 'undefined' && !document.getElementById('stylePanier')) { const st = document.createElement('style'); st.id = 'stylePanier'; st.textContent = STYLE_PANIER; document.head.appendChild(st); }

export class UI {
  root = $('#ui');
  private state: GameState | null = null;
  private bubbles = new Map<number, HTMLElement>();
  private phoneTab: Onglet = 'home';
  coursPrecedent: Record<string, number> = {};
  private toastTimer = 0;
  nightMode: 'auto' | 'day' | 'night' = 'auto';

  constructor(private h: UIHandlers) {
    this.root.innerHTML = `
      <div id="loading" class="overlay">
        <div class="brand"><div class="logo">🪴</div><h1 data-t="title"></h1><p class="tag" data-t="tagline"></p></div>
        <svg class="croquis" viewBox="0 0 320 200" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
<path class="t t1" d="M30 180 L30 60 Q30 40 50 40 L270 40 Q290 40 290 60 L290 180"/>
<path class="t t2" d="M60 70 h60 v45 h-60 z M200 70 h60 v45 h-60 z M90 70 v45 M230 70 v45 M60 92 h60 M200 92 h60"/>
<path class="t t3" d="M20 135 h280 M35 135 v45 M60 135 v45 M85 135 v45 M110 135 v45 M135 135 v45 M160 135 v45 M185 135 v45 M210 135 v45 M235 135 v45 M260 135 v45 M285 135 v45 M20 180 h280"/>
<path class="t t4" d="M70 180 l5 -24 h30 l5 24 z M140 180 l5 -24 h30 l5 24 z M210 180 l5 -24 h30 l5 24 z"/>
<path class="pousse p1" d="M92 156 q-2 -14 6 -22 q-10 2 -14 -8 q12 -2 14 8 q4 -12 14 -10 q-8 6 -10 14"/>
<path class="pousse p2" d="M162 156 q-2 -14 6 -22 q-10 2 -14 -8 q12 -2 14 8 q4 -12 14 -10 q-8 6 -10 14"/>
<path class="pousse p3" d="M232 156 q-2 -14 6 -22 q-10 2 -14 -8 q12 -2 14 8 q4 -12 14 -10 q-8 6 -10 14"/>
<circle class="t t5" cx="40" cy="22" r="9"/><path class="t t5" d="M40 6 v5 M40 33 v5 M24 22 h5 M51 22 h5 M29 11 l3 3 M48 30 l3 3 M51 11 l-3 3 M32 30 l-3 3"/>
</svg>
        <div class="bar"><div class="fill"></div></div><p class="small" id="loadLabel"></p><p class="small chantierMot" id="loadMot"></p>
      </div>
      <div id="start" class="overlay start hidden">
        <div class="langs"><button data-lang="fr">Français</button><button data-lang="en">English</button></div>
        <div class="startTop"><div class="brand"><h1 data-t="title"></h1><p class="tag" data-t="tagline"></p></div></div>
        <div class="sheet hidden" id="sheet"></div>
        <div class="startBottom" id="startBody"></div>
      </div>
      <div id="hud" class="hidden">
        <div class="pill coins"><span class="ico">🪙</span><b id="coins">0</b></div>
        <div class="pill clock" id="clock"><span class="ico" id="clockIco">☀️</span><b id="clockTxt">08:00</b></div>
        <div class="pill seeds" id="seedsPill" title=""></div>
        <div class="pill panier" id="panierPill" title=""><span class="pan">🧺</span><b id="panierNb">0</b></div>
        <div class="pill recetteHud hidden" id="recetteHud"></div>
        <div class="topRight"><div class="pill son" id="sonPill"><button id="btnSon" aria-label="musique"></button><input type="range" id="sonVol" min="0" max="100" step="1"></div><button class="pill icon" id="btnHome" title="">🏠</button><button class="pill icon" id="btnSettings" title="">⚙️</button></div>
        <button class="phoneBtn" id="btnPhone"><span class="ico">📱</span><span class="badge" id="basketBadge">0</span></button>
      </div>
      <div id="bubbles"></div>
      <div id="guide" class="guide hidden"></div>
      <div id="modal" class="modal hidden"><div class="modalBox"></div></div>
      <div id="picker" class="popover hidden"></div>
      <div id="phone" class="phone hidden"><div class="notch"></div><div class="dial"><div class="disc"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="cord"></div></div><div class="stickers"><span>♥</span><span>★</span><span>☮</span></div><div class="screen">
        <div class="statusbar"><b id="telHeure">9:41</b><span class="sbIcons"><svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2" width="3" height="10" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg><svg viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor"/><rect x="2" y="2" width="16" height="8" rx="2"/><rect x="23.5" y="4" width="2" height="4" rx="1"/></svg></span></div>
        <div class="appbar hidden" id="appBar"><button id="appBack"></button><b id="appTitre"></b><span class="apSpace"></span></div>
        <button class="fermerMobile" id="fermerMobile" aria-label="fermer">✕</button>
        <div class="content" id="phoneContent"></div>
        <div class="telAction hidden" id="telAction"></div>
        <div class="telBanner hidden" id="telBanner"></div>
        <button class="home" id="phoneClose" aria-label="home"></button>
      </div></div>
      <div id="settings" class="modal hidden"><div class="card" id="settingsCard"></div></div>
      <div id="toast" class="toast hidden"></div>
      <div id="notifBanner" class="notifBanner hidden"></div>`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach(b => b.onclick = () => { setLang(b.dataset.lang as Lang); this.h.onLang(lang()); this.retranslate(); });
    $('#btnPhone').onclick = () => this.togglePhone();
    $('#phoneClose').onclick = () => this.togglePhone(false);
    $('#appBack').onclick = () => this.ouvrir('home', undefined, 'versGauche');     // « ‹ Accueil » ramène TOUJOURS à l'accueil ; glisser revient d'un cran
    // les gestes d'un vrai téléphone : glisser vers la gauche ou la droite = revenir en arrière ; glisser vers le haut depuis le bas = accueil
    const ecran = $('#phone').querySelector('.screen') as HTMLElement;
    let g0: { x: number; y: number; t: number; bas: boolean; haut: boolean } | null = null;
    ecran.addEventListener('pointerdown', e => { this.toucheTel = Date.now(); if ((e.target as HTMLElement).closest('input, select, textarea, .stepper')) { g0 = null; return; } const r = ecran.getBoundingClientRect(); const ct = $('#phoneContent'); g0 = { x: e.clientX, y: e.clientY, t: performance.now(), bas: e.clientY > r.bottom - 70, haut: e.clientY < r.top + 140 || (ct?.scrollTop ?? 0) <= 0 }; });
    ecran.addEventListener('pointerup', e => {
      if (!g0) return; const dx = e.clientX - g0.x, dy = e.clientY - g0.y, dt = performance.now() - g0.t; const bas = g0.bas, haut = g0.haut; g0 = null;
      if (dt > 700) return;
      if (bas && dy < -50 && Math.abs(dy) > Math.abs(dx)) { if (this.phoneTab !== 'home') this.ouvrir('home'); return; }
      const mobile = window.matchMedia('(max-width: 700px), (max-height: 520px) and (pointer: coarse)').matches;
      if (mobile && haut && dy > 90 && Math.abs(dy) > 1.5 * Math.abs(dx)) { this.togglePhone(false); return; }   // glisser vers le bas : on range le téléphone
      if (Math.abs(dx) > 70 && Math.abs(dx) > 1.6 * Math.abs(dy) && this.phoneTab !== 'home') this.retour();
    });
    ecran.addEventListener('pointercancel', () => { g0 = null; });
    $('#fermerMobile').onclick = () => this.togglePhone(false);
    $('#btnSettings').onclick = () => this.openSettings();
    $('#seedsPill').onclick = () => { this.phoneTab = 'boutique'; this.togglePhone(true); };
    $('#panierPill').onclick = (e) => { e.stopPropagation(); this.montrerPanier(); };
    window.addEventListener('resize', () => this.placerPanier());
    $('#recetteHud').onclick = () => this.ouvrir('recette');
    // la musique : toucher le haut-parleur coupe / remet ; le curseur règle le volume
    const majSon = () => {
      const R = MUSIQUE.R, muet = R.coupe || R.volume === 0;
      $('#btnSon').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor"/>${muet ? '<line x1="16" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="16" y2="15"/>' : '<path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'}</svg>`;
      $('#btnSon').classList.toggle('muet', muet);
      ($('#sonVol') as HTMLInputElement).value = String(Math.round((R.coupe ? 0 : R.volume) * 100));
      $('#sonPill').style.setProperty('--v', `${Math.round((R.coupe ? 0 : R.volume) * 100)}%`);
      if ((this.phoneTab === 'reglages' || this.phoneTab === 'musique') && !$('#phone').classList.contains('hidden')) this.renderPhone(true);
    };
    $('#btnSon').onclick = () => MUSIQUE.basculer();
    ($('#sonVol') as HTMLInputElement).oninput = (e) => MUSIQUE.volume(+(e.target as HTMLInputElement).value / 100);
    MUSIQUE.surChangement(majSon); majSon();
    $('#btnHome').onclick = () => { this.togglePhone(false); this.hidePicker(); $('#hud').classList.add('hidden'); this.h.onHome(); };
    $('#settings').onclick = e => { if (e.target === $('#settings')) $('#settings').classList.add('hidden'); };
    this.retranslate();
  }

  retranslate() {
    const s = t();
    this.root.querySelectorAll<HTMLElement>('[data-t]').forEach(e => { const k = e.dataset.t as keyof typeof s; const v = s[k]; if (typeof v === 'string') e.textContent = v; });
    this.root.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === lang()));
    $('#appBack').textContent = '‹ ' + s.accueilTel;
    $('#phoneClose').innerHTML = `<span>${s.fermerTel}</span>`;
    $('#btnSettings').title = s.settings; $('#btnHome').title = s.home; $('#seedsPill').title = s.seeds;
    if (!$('#start').classList.contains('hidden')) this.renderStart(this.hasSave);
    if (this.sheetId && !$('#sheet').classList.contains('hidden')) this.showSheet(this.sheetId);
    if (!$('#phone').classList.contains('hidden')) this.renderPhone();
  }

  // ---------- chargement
  private motsT = 0;
  setProgress(done: number, total: number, label: string) {
    $('#loading .fill').style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
    $('#loadLabel').textContent = label ? `${t().loading} ${label}` : t().loading;
    this.motsDuChantier();
  }
  /** Pendant un chargement, le croquis se dessine en boucle et un mot change toutes les 2,5 s : on voit que ça vit. */
  private motsDuChantier() {
    const mots = t().chantierMots, e = document.getElementById('loadMot'); if (!e) return;
    const maj = () => { e.textContent = mots[Math.floor(Date.now() / 2500) % mots.length]; };
    maj(); clearInterval(this.motsT); this.motsT = window.setInterval(maj, 2500);
  }
  /** L'entrée dans une partie : le croquis par-dessus l'accueil, le temps que la maison se construise. */
  chantier(on: boolean, nom = '') {
    const l = $('#loading');
    if (on) { l.classList.remove('hidden'); l.classList.add('chantier'); this.setProgress(0, 1, nom); }
    else { l.classList.add('hidden'); l.classList.remove('chantier'); clearInterval(this.motsT); }
  }
  private hasSave = false;
  private savedCharName = '';
  showStart(hasSave: boolean, savedCharName = '') {
    this.hasSave = hasSave; this.savedCharName = savedCharName;
    $('#loading').classList.add('hidden');
    $('#start').classList.remove('hidden');
    // rien du jeu ne reste à l'écran : ni guide, ni bulles, ni cartes, ni téléphone
    this.guideHide(); this.hideCard(); this.hidePicker(); $('#toast').classList.add('hidden'); $('#phone').classList.add('hidden');
    for (const b of this.bubbles.values()) b.style.display = 'none';
    this.renderStart(hasSave);
    $('#sheet').classList.add('hidden'); $('#sheet').classList.remove('perso'); $('#start .startTop').classList.remove('hidden');
    $('#startBody').classList.remove('hidden');
  }
  private chosen = 'lea';
  private confirme = false;
  private perso: Record<string, Perso> = {};
  /** Les personnages qui ont déjà une partie (date de sauvegarde). */
  parties: Record<string, number> = {};
  private glisserAccueil = false;
  private activerGlisserAccueil() {
    if (this.glisserAccueil) return; this.glisserAccueil = true;
    let d0: { x: number; y: number; t: number } | null = null;
    window.addEventListener('touchstart', e => { if ($('#start').classList.contains('hidden') || (e.target as HTMLElement).closest('button, input, .sheet .fl')) { d0 = null; return; } d0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() }; }, { passive: true });
    window.addEventListener('touchend', e => {
      if (!d0 || $('#start').classList.contains('hidden') || $('#sheet').classList.contains('perso')) { d0 = null; return; }
      const t = e.changedTouches[0], dx = t.clientX - d0.x, dy = t.clientY - d0.y, dt = performance.now() - d0.t; d0 = null;
      if (dt < 700 && Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) this.changerPerso(dx < 0 ? 1 : -1);
    }, { passive: true });
  }
  /** Le titre de l'accueil : les lettres sortent de terre une à une, comme des pousses, puis une feuille apparaît. */
  private titrePousse() {
    for (const h of Array.from(this.root.querySelectorAll('#start h1[data-t="title"]')) as HTMLElement[]) {
      if (h.dataset.pousse === h.textContent) continue;
      const txt = h.textContent ?? ''; h.dataset.pousse = txt; h.setAttribute('aria-label', txt);
      let k = 0;
      h.innerHTML = `<span class="terre"></span>` + [...txt].map((ch, i) => {
        if (ch === ' ') return '<span class="esp"> </span>';
        const d = (.55 + i * .09).toFixed(2), feuille = (k++ % 3 === 1) ? ' feuille' : '';
        return `<span class="lettre${feuille}" style="--d:${d}s">${ch}</span>`;
      }).join('');
    }
  }
  private renderStart(hasSave: boolean) {
    this.activerGlisserAccueil(); this.majCompte(); this.chargerPersos(); requestAnimationFrame(() => this.titrePousse());
    const s = t();
    const body = $('#startBody');
    body.innerHTML = '';
    // le mode démo (tout 90 fois plus vite), en haut à côté des langues, visible dès l'accueil
    const demo = new URLSearchParams(location.search).get('demo') === '1';
    let d = document.getElementById('demoBtn') as HTMLButtonElement | null;
    if (!d) { d = el<HTMLButtonElement>('button', 'demoBtn'); d.id = 'demoBtn'; $('#start').appendChild(d); }
    d.className = 'demoBtn' + (demo ? ' active' : ''); d.textContent = demo ? s.demoOn : s.demoJury; d.title = s.demoOff;
    d.onclick = () => { const u = new URL(location.href); if (demo) u.searchParams.delete('demo'); else u.searchParams.set('demo', '1'); location.href = u.toString(); };
    if (hasSave) {                                                      // la règle des jeux : « Continuer » toujours en premier
      const b = el('button', 'primary vert', `▶ ${s.continueWith(this.savedCharName || s.continue_)}`); agir(b, () => this.h.onContinue()); body.appendChild(b);
      body.appendChild(el('p', 'hint', s.ouAutrePerso));
      return;
    }
    body.appendChild(el('p', 'hint', s.chooseTouch));
    const row = el('div', 'startRow');
    const nameInput = el<HTMLInputElement>('input', 'nick');
    nameInput.placeholder = s.yourNick; nameInput.maxLength = 18;
    const go = el('button', 'primary big', s.play);
    go.onclick = () => { const c = CATALOG.characters.find(x => x.id === this.chosen)!; this.h.onStart(this.chosen, nameInput.value.trim(), this.perso[this.chosen] ?? { prenom: nameInput.value.trim() || tx(c.name), age: c.age, metier: tx(c.job), couleurs: {} }); };
    row.append(nameInput, go);
    body.appendChild(row);
  }
  /** Fiche d'un personnage, ouverte quand on le touche sur l'accueil. */
  private sheetId = '';
  /** Le compte : jouer tout de suite (invité) ou pseudo + mot de passe (8 caractères minimum). */
  compte() {
    const s = t(), e = EL.etatCompte();
    const c = el('div', 'fenCompte');
    c.appendChild(el('h3', '', s.compteT));
    if (e.connecte && !e.invite) {
      c.appendChild(el('p', 'q', s.connecteComme(e.pseudo ?? '')));
      const b = el('button', 'ghost', s.deconnecterBtn); b.style.cssText = LISIBLE;
      b.onclick = async () => { await EL.seDeconnecter(); this.fermerModal(); this.majCompte(); };
      c.appendChild(b); this.modal(c, true); return;
    }
    if (!e.connecte) {
      const tout = el('button', 'primary', s.jouerTout); tout.onclick = () => this.fermerModal();
      c.append(tout, el('p', 'small', s.jouerToutAide));
    } else c.appendChild(el('p', 'small', s.inviteEnCours));
    let mode: 'creer' | 'connecter' = 'creer';
    const og = el('div', 'ongletsCompte');
    const o1 = el('button', 'og on', s.creerCompteT), o2 = el('button', 'og', s.dejaCompte);
    og.append(o1, o2); c.appendChild(og);
    const ps = el<HTMLInputElement>('input', 'champ'); ps.placeholder = s.pseudoT; ps.autocomplete = 'username'; ps.maxLength = 20;
    const infoP = el('p', 'small aideChamp', s.pseudoAide);
    const mdp = el<HTMLInputElement>('input', 'champ'); mdp.type = 'password'; mdp.placeholder = s.mdpT; mdp.autocomplete = 'new-password'; mdp.maxLength = 72;
    const infoM = el('p', 'small aideChamp', `${s.mdpAide} <b class="cpt">0/8</b>`);
    const err = el('p', 'small warn', '');
    const go = el('button', 'primary', s.creerBtn);
    c.append(ps, infoP, mdp, infoM, err, go);
    const choisir = (m: 'creer' | 'connecter') => { mode = m; o1.classList.toggle('on', m === 'creer'); o2.classList.toggle('on', m === 'connecter'); go.textContent = m === 'creer' ? s.creerBtn : s.connecterBtn; mdp.autocomplete = m === 'creer' ? 'new-password' : 'current-password'; infoP.textContent = s.pseudoAide; err.textContent = ''; };
    o1.onclick = () => choisir('creer'); o2.onclick = () => choisir('connecter');
    let t0 = 0;
    ps.oninput = () => {                                                  // pseudo libre ? (vérifié pendant la frappe)
      clearTimeout(t0); const v = ps.value;
      if (mode !== 'creer') return;
      if (!EL.pseudoValide(v)) { infoP.textContent = s.pseudoAide; infoP.className = 'small aideChamp'; return; }
      t0 = window.setTimeout(async () => { const ok = await EL.pseudoDisponible(v); if (ps.value !== v) return; infoP.textContent = ok ? s.pseudoLibre : s.pseudoPris; infoP.className = 'small aideChamp ' + (ok ? 'ok' : 'warn'); }, 350);
    };
    mdp.oninput = () => { const n = mdp.value.length; const cpt = infoM.querySelector('.cpt') as HTMLElement; cpt.textContent = n >= 8 ? '✓' : `${n}/8`; cpt.className = 'cpt' + (n >= 8 ? ' ok' : ''); };
    agir(go, async () => {
      err.textContent = '';
      const nom = this.state?.nickname || this.state?.perso?.prenom || 'Jardinier';
      let r: string | null;
      try { r = mode === 'creer' ? await EL.creerCompte(ps.value, mdp.value, nom, await EL.jetonAntiRobot()) : await EL.seConnecter(ps.value, mdp.value, await EL.jetonAntiRobot()); }
      catch (e) { r = String((e as Error)?.message ?? e); }
      if (r) { err.textContent = ''; void err.offsetWidth; err.textContent = s.errCompte[r] ?? (r.toLowerCase().includes('captcha') ? `${s.errCompte.robot} (${r})` : r); return; }   // le détail aide à trouver la cause
      this.fermerModal(); this.toast(mode === 'creer' ? s.compteOk : s.connexionOk, 3500, true); this.majCompte();
      if (mode === 'connecter') this.h.onConnecte();
    });
    this.modal(c, true);
  }
  /** La pastille compte de l'accueil : « 👤 Se connecter » ou « 👤 pseudo ». */
  majCompte() {
    if (!EL.EN_LIGNE) return;
    let b = document.getElementById('compteBtn') as HTMLButtonElement | null;
    if (!b) { b = el<HTMLButtonElement>('button', 'compteBtn'); b.id = 'compteBtn'; $('#start').appendChild(b); b.onclick = () => this.compte(); }
    const e = EL.etatCompte();
    b.textContent = `👤 ${e.connecte && !e.invite ? e.pseudo : t().compteT}`;
  }
  /** Accueil sur mobile : le personnage suivant ou précédent (glisser, flèches, points). */
  private changerPerso(sens: number) {
    const ids = CATALOG.characters.map(c => c.id);
    const i = Math.max(0, ids.indexOf(this.sheetId || this.chosen));
    const id = ids[(i + sens + ids.length) % ids.length];
    this.h.onPick(id); this.showSheet(id);
  }
  private carrousel(id: string): HTMLElement {
    const ids = CATALOG.characters.map(c => c.id);
    const nav = el('div', 'carrousel');
    const g = el('button', 'fl', '‹'); g.onclick = () => this.changerPerso(-1);
    const pts = el('div', 'points', ids.map(x => `<i class="${x === id ? 'on' : ''}"></i>`).join(''));
    const d = el('button', 'fl', '›'); d.onclick = () => this.changerPerso(1);
    nav.append(g, pts, d);
    return nav;
  }
  showSheet(id: string) {
    const c = CATALOG.characters.find(x => x.id === id); if (!c) return;
    this.sheetId = id; this.chosen = id;
    const s = t();
    const sh = $('#sheet'); sh.classList.remove('perso');
    const line = (k: string, v: string) => v ? `<div class="fl"><span>${k}</span><b>${v}</b></div>` : '';
    const nom = this.perso[id]?.prenom || tx(c.name);
    const aUnePartie = !!this.parties[id];
    sh.innerHTML = `<button class="x" aria-label="close">×</button><h3>${nom}</h3>`;
    const play = el('button', 'primary vert grand', aUnePartie ? `▶ ${s.reprendreMaPartie}` : `🌱 ${s.jouerAvec(nom)}`);
    agir(play, () => aUnePartie ? this.h.onContinue(id) : this.lancer(id));
    const perso = el('button', 'ghost', `🎨 ${s.personnaliser}`); perso.style.cssText = LISIBLE; perso.onclick = () => this.showCustomize(id);
    const row = el('div', 'actionsFiche'); row.append(play, perso); sh.appendChild(row);
    sh.insertAdjacentHTML('beforeend', line(s.fAge, c.age ? s.years(c.age) : '') + line(s.fJob, tx(c.job)) + line(s.fAddress, tx(c.address)) + line(s.fView, tx(c.tagline))
      + (c.likes ? `<div class="fl likes"><span>${s.fLikes}</span><p>${tx(c.likes)}</p></div>` : ''));
    sh.prepend(this.carrousel(id));                                  // sur mobile : ‹ ● ○ ○ › en haut de la fiche
    (sh.querySelector('.x') as HTMLButtonElement).onclick = () => { sh.classList.add('hidden'); $('#startBody').classList.remove('hidden'); this.h.onSheet(false); };
    sh.classList.remove('hidden');
    if (window.innerWidth < 640 || window.innerHeight > window.innerWidth) $('#startBody').classList.add('hidden');
    this.h.onSheet(true);
  }
  private lancer(id: string) {
    const s = t(), c = CATALOG.characters.find(x => x.id === id)!;
    if (this.parties[id] && !this.confirme) {
      const c0 = el('div', 'platPret');
      c0.appendChild(el('h3', '', s.newGame)); c0.appendChild(el('p', 'q', s.resetConfirm));
      const oui = el('button', 'primary', s.recommencer); agir(oui, () => { this.fermerModal(); this.confirme = true; this.lancer(id); });
      const non = el('button', 'ghost small', s.annuler); non.style.cssText = LISIBLE; non.onclick = () => this.fermerModal();
      c0.append(oui, non); this.modal(c0, false); return;
    }
    this.confirme = false;
    const perso: Perso = this.perso[id] ?? { prenom: tx(c.name), age: c.age, metier: tx(c.job), couleurs: {} };
    if (!perso.photo) perso.photo = this.h.photo(id);
    this.h.onStart(id, perso.prenom.trim(), perso);
  }
  /** Personnaliser : seul le personnage, en pied, et un panneau doux : prénom, apparence, jouer. Âge et métier en second. */
  showCustomize(id: string) {
    const c = CATALOG.characters.find(x => x.id === id); if (!c) return;
    const s = t();
    this.h.onFocus(id, true);
    $('#startBody').classList.add('hidden'); $('#start .startTop').classList.add('hidden');
    const sh = $('#sheet'); sh.classList.remove('hidden'); sh.classList.add('perso');
    sh.innerHTML = '';
    const perso: Perso = this.perso[id] ?? { prenom: tx(c.name), age: c.age, metier: tx(c.job), couleurs: {} };
    this.perso[id] = perso;
    const back = el('button', 'ghost small back', `← ${s.retour}`); back.style.cssText = LISIBLE;
    back.onclick = () => { this.h.onFocus(id, false); sh.classList.remove('perso'); $('#start .startTop').classList.remove('hidden'); this.showSheet(id); };
    const accueil = el('button', 'ghost small back', `⌂ ${s.changerPerso}`); accueil.style.cssText = LISIBLE;
    accueil.onclick = () => { this.h.onFocus(id, false); sh.classList.remove('perso'); sh.classList.add('hidden'); $('#start .startTop').classList.remove('hidden'); $('#startBody').classList.remove('hidden'); this.h.onSheet(false); };
    const haut = el('div', 'persoHaut'); haut.append(back, accueil); sh.appendChild(haut);
    const form = el('div', 'persoForm');
    const champ = (label: string, value: string, on: (v: string) => void, type = 'text') => { const w = el('label', 'pf', `<span>${label}</span>`); const i = el<HTMLInputElement>('input'); i.type = type; i.value = value; i.maxLength = 24; i.oninput = () => on(i.value); w.appendChild(i); return w; };
    form.appendChild(champ(s.persoPrenom, perso.prenom, v => { perso.prenom = v; }));
    const PAL: Record<string, string[]> = {
      peau: ['#f6d9c3', '#e8b898', '#d09a6e', '#b57a4f', '#8d5a3a', '#5c3a26'],
      cheveux: ['#1d1a1a', '#4a2f22', '#8a5a2b', '#c98d4b', '#e6c27a', '#b8b8b8', '#c94f3a', '#e28ac4'],
      haut: ['#f4f1ea', '#2b3a67', '#c94f3a', '#e8b95a', '#4f8a3a', '#6b4b8f', '#e28ac4', '#2f2f2f', '#5aa9c9', '#f08a24'],
      bas: ['#2b3a67', '#5b6b7a', '#2f2f2f', '#c9b48f', '#4f8a3a', '#7a3b2e', '#f4f1ea', '#e28ac4'],
      chaussures: ['#2f2f2f', '#7a3b2e', '#f4f1ea', '#c94f3a', '#2b3a67', '#e8b95a'],
    };
    const labels: Record<string, string> = { peau: s.zPeau, cheveux: s.zCheveux, haut: s.zHaut, bas: s.zBas, chaussures: s.zChaussures };
    const mats = this.h.getCouleurs(id);
    const zones = mats.filter(m => /^mat_\w+_(peau|cheveux|haut|bas|chaussures)(\.\d{3})?$/.test(m.name));
    const liste = zones.length ? zones : mats.slice(0, 4);
    for (const m of liste) {
      const z = m.name.replace(/\.\d{3}$/, '').split('_').pop()!;
      const row = el('div', 'pf zone', `<span>${labels[z] ?? s.persoCouleurNom(liste.indexOf(m) + 1)}</span>`);
      const pal = el('div', 'palette');
      const choisir = (hex: string | null) => { this.h.onZone(z); console.info('[couleur]', m.name, hex ?? 'origine'); if (hex) perso.couleurs[m.name] = hex; else delete perso.couleurs[m.name]; this.h.setCouleur(id, m.name, hex ?? ''); pal.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', (x as HTMLElement).dataset.hex === (hex ?? ''))); };
      const orig = el('button', 'sw orig', '↺'); orig.title = s.zReset; orig.dataset.hex = ''; orig.onclick = () => choisir(null); pal.appendChild(orig);
      for (const hex of PAL[z] ?? PAL.haut) { const b = el('button', 'sw' + (perso.couleurs[m.name] === hex ? ' on' : '')); b.style.background = hex; b.dataset.hex = hex; b.onclick = () => choisir(hex); pal.appendChild(b); }
      if (z !== 'peau') { const arc = el('button', 'sw arc' + (perso.couleurs[m.name] === 'arc' ? ' on' : ''), ''); arc.title = '🌈'; arc.dataset.hex = 'arc'; arc.onclick = () => choisir('arc'); pal.appendChild(arc); }
      if (z !== 'peau') { const inp = el<HTMLInputElement>('input', 'sw free'); inp.type = 'color'; inp.title = s.zAutre; inp.value = perso.couleurs[m.name] && perso.couleurs[m.name] !== 'arc' ? perso.couleurs[m.name] : m.hex; inp.oninput = () => choisir(inp.value); pal.appendChild(inp); }
      row.addEventListener('pointerdown', () => this.h.onZone(z)); row.appendChild(pal); form.appendChild(row);
    }
    const more = el('button', 'ghost small', s.plus); more.style.cssText = LISIBLE;
    const moreBox = el('div', 'moreBox hidden');
    moreBox.append(champ(s.persoAge, String(perso.age ?? ''), v => { perso.age = parseInt(v) || undefined; }, 'number'), champ(s.persoMetier, perso.metier ?? '', v => { perso.metier = v; }));
    more.onclick = () => moreBox.classList.toggle('hidden');
    form.append(more, moreBox);
    sh.appendChild(form);
    const valider = el('button', 'primary', `✓ ${s.valider}`);
    agir(valider, () => {
      this.sauverPersos();                                              // gardé sur l'appareil…
      this.h.onPersoSave(id, perso);                                    // …et dans la partie de ce personnage s'il en a une
      this.h.onFocus(id, false); sh.classList.remove('perso'); $('#start .startTop').classList.remove('hidden');
      this.showSheet(id); this.toast(s.persoEnregistre, 2200, true);
    });
    sh.appendChild(valider);
  }
  /** Les personnalisations (prénom, couleurs, âge, métier), gardées sur l'appareil pour chaque personnage. */
  private sauverPersos() { try { localStorage.setItem('jdp.persos', JSON.stringify(this.perso)); } catch { /* ignore */ } }
  private chargerPersos() { try { const p = JSON.parse(localStorage.getItem('jdp.persos') || '{}'); if (p && typeof p === 'object') Object.assign(this.perso, p); } catch { /* ignore */ } }
  hideStart() { $('#start').classList.add('hidden'); $('#hud').classList.remove('hidden'); this.hideNameTags(); requestAnimationFrame(() => this.placerPanier()); setTimeout(() => this.placerPanier(), 400); }

  // ---------- HUD
  bind(state: GameState) { this.state = state; this.refresh(); }
  refresh() {
    if (!this.state) return;
    this.badges(); this.miniTel(); this.placerBulles();
    const j = this.state.eco.jardin, im = this.state.eco.immeuble;
    if (!this.compteurAnime) $('#coins').textContent = String(j.points);
    const ouvertes = im.annonces.filter(a => !a.accepte_par && a.de !== j.id).length;
    const alerte = E.peutCuisiner(j, ECO) || !!this.state.eco.platEnCours;
    void ouvertes;
    // les variétés dans la poche, sous les points
    const rh = $('#recetteHud');
    if (j.recette) {
      const re = ECO.recette(j.recette.recette);
      const nomR = lang() === 'en' ? re.nom_en : re.nom_fr;
      rh.innerHTML = (j.recette.faite ? `<em>${t().recetteHudFaite}</em>`
        : `<em>${t().recetteHud}</em><b>${nomR}</b>` + re.ingredients.map(i => { const n = Math.min(i.quantite, j.panier[i.graine] ?? 0); return `<span class="${n >= i.quantite ? 'ok' : ''}">${icon(i.graine)} ${n}/${i.quantite}</span>`; }).join('')) + '<i class="chev">›</i>';
      rh.classList.remove('hidden');
    } else rh.classList.add('hidden');
    const poche = Object.keys(j.poche);
    $('#seedsPill').innerHTML = `<em>${t().seeds}</em>` + (poche.length ? poche.map(k => `<span>${icon(k)}<b>${j.panier[k] ?? 0}</b></span>`).join('') : `<span>🌱<b>0</b></span>`) + '<i class="chev">›</i>';
    if (!this.panierAnime) $('#panierNb').textContent = String(Object.values(j.panier).reduce((a, b) => a + Math.max(0, b), 0));
    this.placerPanier();
    $('#btnPhone').classList.toggle('alert', alerte);
    let hint = document.getElementById('sellHint');
    if (!hint) { hint = el('div', 'sellHint hidden'); hint.id = 'sellHint'; $('#hud').appendChild(hint); hint.onclick = () => { this.phoneTab = 'recette'; this.togglePhone(true); }; }
    hint.textContent = this.state.eco.platEnCours ? t().platPret('') : `${t().cuisiner}`;
    hint.classList.toggle('hidden', !alerte || !$('#phone').classList.contains('hidden'));
    if (!$('#phone').classList.contains('hidden')) this.renderPhone();
  }
  /** Heure du jeu en haut de l'écran. */
  clock(hour: number, night: number) {
    const h = Math.floor(hour) % 24, m = Math.floor((hour % 1) * 60);
    if (lang() === 'en') { const h12 = h % 12 === 0 ? 12 : h % 12; $('#clockTxt').textContent = `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; }
    else $('#clockTxt').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    $('#clockIco').textContent = night > .5 ? '🌙' : hour < 9 || hour > 18 ? '🌅' : '☀️';
  }
  private file: { msg: string; ms: number; onglet?: Onglet; detail?: string }[] = []; private fileActive = false;
  /** Messages importants (cadeaux, trocs, plats reçus) : l'un après l'autre, jamais écrasés. */
  annonce(msg: string, ms = 4500, onglet?: Onglet) {
    this.file.push({ msg, ms, onglet });
    if (this.fileActive) return;
    const next = () => {
      const m = this.file.shift(); if (!m) { this.fileActive = false; return; }
      this.fileActive = true;
      this.toast(m.onglet ? `${m.msg}  ›  ${t().voir}` : m.msg, m.ms, true);
      const tt = $('#toast'); tt.classList.toggle('lien', !!m.onglet);
      tt.onclick = m.onglet ? () => { tt.classList.add('hidden'); this.ouvrir(m.onglet!); } : null;
      setTimeout(next, m.ms + 250);
    };
    next();
  }
  /** Sur mobile : le petit message et la bulle d'aide se placent sous les pastilles, l'un sous l'autre, jamais par-dessus. */
  placerBulles() {
    const mobile = window.matchMedia('(max-width: 700px), (max-height: 520px) and (pointer: coarse)').matches;
    const tt = $('#toast'), g = $('#guide');
    if (!mobile) { tt.style.top = ''; g.style.top = ''; return; }
    let y = 0;
    for (const id of ['#coinsPill', '#seedsPill', '#recetteHud']) { const e = this.root.querySelector(id) as HTMLElement | null; if (e && e.offsetParent) y = Math.max(y, e.getBoundingClientRect().bottom); }
    y = Math.max(y, 120) + 8;
    if (!tt.classList.contains('hidden')) { tt.style.top = `${y}px`; y = tt.getBoundingClientRect().bottom + 6; }
    g.style.top = `${y}px`;
  }
  toast(msg: string, ms = 2200, prioritaire = false) {
    if (!$('#start').classList.contains('hidden')) return;
    if (this.fileActive && !prioritaire) return;                     // un message important est à l'écran : on ne l'écrase pas
    const tt = $('#toast'); tt.textContent = msg; tt.classList.remove('hidden'); tt.onclick = () => { tt.classList.add('hidden'); this.placerBulles(); }; this.placerBulles();
    clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => { tt.classList.add('hidden'); this.placerBulles(); }, ms);
  }
  welcome(lines: string[]) {
    const s = t();
    this.toast(`${s.welcomeBack} ${lines.join(' · ')}`, 5000);
  }

  // ---------- bulles au-dessus des pots
  bubble(slot: number, x: number, y: number, text: string, cls: string, visible: boolean) {
    let b = this.bubbles.get(slot);
    if (!b) { b = el('div', 'bubble'); b.onclick = () => this.h.onBubble(slot); $('#bubbles').appendChild(b); this.bubbles.set(slot, b); }
    b.style.display = visible && text ? 'block' : 'none';
    if (text) { if (b.textContent !== text) b.textContent = text; const cn = 'bubble ' + cls; if (b.className !== cn) b.className = cn; b.style.left = `${x}px`; b.style.top = `${y}px`; }
  }
  clearBubble(slot: number) { const b = this.bubbles.get(slot); if (b) b.style.display = 'none'; }
  private tags = new Map<string, HTMLElement>();
  /** Étiquettes prénom + âge au-dessus des personnages de l'accueil. */
  nameTags(list: { id: string; x: number; y: number; visible: boolean }[], chosen: string) {
    const s = t();
    const brand0 = this.root.querySelector('#start .startTop .brand') as HTMLElement | null;
    const rb0 = brand0?.getBoundingClientRect();
    const sousTitre0 = rb0 && rb0.height > 0 && !$('#start').classList.contains('hidden') ? rb0.bottom + 8 : 0;
    for (const l of list) {
      let e = this.tags.get(l.id);
      if (!e) { e = el('div', 'nameTag'); $('#bubbles').appendChild(e); this.tags.set(l.id, e); }
      const c = CATALOG.characters.find(x => x.id === l.id);
      const html = `${c ? tx(c.name) : l.id}<small>${c?.age ? s.years(c.age) : ''}</small>`; if (e.innerHTML !== html) e.innerHTML = html;
      const cls = 'nameTag' + (l.id === chosen ? ' chosen' : ''); if (e.className !== cls) e.className = cls;
      const sousTitre = sousTitre0;
      const y = Math.max(l.y, sousTitre + 40);                           // l'étiquette fait ~40 px de haut, tracée au-dessus du point
      e.style.display = l.visible ? 'block' : 'none';
      e.style.transform = `translate(${l.x}px, ${y}px) translate(-50%, -100%)`;
    }
  }
  hideNameTags() { for (const e of this.tags.values()) e.style.display = 'none'; }
  private cardTimer = 0;
  /** Petite carte d'information posée près d'un point de l'écran (pot, panier). */
  card(x: number, y: number, html: string, ms = 4000, dessous = false) {
    let c = document.getElementById('infoCard');
    if (!c) { c = el('div', 'infoCard'); c.id = 'infoCard'; this.root.appendChild(c); }
    c.innerHTML = html; c.classList.remove('hidden');
    const w = Math.min(260, window.innerWidth - 24);
    c.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, x - w / 2))}px`;
    c.style.top = dessous ? `${Math.min(window.innerHeight - c.offsetHeight - 12, y + 14)}px` : `${Math.max(64, y - 16 - c.offsetHeight)}px`;
    clearTimeout(this.cardTimer);
    if (ms > 0) this.cardTimer = window.setTimeout(() => c!.classList.add('hidden'), ms);
  }
  hideCard() { document.getElementById('infoCard')?.classList.add('hidden'); }
  private compteurAnime = false;
  private panierAnime = false;
  /** Les légumes récoltés volent depuis le balcon jusqu'au panier de l'écran (images des légumes), puis il rebondit. */
  volerAuPanier(id: string, x: number, y: number, n: number) {
    const cible = $('#panierPill').getBoundingClientRect();
    const tx_ = cible.left + cible.width / 2, ty_ = cible.top + cible.height / 2;
    const nb = $('#panierNb'), depart = +(nb.textContent || 0);
    this.panierAnime = true;
    const total = () => Object.values(this.state?.eco.jardin.panier ?? {}).reduce((a, b) => a + Math.max(0, b), 0);
    for (let i = 0; i < n; i++) {
      const c = el('div', 'legumeVole'); this.root.appendChild(c);
      const im = el<HTMLImageElement>('img', ''); im.src = `ui/recoltes/${id}.png`; im.alt = '';
      im.onerror = () => { im.remove(); c.textContent = icon(id); };
      c.appendChild(im);
      const dx = (Math.random() - .5) * 90, dy = -40 - Math.random() * 50;
      c.style.left = `${x}px`; c.style.top = `${y}px`;
      c.animate([
        { transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.15)`, opacity: 1, offset: .35 },
        { transform: `translate(calc(-50% + ${tx_ - x}px), calc(-50% + ${ty_ - y}px)) scale(.45)`, opacity: .9 },
      ], { duration: 950 + i * 90, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' }).onfinish = () => {
        c.remove();
        nb.textContent = String(i === n - 1 ? total() : Math.max(depart, Math.min(total(), depart + i + 1)));
        const pill = $('#panierPill'); pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
        if (i === n - 1) this.panierAnime = false;
      };
    }
  }
  /** Le panier se range juste à droite de la pastille des graines (jamais sur les pièces) ; s'il n'y a pas la place, dessous. */
  placerPanier() {
    const pp = this.root.querySelector('#panierPill') as HTMLElement | null, gr = this.root.querySelector('#seedsPill') as HTMLElement | null;
    if (!pp || !gr) return;
    const r = gr.getBoundingClientRect(), w = pp.getBoundingClientRect().width || 70;
    if (!r.width || !r.height) return;                                   // pastille des graines pas encore affichée
    pp.style.position = 'fixed'; pp.style.right = 'auto'; pp.style.bottom = 'auto';
    if (r.right + 8 + w <= window.innerWidth - 8) { pp.style.left = `${Math.round(r.right + 8)}px`; pp.style.top = `${Math.round(r.top)}px`; }
    else { pp.style.left = `${Math.round(r.left)}px`; pp.style.top = `${Math.round(r.bottom + 8)}px`; }
  }
  /** Ce qu'il y a dans le panier : l'image et le nom de chaque légume, avec la quantité. */
  montrerPanier() {
    const s = t(), j = this.state?.eco.jardin; if (!j) return;
    const items = Object.entries(j.panier).filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1]);
    const c = el('div', 'fenPanier');
    c.appendChild(el('h3', '', `🧺 ${s.monPanier}`));
    if (!items.length) c.appendChild(el('p', 'small', s.panierVide));
    const g = el('div', 'grillePanier');
    for (const [id, q] of items) {
      const pl = CATALOG.plants.find(p => p.id === id);
      const cel = el('div', 'casePanier');
      const im = el<HTMLImageElement>('img', ''); im.src = `ui/recoltes/${id}.png`; im.alt = '';
      im.onerror = () => im.replaceWith(el('span', 'em', icon(id)));
      cel.append(im, el('b', '', `×${q}`), el('small', '', pl ? tx(pl.name) : id));
      g.appendChild(cel);
    }
    c.appendChild(g);
    this.modal(c, true);
  }
  /** Des pièces partent de (x, y) et volent jusqu'au compteur ; il compte en montant, puis rebondit. */
  piecesVolent(x: number, y: number, de: number, a: number, fin?: () => void) {
    const cible = $('#coins').getBoundingClientRect();
    const tx_ = cible.left + cible.width / 2, ty_ = cible.top + cible.height / 2;
    const n = Math.min(12, Math.max(5, Math.round((a - de) / 3)));
    this.compteurAnime = true; $('#coins').textContent = String(de);
    for (let i = 0; i < n; i++) {
      const c = el('div', 'piece'); this.root.appendChild(c);
      const dx = (Math.random() - .5) * 80, dy = -30 - Math.random() * 60;
      c.style.left = `${x}px`; c.style.top = `${y}px`;
      c.animate([
        { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1)`, opacity: 1, offset: .3 },
        { transform: `translate(calc(-50% + ${tx_ - x}px), calc(-50% + ${ty_ - y}px)) scale(.7)`, opacity: 1 },
      ], { duration: 900 + i * 70, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' }).onfinish = () => {
        c.remove();
        const v = Math.round(de + (a - de) * (i + 1) / n);
        $('#coins').textContent = String(v);
        const pill = $('#coins').parentElement!; pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
        if (i === n - 1) { this.compteurAnime = false; $('#coins').textContent = String(a); fin?.(); }
      };
    }
  }
  /** Une fenêtre au milieu de l'écran (fiche recette, plat prêt). */
  modal(contenu: HTMLElement, fermable = true) {
    const m = $('#modal'), box = m.querySelector('.modalBox') as HTMLElement;
    box.innerHTML = ''; box.appendChild(contenu);
    if (fermable) { const x = el('button', 'x', '×'); x.onclick = () => this.fermerModal(); box.prepend(x); m.onclick = (e) => { if (e.target === m) this.fermerModal(); }; }
    else m.onclick = null;
    m.classList.remove('hidden');
  }
  fermerModal() { $('#modal').classList.add('hidden'); }
  /** La fiche d'une recette, à la demande. */
  fiche(id: string) { this.modal(ficheRecette(ECO.recette(id))); }
  /** Le plat vient d'être cuisiné : il apparaît à l'écran, avec son nom, et on choisit à qui l'offrir. */
  platPret(recetteId: string, voisins: { id: string; nom: string; icons: string }[], offrir: (id: string) => void, plusTard?: () => void) {
    const s = t(), re = ECO.recette(recetteId);
    const c = el('div', 'platPret');
    c.appendChild(el('small', '', s.tuAsCuisine));
    c.appendChild(el('h3', '', lang() === 'en' ? re.nom_en : re.nom_fr));
    const im = imagePlat(re, 'ficheImg'); im.onclick = () => this.fiche(re.id); c.appendChild(im);
    c.appendChild(el('p', 'q', s.aQuiOffrir));
    for (const v of voisins) { const b = el('button', 'seed', `<span>${s.offrirA} ${v.nom}</span><small>${v.icons}</small>`); b.onclick = () => { this.fermerModal(); offrir(v.id); }; c.appendChild(b); }
    const later = el('button', 'ghost small', s.plusTard); later.style.cssText = 'color:#24313a;margin-top:6px'; later.onclick = () => { this.fermerModal(); plusTard?.(); }; c.appendChild(later);
    this.modal(c, false);
  }
  /** Le guide des premiers pas : une phrase douce en bas de l'écran, jusqu'à l'étape suivante. */
  guide(text: string) {
    if (!$('#start').classList.contains('hidden')) return;
    const g = $('#guide'); g.textContent = text; g.classList.remove('hidden', 'ouvert');
    const x = el('button', 'fermerGuide', '✕'); x.setAttribute('aria-label', 'fermer');
    x.onclick = (e) => { e.stopPropagation(); g.classList.add('hidden'); this.placerBulles(); };   // fermer : l'astuce revient à l'étape suivante
    g.appendChild(x);
    g.onclick = () => { g.classList.toggle('ouvert'); this.placerBulles(); };
    this.placerBulles();
  }
  guideHide() { $('#guide').classList.add('hidden'); }
  /** Ce qu'on montre selon l'étape : rien de plus que ce qui sert maintenant. */
  etape(e: number) {
    $('#btnPhone').classList.remove('hidden');
    $('#coins').parentElement!.classList.remove('hidden');
    $('#seedsPill').classList.remove('hidden');
    void e;
  }

  // ---------- choix de graine
  showPicker(slot: number, x: number, y: number) {
    if (!this.state) return;
    const s = t();
    const p = $('#picker'); p.innerHTML = `<div class="ttl">${s.chooseSeed}</div>`;
    const j = this.state.eco.jardin;
    const besoin = new Set(j.recette && !j.recette.faite ? ECO.recette(j.recette.recette).ingredients.map(i => i.graine) : []);
    const avail = CATALOG.plants.filter(pl => j.poche[pl.id] || j.rares[pl.id]).sort((a, b) => +besoin.has(b.id) - +besoin.has(a.id));
    if (!avail.length) p.appendChild(el('div', 'small', s.noSeeds));
    for (const pl of avail) {
      const g = ECO.graine(pl.id);
      const rare = !j.poche[pl.id] && j.rares[pl.id];
      const b = el('button', 'seed' + (besoin.has(pl.id) ? ' besoin' : ''), `<span><img class="mini-recolte" src="ui/recoltes/${pl.id}.png" alt=""> ${tx(pl.name)}${besoin.has(pl.id) ? ` <small class="pr">${s.pourRecette}</small>` : ''}</span><small>${g.pousse_min >= 60 ? Math.round(g.pousse_min / 60) + ' h' : g.pousse_min + ' min'}${rare ? ` · ${s.rare} ×${j.rares[pl.id]}` : ''}</small>`);
      const im = b.querySelector('img'); if (im) im.onerror = () => im.replaceWith(document.createTextNode(icon(pl.id)));   // pas encore d'image : l'emoji
      b.onclick = () => { this.hidePicker(); this.h.onSow(slot, pl.id); };
      p.appendChild(b);
    }
    const c = el('button', 'ghost small', s.close); c.onclick = () => this.hidePicker(); p.appendChild(c);
    p.classList.remove('hidden');
    const w = Math.min(280, window.innerWidth - 24);
    p.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, x - w / 2))}px`;
    p.style.top = `${Math.max(12, y - 40 - p.offsetHeight)}px`;
  }
  hidePicker() { $('#picker').classList.add('hidden'); }
  /** Juste après le semis : ce que tu récolteras, en image (le légume mûr), quelques secondes. */
  apercuRecolte(id: string) {
    const pl = CATALOG.plants.find(p => p.id === id); if (!pl) return;
    let b = document.getElementById('apercuRecolte');
    if (!b) { b = el('div', 'apercuRecolte'); b.id = 'apercuRecolte'; document.body.appendChild(b); b.onclick = () => b!.classList.remove('vu'); }
    b.innerHTML = `<img src="ui/recoltes/${id}.png" alt=""><div><small>${t().tuRecolteras}</small><b>${tx(pl.name)}</b></div>`;
    const im = b.querySelector('img'); if (im) im.onerror = () => { const e = document.createElement('span'); e.className = 'em'; e.textContent = icon(id); im.replaceWith(e); };
    b.classList.remove('vu'); void b.offsetWidth; b.classList.add('vu');
    clearTimeout((b as any)._t); (b as any)._t = setTimeout(() => b!.classList.remove('vu'), 3800);
  }

  // ---------- téléphone
  private skinChecked = new Set<string>();
  preloadSkin() { this.applySkin(); }
  /** Le téléphone change de style avec le personnage : moderne pour Léa, à cadran pour Marcel, baroudeur pour Jimy.
   *  Si une image ui/phone_<perso>.png existe, elle sert de coque et l'écran s'affiche dans sa zone transparente. */
  private applySkin() {
    if (!this.state) return;
    const ph = $('#phone'), id = this.state.character;
    ph.className = ph.className.replace(/\bskin-\w+/g, '').trim() + ' phone skin-' + id;
    if (!this.skinChecked.has(id)) {
      this.skinChecked.add(id);
      const c = CATALOG.characters.find(x => x.id === id);
      const url = c?.phone?.image ?? `ui/phone_${id}.png`;
      keyedImage(url).then(dataUrl => {
        if (!dataUrl) return;
        const [x, y, w, h] = c?.phone?.screen ?? ({ lea: [6, 5, 88, 90], marcel: [8, 42, 84, 54], jimy: [10, 14, 80, 68] } as Record<string, [number, number, number, number]>)[id] ?? [6, 5, 88, 90];
        ph.classList.add('skin-img');
        ph.style.setProperty('--skin', `url('${dataUrl}')`);
        ph.style.setProperty('--sx', x + '%'); ph.style.setProperty('--sy', y + '%'); ph.style.setProperty('--sw', w + '%'); ph.style.setProperty('--sh', h + '%');
      });
    }
  }
  /** Ranger le téléphone sans rien déclencher (utilisé en quittant ou en entrant dans une partie). */
  /** Le jeu du mois (un autre jeu 3D, avec sa musique) est DÉTRUIT dès qu'on quitte son appli ou qu'on range le téléphone.
   *  Avant, il restait caché mais continuait de tourner : deux jeux 3D et deux musiques en même temps. */
  private eteindreJeuDuMois() {
    this.root.querySelectorAll('iframe.cadreJeu').forEach(f => { try { (f as HTMLIFrameElement).src = 'about:blank'; } catch { /* ignore */ } f.remove(); });
  }
  rangerTelephone() { this.eteindreJeuDuMois(); $('#phone').classList.add('hidden'); this.phoneTab = 'home'; this.cherche = undefined; MUSIQUE.pauseJeu(false); }
  togglePhone(force?: boolean) {
    const ph = $('#phone');
    const open = force ?? ph.classList.contains('hidden');
    this.applySkin();
    ph.classList.toggle('hidden', !open);
    if (!open) { this.eteindreJeuDuMois(); MUSIQUE.pauseJeu(false); }  // téléphone rangé : le jeu du mois s'éteint, notre musique reprend
    this.hidePicker();
    if (open) this.renderPhone(true); else this.phoneTab = 'home';
    this.refresh();
    this.h.onPhoneOpen(open);
  }
  cherche: string | undefined;
  private toucheTel = 0;
  private signature = '';
  /** Ce que le téléphone montre : s'il n'a pas changé, on ne redessine pas (sinon une liste ouverte se referme sous le doigt). */
  private sig(): string {
    const e = this.state!.eco, j = e.jardin, im = e.immeuble;
    return JSON.stringify([this.phoneTab, this.cherche, lang(), j.panier, j.poche, j.rares, j.points, j.recette, j.etape, e.platEnCours?.id, e.carnet.length, im.plats.length,
      im.annonces.map(a => a.id + (a.accepte_par ?? '')), this.phoneTab === 'marche' ? im.cours : 0, j.pots.map(p => p?.graine)]);
  }
  private renderPhone(force = false) {
    if (!this.state) return;
    this.badges();
    const act = document.activeElement as HTMLElement | null;
    if (!force && act && $('#phone').contains(act) && /SELECT|INPUT/.test(act.tagName)) return;   // on est en train de choisir
    if (!force && Date.now() - this.toucheTel < 15000) return;                                      // on vient de toucher le téléphone : on ne bouge rien
    const sg = this.sig();
    if (!force && sg === this.signature) return;
    this.signature = sg;
    const home = this.phoneTab === 'home';
    $('#appBar').classList.toggle('hidden', home);
    $('#appTitre').textContent = home ? '' : t().apps[this.phoneTab];
    // le fond d'écran se voit partout, et dans le petit téléphone fermé
    const fond = FONDS[reglagesTel().fond] ?? FONDS.paris;
    ($('#phone').querySelector('.screen') as HTMLElement).style.background = fond;
    this.miniTel();
    $('#telHeure').textContent = $('#clockTxt').textContent || '';
    $('#phone').classList.toggle('surFond', home);
    const sc = $('#phoneContent').scrollTop;
    renderTelephone($('#phoneContent'), this.phoneTab, this.state, this.telH, this.coursPrecedent, this.cherche);
    if (!force) $('#phoneContent').scrollTop = sc;
    this.badges();
  }
  /** Ce que le téléphone sait faire lui-même : ouvrir une appli, changer un réglage. */
  private get telH(): TelHandlers {
    // après une action du joueur, le téléphone se redessine tout de suite (même s'il vient d'être touché)
    const h = { ...this.h } as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const k of ['onAccepter', 'onTroc', 'onRetirer', 'onBuySeed', 'onBuyPot', 'onCook', 'onOffrir', 'onDemain', 'onRepondre', 'onSemer']) {
      const f = h[k]; if (typeof f === 'function') h[k] = (...a: unknown[]) => { const r = f(...a); setTimeout(() => this.renderPhone(true), 60); return r; };
    }
    return { ...(h as unknown as TelHandlers), onApp: (a: Onglet, d?: string) => this.ouvrir(a, d), onReglage: (k, v) => this.reglage(k, v) };
  }
  private reglage(k: 'fond' | 'vibre' | 'son', v: string | boolean) {
    const R = { ...reglagesTel(), [k]: v };
    try { localStorage.setItem('jdp.tel', JSON.stringify(R)); } catch { /* ignore */ }
    if (k === 'son' && v !== 'aucun') this.sonner(String(v));
    if (k === 'vibre' && v) this.vibrer();
    this.renderPhone(true);
  }
  // ---------- les notifications : bannière, vibration, son
  private audio: AudioContext | null = null;
  sonner(type = reglagesTel().son) {
    if (type === 'aucun') return;
    try {
      this.audio ??= new AudioContext();
      const ac = this.audio, t0 = ac.currentTime;
      const note = (f: number, at: number, dur: number, vol = .12, forme: OscillatorType = 'sine') => {
        const o = ac.createOscillator(), g = ac.createGain(); o.type = forme; o.frequency.value = f;
        g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(vol, t0 + at + .01); g.gain.exponentialRampToValueAtTime(.0001, t0 + at + dur);
        o.connect(g).connect(ac.destination); o.start(t0 + at); o.stop(t0 + at + dur + .02);
      };
      if (type === 'bip') { note(880, 0, .12, .1, 'square'); note(1175, .15, .12, .1, 'square'); }
      else if (type === 'cloche') { note(1320, 0, .9, .14); note(1980, 0, .6, .05); note(990, .18, .9, .1); }
      else if (type === 'goutte') { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(1400, t0); o.frequency.exponentialRampToValueAtTime(420, t0 + .18); g.gain.setValueAtTime(.16, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + .25); o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + .3); }
    } catch { /* pas de son possible */ }
  }
  vibrer() {                                                               // une seule vibration, courte
    if (!reglagesTel().vibre) return;
    const ph = $('#phone'); ph.classList.remove('vibre'); void ph.offsetWidth; ph.classList.add('vibre');
    try { navigator.vibrate?.(60); } catch { /* ignore */ }
  }
  /** Le petit téléphone fermé : la même coque, le même fond d'écran, les mêmes applis en tout petit. */
  miniTel() {
    const b = $('#btnPhone');
    const skin = ($('#phone').className.match(/skin-\w+/) ?? [''])[0];
    b.className = 'phoneBtn mini ' + skin;
    let sc = b.querySelector('.miniEcran') as HTMLElement | null;
    if (!sc) { b.querySelector('.ico')?.remove(); sc = el('span', 'miniEcran'); b.prepend(sc); sc.innerHTML = '<i></i>'.repeat(9); }
    sc.style.background = FONDS[reglagesTel().fond] ?? FONDS.paris;
  }
  /** Les pastilles : où regarder dans le téléphone. */
  private badges() {
    if (!this.state) return;
    const e = this.state.eco, j = e.jardin, im = e.immeuble;
    const mq = E.manque(j, ECO).filter(m => !j.poche[m.graine]);
    const n: Record<string, string> = {
      recette: E.peutCuisiner(j, ECO) || e.platEnCours ? '!' : '',
      marche: String(im.annonces.filter(a => !a.accepte_par && a.de !== j.id && mq.some(m => m.graine === a.donne.graine)).length || ''),
      carnet: String(Math.max(0, im.plats.filter(p => p.a === j.id).length - (e.recusVus ?? 0)) || ''),
      boutique: '',
    };
    const evs = im.evenements.filter(x => x.pour === j.id).length;
    n.recus = n.carnet; n.carnet = '';
    n.notifs = String(Math.max(0, evs - (e.notifsVues ?? 0)) || '');
    this.root.querySelectorAll<HTMLButtonElement>('.appBtn').forEach(b => { b.dataset.badge = n[b.dataset.app!] ?? ''; });
    const total = Object.values(n).filter(Boolean).length;
    $('#basketBadge').textContent = total ? String(total) : '';
    $('#basketBadge').classList.toggle('hidden', !total);
  }
  /** Revenir en arrière : d'une fiche à sa liste, d'une appli à l'accueil. */
  retour() {
    const sens = 'versGauche';
    if (this.cherche && (this.phoneTab === 'bourse' || this.phoneTab === 'notifs' || this.phoneTab === 'marche')) this.ouvrir(this.phoneTab, undefined, sens);
    else if (this.phoneTab !== 'home') this.ouvrir('home', undefined, sens);
  }
  ouvrir(onglet: Onglet, cherche?: string, sens: 'versDroite' | 'versGauche' = 'versDroite') {
    const ct = $('#phoneContent'); ct.classList.remove('versDroite', 'versGauche'); void ct.offsetWidth; ct.classList.add(onglet === 'home' && sens === 'versDroite' ? 'versGauche' : sens);
    this.phoneTab = onglet; this.cherche = cherche;
    if (this.state && onglet === 'recus') this.state.eco.recusVus = this.state.eco.immeuble.plats.filter(p => p.a === this.state!.eco.jardin.id).length;
    if (this.state && onglet === 'notifs') this.state.eco.notifsVues = this.state.eco.immeuble.evenements.filter(x => x.pour === this.state!.eco.jardin.id).length;
    if ($('#phone').classList.contains('hidden')) this.togglePhone(true); else this.renderPhone(true);
  }  /** Une notification. Téléphone fermé : la pastille rouge et un petit message à côté du téléphone, sans trembler.
   *  Téléphone ouvert : une bannière en haut de l'écran du téléphone et une vibration. Toucher ouvre l'appli. */
  notifier(msg: string, app: Onglet = 'notifs', detail?: string) {
    this.file.push({ msg, ms: 5200, onglet: app, detail });
    if (this.fileActive) return;
    const next = () => {
      const m = this.file.shift(); if (!m) { this.fileActive = false; return; }
      this.fileActive = true;
      const ouvert = !$('#phone').classList.contains('hidden');
      const b = ouvert ? $('#telBanner') : $('#notifBanner');
      b.innerHTML = ouvert ? `${iconeApp(m.onglet ?? 'notifs', 34)}<span><b>${t().apps[m.onglet ?? 'notifs']}</b><em>${t().maintenant}</em><br>${m.msg}</span>`
        : `<span><b>${t().apps[m.onglet ?? 'notifs']}</b><br>${m.msg}</span>`;
      b.classList.remove('hidden', 'sort'); void b.offsetWidth; b.classList.add('entre');
      b.onclick = () => { b.classList.add('hidden'); this.ouvrir(m.onglet ?? 'notifs', m.detail); };
      if (ouvert) { this.vibrer(); this.sonner(); }
      this.badges();
      setTimeout(() => { b.classList.add('sort'); setTimeout(() => b.classList.add('hidden'), 350); next(); }, m.ms);
    };
    next();
  }
  // ---------- réglages
  openSettings() {
    const s = t();
    const card = $('#settingsCard'); card.innerHTML = `<h3>${s.settings}</h3>`;
    const langRow = el('div', 'setrow', `<span>${s.language}</span>`);
    for (const l of ['fr', 'en'] as Lang[]) { const b = el('button', l === lang() ? 'active' : '', l.toUpperCase()); b.onclick = () => { setLang(l); this.h.onLang(l); this.retranslate(); this.openSettings(); }; langRow.appendChild(b); }
    card.appendChild(langRow);
    const nightRow = el('div', 'setrow', `<span>${s.forceNight}</span>`);
    for (const m of ['auto', 'day', 'night'] as const) { const b = el('button', m === this.nightMode ? 'active' : '', m === 'auto' ? s.auto : m === 'day' ? s.day : s.night); b.onclick = () => { this.nightMode = m; this.h.onNight(m); this.openSettings(); }; nightRow.appendChild(b); }
    card.appendChild(nightRow);
    const reset = el('button', 'ghost danger', s.reset); reset.onclick = () => { if (confirm(s.resetConfirm)) this.h.onReset(); }; card.appendChild(reset);
    const close = el('button', 'primary', s.close); close.onclick = () => $('#settings').classList.add('hidden'); card.appendChild(close);
    $('#settings').classList.remove('hidden');
  }

  static char(c: CharacterDef) { return tx(c.name); }
  static timeLeft(sec: number) { return fmtTime(sec); }
}

export function icon(plant: string): string {
  return ({ basilic: '🌿', menthe: '🍃', fraise: '🍓', piment: '🌶️', tomate: '🍅', ciboulette: '🧅', poivron: '🫑', aubergine: '🍆', courgette: '🥒', radis: '🔴', carotte: '🥕', salade: '🥬', lavande: '💜', citronnier: '🍋', haricot: '🫛', tournesol: '🌻' } as Record<string, string>)[plant] ?? '🌱';
}

/** Charge une image de coque et rend transparent son fond vert ou magenta (autour et dans l'écran). Null si absente. */
async function keyedImage(url: string): Promise<string | null> {
  const r = await fetch(url).catch(() => null);
  if (!r || !r.ok || !(r.headers.get('content-type') || '').startsWith('image')) return null;
  const blob = await r.blob();
  const bmp = await createImageBitmap(blob).catch(() => null);
  if (!bmp) return null;
  const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
  const c = cv.getContext('2d')!; c.drawImage(bmp, 0, 0);
  const im = c.getImageData(0, 0, cv.width, cv.height), d = im.data;
  let green = 0, magenta = 0;
  for (let i = 0; i < d.length; i += 4 * 97) { const R = d[i], G = d[i + 1], B = d[i + 2]; if (G > 140 && R < 110 && B < 110) green++; if (R > 140 && B > 140 && G < 100) magenta++; }
  const useGreen = green >= magenta;
  for (let i = 0; i < d.length; i += 4) {
    const R = d[i], G = d[i + 1], B = d[i + 2];
    const key = useGreen ? (G > 140 && R < 120 && B < 120 && G - Math.max(R, B) > 40) : (R > 140 && B > 140 && G < 110);
    if (key) d[i + 3] = 0;
    else if (useGreen && G > 120 && G - Math.max(R, B) > 25) d[i + 3] = Math.round(d[i + 3] * .5);   // liseré
  }
  c.putImageData(im, 0, 0);
  return cv.toDataURL('image/png');
}
