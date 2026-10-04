import * as THREE from 'three';
import { Assets } from './assets';
import { World, SLOTS, FL, POT_SCALE, FACADE_FRONT, freePoint, segmentBlocked, CHAIR_SPOT, LADDER_SPOT, ROOF_STAND, START_SPOT, BASKET_SPOT, LAYOUT, TUNE, HAND, mountTunePanel, type Slot, type Layout } from './world';
import { Character, type Reglages } from './character';
import { UI, icon } from './ui';
import { MUSIQUE } from './musique';
import * as EL from './enligne';
import { BIBLIO } from './bibliotheque';
import { t, tx, lang, quantite, liste } from './i18n';
import { CATALOG, ECO, loadCatalog, plantDef, itemDef, charDef, newGame, prixProchainPot, LocalSave, generateNickname, type GameState, type PotState, type SaveProvider, type Perso } from './state';
import * as E from './economie';
import * as P from './plants';
import { Showroom } from './showroom';

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

interface SlotView { slot: Slot; group: THREE.Group; potDry: THREE.Object3D | null; potWet: THREE.Object3D | null; holder: THREE.Object3D; plantName: string; wet: boolean }

const fwdV = (o: THREE.Object3D, d: number) => new THREE.Vector3(Math.sin(o.rotation.y) * d, 0, Math.cos(o.rotation.y) * d);

/** Le temps de l'arc-en-ciel, partagé par toutes les matières 🌈 (avancé à chaque image). */
const TEMPS_ARC = { value: 0 };

export class Game {
  assets = new Assets();
  world: World;
  ui: UI;
  save: LocalSave = new LocalSave();
  state!: GameState;
  char!: Character;
  private views = new Map<number, SlotView>();
  private onRoof = false;
  private lastPlayerAction = Date.now();
  private autoToken = 0;
  private autoTimer = 0;
  private saveTimer = 0;
  private running = false;
  private lastHour = -1;
  showroom: Showroom | null = null;
  mesures: { characters?: Record<string, { reglages?: Reglages }> } = {};
  private reglages(id: string): Reglages | undefined { return this.mesures.characters?.[id]?.reglages; }
  private cycle = 0;
  private dayLength = 600;            // secondes réelles pour une journée de jeu
  private clockStart = Date.now();
  private sleeping = false;
  /** Heure du jeu (0-24). */
  gameHour(): number { return (8 + ((Date.now() - this.clockStart) / 1000) / this.dayLength * 24) % 24; }
  /** L'heure du potager : réelle, ou 90 fois plus vite en mode démo (?demo=1). */
  demo = false;
  private dernierSeme = '';
  /** Les premiers pas (0 arrivée → 6 tout appris). Dès l'arrivée, on sait ce qu'on va cuisiner et ce qu'il faut semer. */
  private etape(e: number) {
    const j = this.state.eco.jardin;
    if ((j.etape ?? 0) > e) return;
    j.etape = e;
    this.ui.etape(e);
    if (e === 0 && !j.recette) j.recette = E.tirerRecetteAccueil(j, ECO, E.jourDe(this.ecoNow()));   // la première recette, tout de suite
    if (e === 5) {                                              // la deuxième recette : celle qui manque, et l'annonce d'un voisin qui l'a
      j.recette = E.tirerRecette(j, this.state.eco.immeuble, ECO, E.jourDe(this.ecoNow()), j.recette?.recette);
      E.premierTroc(this.state.eco.immeuble, j, ECO, this.ecoNow());
    }
    this.ui.refresh();
    const texte = this.texteEtape(e);
    if (texte) this.ui.guide(texte);
    if (e >= 7) setTimeout(() => this.ui.guideHide(), 14000);
    this.persist();
  }
  /** La phrase du guide pour une étape, avec la vraie recette, les vraies quantités et ce qu'il reste à semer. */
  private texteEtape(e: number): string {
    const tt = t(), j = this.state.eco.jardin;
    const re = j.recette ? ECO.recette(j.recette.recette) : null;
    const nomR = re ? (lang() === 'en' ? re.nom_en : re.nom_fr) : '';
    const lst = re ? liste(re.ingredients.map(i => quantite(i.quantite, ECO.graine(i.graine)))) : '';
    const nomG = (g: string) => { const x = ECO.graine(g); return (lang() === 'en' ? x.nom_en : x.nom_fr).toLowerCase(); };
    const seme = new Set(this.state.pots.filter(p => p.plant).map(p => p.plant!.plant));
    const aSemer = re ? re.ingredients.filter(i => j.poche[i.graine] && !seme.has(i.graine) && (j.panier[i.graine] ?? 0) < i.quantite) : [];
    if (e === 0 && re) return tt.guide0(nomR, lst, nomG(aSemer[0]?.graine ?? re.ingredients[0].graine));
    if (e === 1) {
      const dernier = this.dernierSeme;
      if (re && dernier && !re.ingredients.some(i => i.graine === dernier) && aSemer.length)       // il a semé autre chose : on le lui dit gentiment
        return tt.pasDansRecette(nomG(dernier).charAt(0).toUpperCase() + nomG(dernier).slice(1), nomR, liste(aSemer.map(i => nomG(i.graine))));
      return aSemer.length ? tt.guideAussi(nomG(aSemer[0].graine)) : tt.guide1;
    }
    if (e === 5 && re) {
      const mqs = E.manque(j, ECO).filter(m => !j.poche[m.graine]);
      const im = this.state.eco.immeuble;
      const noms = [...new Set(mqs.map(m => im.annonces.find(x => x.id.includes('_guide') && x.donne.graine === m.graine)).filter(Boolean).map(a => im.jardins.find(x => x.id === a!.de)?.nom ?? ''))].filter(Boolean);
      return tt.guide5(nomR, lst, liste(mqs.map(m => quantite(m.quantite, ECO.graine(m.graine)))), liste(noms), noms.length);
    }
    if (e === 7 && re) {
      const n = Object.keys(j.poche).length;
      const aAcheter = re.ingredients.find(i => !j.poche[i.graine] && !j.interdites.includes(i.graine));
      if (!aAcheter || n >= E.REGLES.POCHE_MAX) return tt.guide7tout(nomR, lst);
      const prix = E.REGLES.BOUTIQUE[n - 3] ?? E.REGLES.BOUTIQUE[E.REGLES.BOUTIQUE.length - 1];
      return tt.guide7(nomR, lst, nomG(aAcheter.graine), prix, j.points);
    }
    return ([, , tt.guide2, tt.guide3, tt.guide4, , tt.guide6] as (string | undefined)[])[e] ?? '';
  }
  /** Rappel du guide au retour : l'étape en cours redit sa phrase. */
  private rappelEtape() {
    const e = this.state.eco.jardin.etape ?? 0;
    this.ui.etape(e);
    if (e === 0 && !this.state.eco.jardin.recette) { this.etape(0); return; }
    if (e < 7) this.ui.guide(this.texteEtape(e));
  }
  private ecoNow(): number { const e = this.state.eco; return e.t0 + (Date.now() - e.start) * (this.demo ? 90 : 1); }
  private ecoRng = E.rng((Date.now() / 1000) | 0);
  private ecoTimer = 0;
  /** Le jardin des règles reflète les pots du balcon (pour le cours et la recette). */
  private syncJardin() {
    const j = this.state.eco.jardin, now = this.ecoNow();
    for (let i = 0; i < 8; i++) {
      const p = this.state.pots.find(x => x.id === i)?.plant;
      if (!p) { j.pots[i] = null; continue; }
      const d = plantDef(p.plant);
      j.pots[i] = { graine: p.plant, seme_a: p.sownAt, pousse_ms: p.grown * 1000, arrose: P.isWet(p), recoltes_faites: p.harvests, dernier_tick: now };
      void d;
    }
  }
  /** Un tour des règles : voisins, cours, jour, livraisons, événements. À appeler souvent, rattrape le temps passé. */
  private ecoTick(rattrapage = false) {
    const e = this.state.eco, now = this.ecoNow();
    this.syncJardin();
    let cur = rattrapage ? Math.max(e.immeuble.cours_calcule_a || now, now - 24 * E.H) : now;
    const pas = E.REGLES.BOT_PERIODE_MIN * E.MIN;
    let n = 0;
    while (cur < now && n++ < 400) { E.tickImmeuble(e.immeuble, ECO, cur, this.ecoRng); cur += pas; }
    E.tickImmeuble(e.immeuble, ECO, now, this.ecoRng);
    E.livrer(e.immeuble, e.jardin, now, ECO);
    if ((e.jardin.etape ?? 0) >= 5) E.garantirMarche(e.immeuble, e.jardin, ECO, now);   // jamais bloqué : un voisin en a, et une annonce payable existe
    this.ecoEvenements();
  }
  /** Les nouveautés pour moi (troc accepté, plat reçu, graine rare, recette) : une bulle chacune. */
  private ecoEvenements() {
    const e = this.state.eco;
    const miens = e.immeuble.evenements.filter(ev => ev.pour === e.jardin.id);
    const nouveaux = miens.slice(e.vus);
    e.vus = miens.length;
    const ou: Record<string, 'recette' | 'marche' | 'recus' | 'boutique' | 'notifs'> = { troc_accepte: 'marche', plat_recu: 'recus', graine_rare: 'recette', recette: 'recette', bienvenue: 'recette', message: 'notifs' };
    const idEv = (x: E.Evenement) => `${x.a}_${x.type}_${x.deId ?? ''}`;
    if (nouveaux.length <= 2) {
      for (const ev of nouveaux) {
        const txt = lang() === 'en' ? ev.texte_en : ev.texte_fr;
        if (ev.type === 'plat_recu' && ev.deId) this.ui.notifier(`${txt} ${t().tuPeuxRepondre}`, 'notifs', idEv(ev));
        else this.ui.notifier(txt, ou[ev.type]);
      }
    } else if (nouveaux.length > 2) {
      const n = (t_: string) => nouveaux.filter(x => x.type === t_).length;
      this.ui.notifier(t().resumeAbsence(n('plat_recu'), n('troc_accepte'), n('message')), 'notifs');
    }
    if (e.immeuble.evenements.length > 200) { e.immeuble.evenements = e.immeuble.evenements.slice(-100); e.vus = e.immeuble.evenements.filter(ev => ev.pour === e.jardin.id).length; }
    this.ui.refresh();
  }
  nightFor(h: number): number { return h < 6 || h >= 21.5 ? 1 : h < 7.5 ? 1 - (h - 6) / 1.5 : h > 20 ? (h - 20) / 1.5 : 0; }

  constructor(canvas: HTMLCanvasElement) {
    this.world = new World(canvas, this.assets);
    this.ui = new UI({
      onStart: (id, nick, perso) => this.startNew(id, nick, perso),
      getCouleurs: id => this.couleursDe(id),
      setCouleur: (id, name, hex) => this.teinter(this.showroom?.chars.find(c => c.def.id === id)?.char.obj, { [name]: hex }, id),
      photo: id => this.photoDe(id),
      onPick: id => { this.showroom?.select(id); MUSIQUE.jouerPerso(id); },
      onFocus: (id, on) => { if (on) this.showroom?.focus(id); else this.showroom?.unfocus(); },
      onZone: zone => this.showroom?.focusZone(zone),
      onPersoSave: (id, perso) => {                                     // la personnalisation entre dans la partie de ce personnage
        if (this.state && this.state.character === id) { this.state.perso = { ...perso, couleurs: { ...perso.couleurs } }; this.state.nickname = perso.prenom || this.state.nickname; this.save.store(this.state); this.sauverNuage(true); }
      },
      onContinue: (perso?: string) => this.continueGame(perso),
      onNewGame: () => {},
      onSow: (slot, plant) => this.sow(slot, plant),
      onCuisiner: () => this.cuisiner(), onOffrir: id => this.offrir(id),
      onTroc: (d, c) => this.troc(d, c), onAccepter: id => this.accepter(id), onRetirer: id => this.retirer(id),
      onDemain: () => { const e = this.state.eco; E.recetteDeDemain(e.jardin, e.immeuble, ECO, this.ecoNow()); this.persist(); this.ui.ouvrir('recette'); },
      onChercher: g => this.ui.ouvrir('marche', g),
      onFiche: id => this.ui.fiche(id),
      onSemer: g => this.semerDansPotLibre(g),
      onMontrerPlat: () => { this.ui.togglePhone(false); this.montrerPlat(); },
      onCompte: () => this.ui.compte(),
      onConnecte: () => { this.recupererNuage().catch(e => console.warn('[en ligne]', e)); },
      onRepondre: (id, texte) => this.repondre(id, texte),
      onBuySeed: id => this.buySeed(id),
      onBuyPot: () => this.buyPot(),
      onLang: () => this.ui.refresh(),
      onNight: mode => this.applyNightMode(mode),
      onReset: () => this.reset(),
      onHome: () => this.goHome(),
      onSheet: open => { if (this.showroom) { this.showroom.pan = open ? 1.2 : 0; this.showroom.sheetOpen = open; if (!open) this.showroom.deselect(); } },
      onPhoneOpen: open => {
        this.phoneGesture(open);

      },
      onBubble: slot => { const v = this.views.get(slot); if (!v) return; const sc = this.world.toScreen(v.slot.pos.clone().add(new THREE.Vector3(0, .5, 0))); this.tapSlot(slot, sc.x, sc.y); },
    });
    this.assets.onProgress = (d, tot, label) => this.ui.setProgress(d, tot, label);
    canvas.addEventListener('tapend', (e: Event) => { const d = (e as CustomEvent).detail; if (this.running) this.onTap(d); else if (d.moved <= 12) this.onStartTap(d.x, d.y); });
    if (!this.world.isMobile) { let last = 0; canvas.addEventListener('pointermove', e => { if (e.buttons) return; const now = performance.now(); if (now - last < 80) return; last = now; this.onHover(e.clientX, e.clientY); }); }
  }

  // ---------- démarrage
  async boot() {
    await loadCatalog();
    if ((CATALOG as any).bibliotheque) { this.ui.setProgress(0, 1, 'animations'); await BIBLIO.charger((CATALOG as any).bibliotheque); if ((CATALOG as any).bibliotheque_extra) BIBLIO.chargerExtra((CATALOG as any).bibliotheque_extra); }
    const q = new URLSearchParams(location.search);
    if (q.get('fast')) P.setSpeed(parseFloat(q.get('fast')!) || 5);
    if (q.get('demo') === '1') { P.setSpeed(90); this.demo = true; }        // mode démo : tout 90 fois plus vite
    await this.assets.loadCollections();
    await this.assets.loadOptional(['environments', 'interiors', 'env_decor', 'plantes']);   // plantes.glb : tes plantes, 7 stades par variété
    this.world.buildBalcony();
    this.world.addCritters();
    try { await EL.demarrer(); } catch (e) { console.warn('[en ligne]', e); }
    if (EL.etatCompte().connecte && !EL.etatCompte().invite) { try { await this.recupererNuage(false); } catch (e) { console.warn('[en ligne]', e); } }
    const saved = await this.save.load();
    this.ui.parties = this.save.liste();
    this.state = saved ?? newGame(CATALOG.characters[0].id, '');
    if (q.get('cycle')) this.dayLength = parseFloat(q.get('cycle')!) || 120;
    if (CATALOG.timing && (CATALOG.timing as { dayLength?: number }).dayLength && !q.get('cycle')) this.dayLength = (CATALOG.timing as { dayLength?: number }).dayLength!;
    try { const r = await fetch('models/mesures.json'); if (r.ok && (r.headers.get('content-type') || '').includes('json')) this.mesures = await r.json(); } catch { /* sans mesures : réglages par défaut */ }
    if (!this.assets.has('prop_phone')) {                                  // téléphone de secours : coque sombre, écran allumé
      const ph = new THREE.Group();
      ph.add(new THREE.Mesh(new THREE.BoxGeometry(.072, .148, .009), new THREE.MeshStandardMaterial({ color: 0x1f2328, roughness: .4 })));
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(.062, .13), new THREE.MeshBasicMaterial({ color: 0x9fd4ff })); scr.position.z = .0052; ph.add(scr);
      this.assets.register('prop_phone', ph);
    }
    if (!this.assets.has('prop_pan')) {                                    // poêle de secours
      const pan = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: .45, metalness: .6 });
      const b = new THREE.Mesh(new THREE.CylinderGeometry(.13, .11, .045, 24, 1, true), m); b.position.y = .022; pan.add(b);
      const f = new THREE.Mesh(new THREE.CircleGeometry(.11, 24), m); f.rotation.x = -Math.PI / 2; f.position.y = .002; pan.add(f);
      const food = new THREE.Mesh(new THREE.CylinderGeometry(.095, .095, .012, 20), new THREE.MeshStandardMaterial({ color: 0x7fae4a, roughness: .9 })); food.position.y = .012; pan.add(food);
      const hdl = new THREE.Mesh(new THREE.BoxGeometry(.2, .018, .03), new THREE.MeshStandardMaterial({ color: 0x5a3b28 })); hdl.position.set(.22, .035, 0); pan.add(hdl);
      this.assets.register('prop_pan', pan);
    }
    if (!this.assets.has('prop_plate')) {                                  // assiette de secours tant que le modèle Tripo n'est pas là
      const plate = new THREE.Group();
      plate.add(new THREE.Mesh(new THREE.CylinderGeometry(.13, .11, .02, 20), new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: .5 })));
      const food = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd9542b, roughness: .8 })); food.scale.y = .5; food.position.y = .03; plate.add(food);
      this.assets.register('prop_plate', plate);
    }
    this.showroom = new Showroom(this.assets);
    await this.showroom.load(label => this.ui.setProgress(1, 1, label));
    for (const c of this.showroom.chars) { c.char.applyMesures(this.reglages(c.def.id)); if (c.char.deLaBibliotheque) { c.char.mesurerSurLaBibliotheque(); if (c.def.id !== 'lea') c.char.exclure(['dance', 'dance_14', 'dance_15']); } const u = new URLSearchParams(location.search).get('bras'); c.char.brasOffset = u !== null ? +u : ((c.def as any).bras_offset ?? 0); await this.chargerMoyennes(c.def.id); }
    await this.teinterAccueil();
    this.showroom.resize(window.innerWidth / window.innerHeight);
    window.addEventListener('resize', () => this.showroom?.resize(window.innerWidth / window.innerHeight));
    this.ui.showStart(!!saved, saved ? tx(charDef(saved.character).name) : '');
    this.loop();
  }
  /** Sur l'accueil : toucher un personnage le fait danser et ouvre sa fiche. */
  private onStartTap(x: number, y: number) {
    if (!this.showroom) return;
    const id = this.showroom.pick(x, y);
    if (id) { this.showroom.select(id); this.ui.showSheet(id); }
  }
  private async startNew(characterId: string, nickname: string, perso?: Perso) {
    this.state = newGame(characterId, nickname || generateNickname(lang()), perso);
    await this.save.store(this.state);
    await this.enterGame();
  }
  // ---------- c'est toi : couleurs des vêtements, photo
  /** Les matières du personnage qu'on peut colorer (les plus grandes d'abord), avec leur couleur du moment. */
  private couleursDe(id: string): { name: string; hex: string }[] {
    const obj = this.showroom?.chars.find(c => c.def.id === id)?.char.obj; if (!obj) return [];
    const seen = new Map<string, { name: string; hex: string; n: number }>();
    obj.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) { const sm = mat as THREE.MeshStandardMaterial; if (!sm.color || !sm.name) continue;
        const cnt = (m.geometry.index?.count ?? m.geometry.attributes.position.count);
        const e = seen.get(sm.name); if (e) e.n += cnt; else seen.set(sm.name, { name: sm.name, hex: '#' + sm.color.getHexString(), n: cnt }); }
    });
    const ordre = ['peau', 'cheveux', 'haut', 'bas', 'chaussures'];
    return [...seen.values()].sort((a, b) => { const za = ordre.indexOf(a.name.split('_').pop()!), zb = ordre.indexOf(b.name.split('_').pop()!); return (za < 0 ? 9 : za) - (zb < 0 ? 9 : zb) || b.n - a.n; }).map(({ name, hex }) => ({ name, hex }));
  }
  /** Couleur moyenne de la texture par zone (zones_<perso>.json, écrit par jdp_zones_perso.py). */
  private moyennes: Record<string, Record<string, string>> = {};
  private async chargerMoyennes(id: string) {
    if (this.moyennes[id]) return;
    try { const r = await fetch(`models/zones_${id}.json`); if (r.ok && (r.headers.get('content-type') || '').includes('json')) this.moyennes[id] = (await r.json()).moyennes ?? {}; else this.moyennes[id] = {}; } catch { this.moyennes[id] = {}; }
  }
  /** Teinte les matières nommées d'un personnage (matières clonées : les autres personnages ne bougent pas). */
  private teinter(obj: THREE.Object3D | undefined, couleurs: Record<string, string>, id = this.state?.character ?? this.showroom?.chars[0]?.def.id ?? '') {
    if (!obj) return;
    const moy = this.moyennes[id] ?? {};
    obj.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const arr = Array.isArray(m.material) ? m.material : [m.material];
      const out = arr.map(mat => {
        const sm = mat as THREE.MeshStandardMaterial; if (!sm.name) return mat;
        const cle = sm.name in couleurs ? sm.name : Object.keys(couleurs).find(k => k.replace(/\.\d{3}$/, '') === sm.name.replace(/\.\d{3}$/, ''));
        if (!cle) return mat;
        const hex = couleurs[cle];
        const c = (sm.userData.tinted ? sm : sm.clone()) as THREE.MeshStandardMaterial;
        // la texture reste (plis, ombres) : on garde sa luminosité relative et on remplace sa couleur par la teinte choisie
        if (!c.userData.tinted) {
          c.userData.tinted = true;
          c.userData.u = { uTint: { value: new THREE.Color('#ffffff') }, uLum: { value: 1 }, uOn: { value: 0 }, uAvg: { value: new THREE.Color('#808080') }, uKeep: { value: 0 }, uArc: { value: 0 }, uTemps: TEMPS_ARC };
          c.onBeforeCompile = sh => {
            Object.assign(sh.uniforms, c.userData.u);
            sh.fragmentShader = sh.fragmentShader
              .replace('#include <common>', '#include <common>\nuniform vec3 uTint; uniform float uLum; uniform float uOn; uniform vec3 uAvg; uniform float uKeep; uniform float uArc; uniform float uTemps;\nvec3 arcEnCiel(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }')
              // ce qui n'est pas de la couleur de la zone (yeux, moustache, boutons) garde sa couleur d'origine
              .replace('#include <map_fragment>', '#include <map_fragment>\nif (uOn > 0.5) { float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); vec3 base = uTint;\n#ifdef USE_MAP\n if (uArc > 0.5) base = mix(vec3(1.0), arcEnCiel(fract(uTemps * 0.12 + vMapUv.y * 2.5 + vMapUv.x * 1.2)), 0.85);\n#else\n if (uArc > 0.5) base = mix(vec3(1.0), arcEnCiel(fract(uTemps * 0.12 + gl_FragCoord.y * 0.004)), 0.85);\n#endif\n vec3 t = base * clamp(l / max(uLum, 0.02), 0.25, 1.9); float d = distance(diffuseColor.rgb / max(l, 0.05), uAvg / max(dot(uAvg, vec3(0.299, 0.587, 0.114)), 0.05)); float k = uKeep > 0.5 ? 1.0 - smoothstep(0.35, 0.8, d) : 1.0; diffuseColor.rgb = mix(diffuseColor.rgb, t, k); }');
          };
          c.customProgramCacheKey = () => 'teinte-zone';
          c.needsUpdate = true;
        }
        const u = c.userData.u;
        if (!hex) { u.uOn.value = 0; return c; }                                // ↺ : la texture d'origine
        const zone = sm.name.replace(/\.\d{3}$/, '').split('_').pop()!;
        const avg = moy[zone] ? new THREE.Color(moy[zone]) : null;
        const lum = avg ? (0.299 * avg.r + 0.587 * avg.g + 0.114 * avg.b) : 0.5;
        if (hex === 'arc') { u.uArc.value = 1; u.uTint.value.set('#ffffff'); } else { u.uArc.value = 0; u.uTint.value.set(hex); }   // 🌈 : les couleurs défilent
        u.uLum.value = Math.max(0.08, lum); u.uOn.value = 1; if (avg) u.uAvg.value.copy(avg);
        u.uKeep.value = zone === 'peau' ? 1 : 0;      // yeux et sourcils gardés dans la peau ; cheveux, bonnet et vêtements se recolorent en entier
        return c;
      });
      m.material = Array.isArray(m.material) ? out : out[0];
    });
  }
  /** Chaque personnage de l'accueil avec SES couleurs : celles de sa partie, sinon celles choisies dans Personnaliser. */
  private async teinterAccueil() {
    if (!this.showroom) return;
    let persos: Record<string, Perso> = {};
    try { persos = JSON.parse(localStorage.getItem('jdp.persos') || '{}'); } catch { /* ignore */ }
    for (const c of this.showroom.chars) {
      const g = await this.save.loadFor(c.def.id);
      const couleurs = g?.perso?.couleurs ?? persos[c.def.id]?.couleurs;
      if (couleurs && Object.keys(couleurs).length) this.teinter(c.char.obj, couleurs, c.def.id);
    }
  }
  /** Photo du personnage de l'accueil : un carré au centre de la vue, juste après un rendu. */
  private photoDe(id: string): string {
    const sr = this.showroom; if (!sr) return '';
    sr.select(id);
    this.world.renderer.render(sr.scene, sr.camera);
    const cv = this.world.renderer.domElement;
    const size = Math.min(cv.width, cv.height) * .42;
    const out = document.createElement('canvas'); out.width = out.height = 160;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(cv, cv.width / 2 - size / 2, cv.height * .12, size, size, 0, 0, 160, 160);
    return out.toDataURL('image/jpeg', .82);
  }
  private async continueGame(perso?: string) {
    if (perso && perso !== this.state?.character) { const g = await this.save.loadFor(perso); if (g) this.state = g; }
    await this.enterGame();
  }
  private async enterGame() {
    const s = this.state;
    if (this.world.basket) this.world.basket.visible = false;           // le panier est à l'écran et dans le téléphone
    setTimeout(() => this.panneauAnimations(), 1500);
    setTimeout(() => { try { this.auditAnimations(); } catch (e) { console.warn('[audit]', e); } }, 2500);
    s.eco.immeuble.annonces = s.eco.immeuble.annonces.filter(a => a.accepte_par || (a.donne.graine !== E.POINTS && a.cherche.graine !== E.POINTS));
    const c = charDef(s.character);
    MUSIQUE.jouerPerso(c.id);
    this.autoToken++; this.remiseAZero();
    if (EL.EN_LIGNE && !EL.etatCompte().connecte) EL.jouerInvite(s.nickname || s.perso?.prenom || 'Jardinier').catch(() => { /* hors ligne : on joue en local */ });
    this.ui.chantier(true, tx(c.name));                                  // le croquis se dessine pendant qu'on construit la maison
    await this.world.setView(CATALOG.views[s.view] ?? CATALOG.views.tour);
    const asset = await this.assets.loadCharacter(c.id, c.file);
    if (this.char) this.world.scene.remove(this.char.obj);
    try { this.world.mesurerSol(); } catch (e) { console.warn('[mesures du décor] ignorées :', e); }
    if (this.world.ciel) this.world.ciel.onPassage = (sp) => this.montrerLeCiel(sp);
    this.char = new Character(this.assets, asset);
    this.char.applyMesures(this.reglages(c.id));
    if (this.char.deLaBibliotheque) { this.char.mesurerSurLaBibliotheque(); if (c.id !== 'lea') this.char.exclure(['dance', 'dance_14', 'dance_15']); }   // les réglages viennent des animations elles-mêmes ; la danse hip-hop féminine, la danse du ventre et le ballet restent à Léa
    else await this.preterAnimations(c.id);                             // (ancien corps avec ses propres animations)
    this.calibrerGestes();
    await this.installerChaisePliante(c.id);
    { const u = new URLSearchParams(location.search).get('pieds'); this.char.decalerPieds(u !== null ? +u : ((c as any).pieds ?? 0)); }   // ?pieds=0.03 pour tester, puis la valeur dans catalog.json
    { const u = new URLSearchParams(location.search).get('bras'); this.char.brasOffset = u !== null ? +u : ((c as any).bras_offset ?? 0); }
    await this.chargerMoyennes(c.id);
    if (s.perso?.couleurs) this.teinter(this.char.obj, s.perso.couleurs, c.id);
    this.world.fitChair(this.char.sitCfg);                   // Léa s'assoit haut : sa chaise devient une chaise de bar
    this.char.teleport(START_SPOT, 0);
    this.world.scene.add(this.char.obj);
    // restaurer le balcon
    for (const v of this.views.values()) this.world.potGroup.remove(v.group);
    this.views.clear();
    this.world.applyTheme(c.theme);
    let layout: Layout | null = null;
    try { const r = await fetch(`models/layout_${c.id}.json`); if (r.ok && (r.headers.get('content-type') || '').includes('json')) layout = await r.json(); } catch { /* pas de layout : placement automatique */ }
    if (layout) console.info('layout chargé :', `models/layout_${c.id}.json`);
    this.world.setEnvironment(c.env, layout);
    for (const p of s.pots) this.makeSlotView(p);
    for (const id of s.items) { const d = itemDef(id); if (d?.object) this.world.addDeco(d.object, id); }
    if (s.roof) this.world.unlockRoof(false);
    this.catchUp();
    this.applyNightMode(this.ui.nightMode);
    this.ui.bind(s);
    this.ui.preloadSkin();
    this.ui.chantier(false);
    this.ui.hideStart();
    this.inside = false; this.sleeping = false;
    this.running = true;
    this.scheduleAutonomy();
    if (!this.carteTimer) this.carteTimer = window.setInterval(() => this.majCarte(), 1000);
    if (new URLSearchParams(location.search).get('tune') && !document.getElementById('tune')) {
      mountTunePanel({
        applyCamera: () => this.world.applyTune(),
        applyHand: () => this.applyHand(),
        holdCan: () => { if (this.held) this.release(); else this.hold(this.canName(), 'can'); },
        sit: () => { this.autoToken++; const tk = this.autoToken; this.goSit(tk, 'sit'); },
      });
    }
  }
  private async reset() {
    await this.save.clear(this.state?.character);
    location.reload();
  }
  /** Tout ce qui pourrait traîner d'une activité interrompue : objets en main, poêle, regard, gestes, pièce, sommeil. */
  private remiseAZero() {
    // chaque rangement est indépendant : l'un qui échoue n'empêche jamais d'entrer dans le jeu
    const sur = (f: () => void) => { try { f(); } catch (e) { console.warn('[remise à zéro]', e); } };
    sur(() => { if (this.assiettePosee) { this.assiettePosee.parent?.remove(this.assiettePosee); this.assiettePosee = null; } clearTimeout(this.poseTimer); });
    sur(() => this.lacherTel()); sur(() => this.lacherArrosoir()); sur(() => { this.lacher(); }); sur(() => this.release());
    sur(() => { if (this.poeleEnCours) { this.poeleEnCours.parent?.remove(this.poeleEnCours); this.poeleEnCours = null; } });
    sur(() => { if (this.char) { this.char.regard = null; this.char.mains = null; this.char.ikBut = 0; this.char.busy = false; } });
    this.inside = false; this.sleeping = false;
    sur(() => this.ui.rangerTelephone()); sur(() => this.ui.fermerModal()); sur(() => this.ui.hideCard()); sur(() => this.ui.guideHide());
  }
  private goHome() {
    this.persist();
    this.running = false;
    this.autoToken++;
    clearTimeout(this.autoTimer);
    this.remiseAZero();
    this.ui.showStart(true, tx(charDef(this.state.character).name));
  }

  // ---------- pots et plantes en 3D
  private makeSlotView(p: PotState) {
    const slot = SLOTS[p.id];
    const group = new THREE.Group();
    group.userData.slot = p.id;
    let potDry: THREE.Object3D | null = null, potWet: THREE.Object3D | null = null;
    const holder = new THREE.Object3D();
    if (slot.roof) {
      // un bac partagé par deux emplacements : on ne le pose qu'une fois
      const planterIdx = slot.planter!;
      let planter = this.world.planters[planterIdx];
      if (!planter) {
        planter = this.assets.get('pot_roof_planter_wet');
        planter.position.set([-1.2, 0, 1.2][planterIdx], slot.pos.y, slot.pos.z);
        planter.scale.setScalar(.7);
        planter.userData.planter = planterIdx;
        this.world.potGroup.add(planter);
        this.world.planters[planterIdx] = planter;
      }
      const tag = slot.id % 2 === 0 ? 'plant_1' : 'plant_2';
      const sock = Assets.socket(planter, tag);
      if (sock) sock.add(holder); else planter.add(holder);
      holder.scale.setScalar(1 / .7 * POT_SCALE);
      holder.userData.slot = p.id;
      const hit = new THREE.Mesh(new THREE.BoxGeometry(.45, .7, .45), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = .35; group.add(hit);
      group.position.copy(slot.pos);
      this.world.potGroup.add(group);
    } else {
      potDry = this.assets.get(`pot_${p.style}_dry`); potWet = this.assets.get(`pot_${p.style}_wet`);
      group.add(potDry, potWet);
      group.position.copy(slot.pos); group.scale.setScalar(POT_SCALE);
      const sock = Assets.socket(potWet, 'plant');
      if (sock) { holder.position.copy(sock.position); }
      group.add(holder);
      this.world.potGroup.add(group);
      this.world.registerSlotView(p.id, group);
    }
    const v: SlotView = { slot, group, potDry, potWet, holder, plantName: '', wet: true };
    this.views.set(p.id, v);
    this.refreshSlot(p);
  }
  private refreshSlot(p: PotState) {
    const v = this.views.get(p.id); if (!v) return;
    const now = Date.now();
    const wet = p.plant ? P.isWet(p.plant, now) : false;
    if (v.potDry && v.potWet) { v.potDry.visible = !wet; v.potWet.visible = wet; }
    let name = p.plant ? (this.modeleVariete(p.plant, now) ?? P.objectName(p.plant, now)) : '';
    if (name && !this.assets.has(name)) {                                  // graine sans modèle encore : on emprunte une plante voisine
      const st = P.stage(p.plant!);
      name = st <= 1 ? `plant_common_s${st}` : (CATALOG.plants.map(x => `plant_${x.id}_s${st}`).find(n => this.assets.has(n)) ?? name);
    }
    if (name !== v.plantName) {
      while (v.holder.children.length) v.holder.remove(v.holder.children[0]);
      if (name) {
        const o = this.assets.get(name);
        if (/_v\d+_/.test(name)) {                                         // les nouvelles plantes sont à taille réelle : on annule l'échelle du pot
          v.holder.updateWorldMatrix(true, false);
          const ws = new THREE.Vector3(); v.holder.getWorldScale(ws);
          o.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
        }
        v.holder.add(o);
      }
      v.plantName = name;
    }
  }
  /** Où mettre la main : pour récolter, à la hauteur des légumes (55 % de la plante mesurée), pour semer, sur la terre.
   *  La main est guidée vers ce point pendant le geste, puis rendue à l'animation. */
  private mainVersLaPlante(p: { id: number }, quoi: 'recolte' | 'semis', effet: number) {
    const v = this.views.get(p.id); if (!v) return;
    v.holder.updateWorldMatrix(true, true);
    const terre = new THREE.Vector3(); v.holder.getWorldPosition(terre);
    let y = terre.y + .03;
    if (quoi === 'recolte') {
      const box = new THREE.Box3().setFromObject(v.holder);
      const h = box.isEmpty() ? .25 : Math.max(0, box.max.y - terre.y);
      y = terre.y + THREE.MathUtils.clamp(h * .55, .08, .45);
    }
    const ch = this.char.obj;
    const versLui = ch.position.clone().sub(terre).setY(0).normalize();
    const cible = terre.clone().addScaledVector(versLui, quoi === 'recolte' ? .06 : .1).setY(y);
    this.char.mains = { droite: () => cible };
    this.char.ikBut = 1;
    setTimeout(() => { this.char.ikBut = 0; }, (effet + .45) * 1000);       // la main revient à l'animation après le geste
  }
  /** REVUE DES ANIMATIONS (adresse avec ?anims=1) : la liste de toutes les animations du personnage ; ▶ la joue seule,
   *  sans aucun guidage des mains ; ✓ / ✗ et une note ; « Copier le rapport » donne la liste à m'envoyer. */
  private panneauAnimations() {
    if (new URLSearchParams(location.search).get('anims') !== '1' || document.getElementById('revueAnims')) return;
    const perso = this.state.character, noms = this.char.nomsAnimations().sort();
    const avis: Record<string, { ok?: boolean; note: string }> = {};
    let vitesse = 1;
    const box = document.createElement('div'); box.id = 'revueAnims';
    box.style.cssText = 'position:fixed;right:10px;top:70px;bottom:10px;width:min(360px,94vw);overflow:auto;z-index:80;background:rgba(255,253,246,.97);border:1px solid rgba(0,0,0,.12);border-radius:14px;padding:10px;font:13px system-ui,sans-serif;color:#24313a;box-shadow:0 10px 30px rgba(0,0,0,.2)';
    const btn = (txt: string, f: () => void, css = '') => { const b = document.createElement('button'); b.textContent = txt; b.style.cssText = 'margin:2px;padding:4px 8px;border-radius:8px;border:1px solid rgba(0,0,0,.15);background:#fff;cursor:pointer;' + css; b.onclick = f; return b; };
    const figer = () => { this.autoToken++; this.char.busy = true; this.char.mains = null; this.char.ikBut = 0; this.char.regard = null; };
    const titre = document.createElement('div'); titre.innerHTML = `<b>Revue des animations — ${perso}</b> (${noms.length})`; box.appendChild(titre);
    const barre = document.createElement('div');
    barre.append(
      btn('↻ tourner', () => { this.char.obj.rotation.y += Math.PI / 2; }),
      btn('vitesse ×1', function (this: void) { vitesse = vitesse === 1 ? .5 : vitesse === .5 ? .25 : 1; (barre.children[1] as HTMLButtonElement).textContent = `vitesse ×${vitesse}`; }),
      btn('📋 Copier le rapport', () => {
        const lignes = [`Revue des animations — ${perso} — ${new Date().toLocaleString('fr-FR')}`];
        for (const n of noms) { const a = avis[n]; if (a && (a.ok !== undefined || a.note)) lignes.push(`${a.ok === true ? '✓' : a.ok === false ? '✗' : '·'} ${n}${a.note ? ' — ' + a.note : ''}`); }
        const txt = lignes.join('\n');
        navigator.clipboard?.writeText(txt).then(() => this.ui.toast('Rapport copié : colle-le dans la conversation', 3000, true)).catch(() => { const ta = document.createElement('textarea'); ta.value = txt; box.appendChild(ta); ta.select(); });
      }, 'background:#2f8f4e;color:#fff;border-color:#2f8f4e;font-weight:700'),
      btn('reprendre la vie normale', () => { this.char.busy = false; this.char.play('idle', .3); this.scheduleAutonomy(); }),
    );
    box.appendChild(barre);
    for (const n of noms) {
      avis[n] = { note: '' };
      const ligne = document.createElement('div'); ligne.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px 0;border-top:1px solid rgba(0,0,0,.06);flex-wrap:wrap';
      const nom = document.createElement('span'); nom.textContent = n; nom.style.cssText = 'flex:1;min-width:120px;font-family:ui-monospace,monospace;font-size:12px';
      const ok = btn('✓', () => { avis[n].ok = true; ok.style.background = '#d8f0dc'; ko.style.background = '#fff'; });
      const ko = btn('✗', () => { avis[n].ok = false; ko.style.background = '#fde0da'; ok.style.background = '#fff'; });
      const note = document.createElement('input'); note.placeholder = 'ce qui ne va pas'; note.style.cssText = 'flex-basis:100%;padding:4px 6px;border:1px solid rgba(0,0,0,.15);border-radius:6px;font-size:12px';
      note.oninput = () => { avis[n].note = note.value.trim(); };
      ligne.append(btn('▶', () => { figer(); this.char.play(n, .2, vitesse); nom.style.fontWeight = '800'; }), nom, ok, ko, note);
      box.appendChild(ligne);
    }
    document.body.appendChild(box);
    figer(); this.char.play('idle', .2);
  }
  /** Corrections des animations, d'après l'analyse automatique du 3 octobre :
   *  - le sport n'existe que chez Jimy : Léa et Marcel l'empruntent (à leur taille) ;
   *  - le « planter » de Jimy descend la main jusqu'au sol (elle s'enfonce dans le pot) : il prend celui de Léa ;
   *  - le « ramasser » copié de Léa enfonçait les pieds de Jimy et Marcel de 4 cm : recopié à leur taille ;
   *  - la danse de Marcel (pieds qui glissent, coude à l'envers) est retirée, pour tout le monde. */
  private async preterAnimations(id: string) {
    const charger = async (pid: string) => { const d = CATALOG.characters.find(x => x.id === pid); return d ? await this.assets.loadCharacter(d.id, d.file) : null; };
    try {
      if (id !== 'jimy') { const j = await charger('jimy'); if (j) this.char.preter(j, ['sport_squat', 'sport_gainage', 'regard_epaule']); }
      if (id !== 'lea') {
        const l = await charger('lea');
        if (l) {
          const faits = this.char.preter(l, id === 'jimy' ? ['plant', 'pickup'] : ['pickup'], true);
          const gl = (this.reglages('lea') as any)?.gestes?.plant;
          if (faits.includes('plant') && gl) this.char.gestures.plant = { ...gl, anim: 'plant' };   // le minutage du geste de Léa va avec son animation
        }
      }
      this.char.exclure(id === 'marcel' ? ['dance', 'dance_marcel'] : ['dance_marcel']);
    } catch (e) { console.warn('[animations empruntées]', e); }
  }
  /** La rambarde devant le personnage : un rayon vers l'avant, à hauteur de hanche, trouve sa distance ; un rayon
   *  vers le bas trouve le haut de la barre. Deux rayons, une fois par scène : rien de lourd. */
  private rambardeDevant(x: number, z: number, ry: number): { dist: number; haut: number } | null {
    try {
      const W = this.world as any, env = W.envGroup as THREE.Object3D | undefined; if (!env) return null;
      const dir = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
      const h = new THREE.Raycaster(new THREE.Vector3(x, FL + .95, z), dir, .05, 1.6).intersectObject(env, true)[0]; if (!h) return null;
      const top = new THREE.Raycaster(h.point.clone().add(new THREE.Vector3(0, .8, 0)), new THREE.Vector3(0, -1, 0), 0, 1.2).intersectObject(env, true)[0];
      return { dist: h.distance, haut: top ? top.point.y : h.point.y + .05 };
    } catch { return null; }
  }
  /** Calibrage des gestes : on lit, dans l'animation elle-même, où est la main droite au moment de l'effet (semer,
   *  récolter, arroser), et on en déduit à quelle distance et de quel côté le personnage doit se tenir du pot.
   *  Avant, ces valeurs venaient d'une mesure faite dans Blender pour un seul personnage : avec une animation
   *  empruntée ou un autre gabarit, la main tombait à côté du pot. */
  private calibrerGestes() {
    for (const n of ['plant', 'harvest', 'water']) {
      const g = this.char.gestures[n]; if (!g) continue;
      const h = this.char.mainDansLeGeste(g.anim ?? n, g.effet, 'Right'), mi = (this.char as any).osDansLeGeste?.(g.anim ?? n, g.effet, 'RightHandMiddle1') as THREE.Vector3 | null;
      const m = h && mi ? h.clone().multiplyScalar(.35).addScaledVector(mi, .65) : h; if (!m) continue;   // la paume, pas le poignet
      const avant = m.z, cote = -m.x;                                  // repère du personnage : il regarde vers +z, sa droite est en -x
      if (avant > .15 && avant < 1.2) { g.distance = avant; g.cote = cote; }
      console.info(`[gestes] ${n} : main à ${avant.toFixed(2)} m devant, ${cote.toFixed(2)} m à droite, ${m.y.toFixed(2)} m de haut`);
    }
  }
  /** La chaise pliante (accessoires de Codex) remplace la chaise du balcon : assise à 45 cm, tournée dans le sens de la
   *  longueur du balcon. Hauteur et place assise exactes calculées par Codex (diagnostic-chaise-pliante, 4 octobre). */
  private chaisePliante: THREE.Object3D | null = null;
  private static CHAISE = { lea: { yaw: -Math.PI / 2, sy: 1.0714, dx: .032, dy: .093, dz: .002 }, marcel: { yaw: Math.PI / 2, sy: 1.0198, dx: .001, dy: .147, dz: -.001 }, jimy: { yaw: Math.PI / 2, sy: 1.098, dx: -.030, dy: .150, dz: -.001 } } as Record<string, { yaw: number; sy: number; dx: number; dy: number; dz: number }>;
  private async installerChaisePliante(id: string) {
    if (!this.char.deLaBibliotheque) return;
    const o = await BIBLIO.accessoire('chaise_pliante'); if (!o) return;
    const r = Game.CHAISE[id] ?? Game.CHAISE.lea;
    if (this.chaisePliante) this.chaisePliante.parent?.remove(this.chaisePliante);
    o.position.copy(CHAIR_SPOT.pos); o.position.y = FL; o.rotation.set(0, r.yaw, 0); o.scale.set(1, r.sy, 1);
    this.world.scene.add(o); this.chaisePliante = o;
    if (this.world.chair) this.world.chair.visible = false;
    CHAIR_SPOT.face = r.yaw;
  }
  /** AUDIT DES ANIMATIONS DANS LE JEU (adresse avec ?audit=1) : chaque animation est rejouée image par image,
   *  telle que le jeu la joue (empruntée ou non, à la taille du personnage, sur le vrai sol, avec la vraie hauteur
   *  des pots), et on mesure : pieds sous le sol, flotte, main sous la terre du pot, coude à l'envers, saut à la
   *  boucle. Le rapport s'affiche dans un cadre, avec un bouton pour le copier. */
  private auditAnimations() {
    if (new URLSearchParams(location.search).get('audit') !== '1') return;
    const ch = this.char, perso = this.state.character;
    this.autoToken++; ch.busy = true; ch.mains = null; ch.ikBut = 0; ch.regard = null;
    const os = { hips: ch.bone('Hips'), tete: ch.bone('Head'), piedG: ch.bone('LeftFoot'), piedD: ch.bone('RightFoot'), orteilG: ch.bone('LeftToeBase'), orteilD: ch.bone('RightToeBase'),
      mainG: ch.bone('LeftHand'), mainD: ch.bone('RightHand'), brasG: ch.bone('LeftArm'), brasD: ch.bone('RightArm'), avbG: ch.bone('LeftForeArm'), avbD: ch.bone('RightForeArm') };
    const sol = FL, v = new THREE.Vector3(), pos = (b: THREE.Object3D | null) => b ? b.getWorldPosition(v.clone()) : null;
    let terre = sol + .30; { const vue = [...this.views.values()][0]; if (vue) { vue.holder.updateWorldMatrix(true, true); terre = pos(vue.holder)!.y; } }
    const lignes = [`AUDIT DANS LE JEU — ${perso} — ${new Date().toLocaleString('fr-FR')}`, `sol à ${sol.toFixed(2)} m, terre des pots à ${(terre - sol).toFixed(2)} m au-dessus du sol`, ''];
    const cm = (m: number) => Math.round(m * 100);
    const sauve = { pos: ch.obj.position.clone(), rot: ch.obj.rotation.y };
    ch.obj.position.set(0, sol, 2); ch.obj.rotation.y = Math.PI;
    for (const n of ch.nomsAnimations().sort()) {
      const a = (ch as any).actions.get(n) as THREE.AnimationAction; if (!a) continue;
      const clip = a.getClip(), N = Math.max(2, Math.round(clip.duration * 30) + 1);
      ch.mixer.stopAllAction(); a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.setEffectiveWeight(1); a.play();
      let sous = 0, flotte = 0, mainBasse = Infinity, coude = { G: 0, D: 0 }, prem: Map<string, THREE.Quaternion> | null = null, dern: Map<string, THREE.Quaternion> | null = null;
      const assis = /sit|sleep|gainage/i.test(n), bas = /plant|harvest|water|pickup/i.test(n);
      for (let f = 0; f < N; f++) {
        ch.mixer.setTime(clip.duration * f / (N - 1)); ch.obj.updateMatrixWorld(true);
        const pieds = [os.piedG, os.piedD, os.orteilG, os.orteilD].map(pos).filter(Boolean) as THREE.Vector3[];
        if (pieds.length && !assis) { const b = Math.min(...pieds.map(p => p.y)) - sol; sous = Math.min(sous, b); if (b > .07) flotte++; }
        for (const m of [os.mainG, os.mainD]) { const p = pos(m); if (p) mainBasse = Math.min(mainBasse, p.y - sol); }
        const avant = new THREE.Vector3(Math.sin(ch.obj.rotation.y), 0, Math.cos(ch.obj.rotation.y));
        for (const c of ['G', 'D'] as const) {
          const e = pos((os as any)['bras' + c]), co = pos((os as any)['avb' + c]), mn = pos((os as any)['main' + c]);
          if (!e || !co || !mn) continue;
          const u = co.clone().sub(e), w = mn.clone().sub(co), pli = u.angleTo(w) * 180 / Math.PI;
          const ligne = mn.clone().sub(e).normalize(), proj = e.clone().add(ligne.clone().multiplyScalar(co.clone().sub(e).dot(ligne))), pointe = co.clone().sub(proj);
          if (pli > 35 && pointe.length() > .015) { pointe.normalize(); if (pointe.dot(avant) > .45 && w.dot(avant) < -.08) coude[c]++; }
        }
        const rots = new Map<string, THREE.Quaternion>(); for (const [k, b] of Object.entries(os)) if (b) rots.set(k, b.quaternion.clone());
        if (f === 0) prem = rots; if (f === N - 1) dern = rots;
      }
      const pb: string[] = [];
      if (sous < -.02) pb.push(`pieds sous le sol (${-cm(sous)} cm)`);
      if (!assis && flotte / N > .5) pb.push(`flotte (${Math.round(flotte / N * 100)} % du temps)`);
      if (mainBasse < Infinity) { if (bas && mainBasse < terre - sol - .04) pb.push(`la main descend à ${cm(mainBasse)} cm du sol, sous la terre du pot (${cm(terre - sol)} cm)`); else if (!assis && mainBasse < .04) pb.push(`une main touche le sol`); }
      for (const c of ['G', 'D'] as const) if (coude[c] / N > .1) pb.push(`coude ${c === 'G' ? 'gauche' : 'droit'} à l'envers ${Math.round(coude[c] / N * 100)} % du temps`);
      if (/idle|walk|dance|sit|sleep|phone|sport/.test(n) && prem && dern) { let ecart = 0; for (const [k, q] of prem) { const q2 = dern.get(k); if (q2) ecart = Math.max(ecart, q.angleTo(q2) * 180 / Math.PI); } if (ecart > 35) pb.push(`saute en rebouclant (${Math.round(ecart)}°)`); }
      lignes.push(`${pb.length ? '✗' : '✓'} ${n} (${clip.duration.toFixed(1)} s)${pb.length ? ' — ' + pb.join(' ; ') : ''}`);
    }
    ch.mixer.stopAllAction(); ch.obj.position.copy(sauve.pos); ch.obj.rotation.y = sauve.rot; ch.play('idle', .2);
    const texte = lignes.join('\n');
    const box = document.createElement('div'); box.id = 'auditAnims';
    box.style.cssText = 'position:fixed;left:10px;right:10px;bottom:10px;max-height:60vh;overflow:auto;z-index:90;background:rgba(255,253,246,.97);border:1px solid rgba(0,0,0,.12);border-radius:14px;padding:10px 12px;font:12px ui-monospace,Consolas,monospace;color:#24313a;white-space:pre-wrap;box-shadow:0 10px 30px rgba(0,0,0,.25)';
    const b = document.createElement('button'); b.textContent = '📋 Copier le rapport'; b.style.cssText = 'display:block;margin:0 0 8px;padding:6px 12px;border-radius:8px;border:0;background:#2f8f4e;color:#fff;font-weight:700;cursor:pointer';
    b.onclick = () => navigator.clipboard?.writeText(texte).then(() => this.ui.toast('Rapport copié', 2000, true));
    const x = document.createElement('button'); x.textContent = '✕'; x.style.cssText = 'position:absolute;top:8px;right:10px;border:0;background:none;font-size:16px;cursor:pointer';
    x.onclick = () => { box.remove(); ch.busy = false; this.scheduleAutonomy(); };
    box.append(x, b, document.createTextNode(texte)); document.body.appendChild(box);
    console.info(texte);
  }
  /** Combien de variétés existent pour une plante (plant_<id>_v1_s4, _v2_s4…). */
  private nbVarietes(id: string): number { let n = 0; while (this.assets.has(`plant_${id}_v${n + 1}_s4`)) n++; return n; }
  /** Le modèle d'une plante selon son stade et sa soif : S1 → S2 → S3 (S3_SOIF) → S4 prête (S4_SOIF). Null si pas de variété. */
  private modeleVariete(pl: NonNullable<PotState['plant']>, now: number): string | null {
    const v = pl.variete ?? (this.nbVarietes(pl.plant) ? 1 : 0); if (!v) return null;
    const st = P.stage(pl), soif = P.isWilted(pl, now);
    const stade = st <= 0 ? 's1' : st === 1 ? 's2' : st < 4 ? (soif ? 's3_soif' : 's3') : (soif ? 's4_soif' : 's4');
    const n = `plant_${pl.plant}_v${v}_${stade}`;
    return this.assets.has(n) ? n : this.assets.has(`plant_${pl.plant}_v1_${stade}`) ? `plant_${pl.plant}_v1_${stade}` : null;
  }
  private slotState(id: number) { return this.state.pots.find(p => p.id === id)!; }

  // ---------- objets tenus en main (socket hand_r, sur l'os de la main droite)
  private held: { obj: THREE.Object3D; kind: 'can' | 'seeds' } | null = null;
  /** Un téléphone : coque sombre arrondie, écran au fond d'écran choisi, petites applis. */
  private fabriquerTel(): THREE.Object3D {
    const g = new THREE.Group();
    const corps = new THREE.Mesh(new THREE.BoxGeometry(.074, .152, .010), new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: .35, metalness: .3 }));
    g.add(corps);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const cx = cv.getContext('2d')!;
    const gr = cx.createLinearGradient(0, 0, 64, 128); gr.addColorStop(0, '#a2d2ff'); gr.addColorStop(.7, '#fefae0'); gr.addColorStop(1, '#e9c46a');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 128);
    ['#f08a24', '#1f8a8a', '#3f9a5a', '#3a7bd5', '#b8741a', '#d86f8a', '#7a5ac9', '#e0533a', '#6b7780'].forEach((c, i) => { cx.fillStyle = c; cx.fillRect(8 + (i % 3) * 18, 18 + Math.floor(i / 3) * 20, 12, 12); });
    const ecran = new THREE.Mesh(new THREE.PlaneGeometry(.066, .138), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
    ecran.position.z = .0052; g.add(ecran);
    return g;
  }
  /** Un arrosoir fabriqué par le jeu : corps, anse sur le dessus (c'est là qu'on le tient), long bec vers l'avant (+Z), pomme.
   *  L'origine est au milieu de l'anse : placer l'objet sur la paume suffit à ce qu'il soit « tenu ». */
  private fabriquerArrosoir(): THREE.Object3D {
    // l'origine est dans l'anse ARRIÈRE (là où la main serre, comme dans le geste d'arrosage) ; le corps est devant la main (+Z),
    // le bec part de l'avant du corps vers le haut, la pomme au bout
    const g = new THREE.Group(), vert = this.state.items.includes('can_green');
    const m = new THREE.MeshStandardMaterial({ color: vert ? 0x3f8a57 : 0xa9b3b8, roughness: .35, metalness: .55, side: THREE.DoubleSide });
    const corps = new THREE.Mesh(new THREE.CylinderGeometry(.075, .085, .19, 24), m); corps.rotation.x = Math.PI / 2; corps.position.set(0, 0, .15); g.add(corps);  // couché, devant la main
    const dos = new THREE.Mesh(new THREE.CircleGeometry(.075, 24), m); dos.position.set(0, 0, .055); dos.rotation.y = Math.PI; g.add(dos);
    const anse = new THREE.Mesh(new THREE.TorusGeometry(.055, .012, 8, 24, Math.PI), m); anse.rotation.set(0, -Math.PI / 2, Math.PI / 2); anse.position.set(0, 0, .055); g.add(anse);   // boucle derrière le corps : la main la serre à l'origine
    const bec = new THREE.Mesh(new THREE.CylinderGeometry(.011, .018, .24, 12), m); bec.rotation.x = Math.PI / 2 - .55; bec.position.set(0, .033, .332); g.add(bec);
    const pomme = new THREE.Mesh(new THREE.CylinderGeometry(.03, .014, .03, 14), m); pomme.rotation.x = Math.PI / 2 - .55; pomme.position.set(0, .095, .434); g.add(pomme);
    g.userData.bec = new THREE.Vector3(0, .1, .445);
    return g;
  }
  /** Une poêle noire avec son manche en bois et ce qui cuit dedans. */
  private fabriquerPoele(couleurs: string[] = ['#7fae4a']): THREE.Object3D {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: .45, metalness: .6, side: THREE.DoubleSide });
    const bord = new THREE.Mesh(new THREE.CylinderGeometry(.13, .11, .045, 28, 1, true), m); bord.position.y = .022; g.add(bord);
    const fond = new THREE.Mesh(new THREE.CircleGeometry(.11, 28), m); fond.rotation.x = -Math.PI / 2; fond.position.y = .002; g.add(fond);
    couleurs.forEach((c, i) => { const a = i / couleurs.length * Math.PI * 2; const b = new THREE.Mesh(new THREE.SphereGeometry(.028, 10, 8), new THREE.MeshStandardMaterial({ color: c, roughness: .8 })); b.scale.y = .5; b.position.set(Math.cos(a) * .05, .014, Math.sin(a) * .05); g.add(b); });
    const manche = new THREE.Mesh(new THREE.BoxGeometry(.2, .018, .03), new THREE.MeshStandardMaterial({ color: 0x6a4630, roughness: .7 })); manche.position.set(.22, .035, 0); g.add(manche);
    return g;
  }
  /** Une assiette en céramique claire, garnie aux couleurs des ingrédients de la recette. */
  private fabriquerAssiette(couleurs: string[] = ['#e04a3a', '#4f9d3a']): THREE.Object3D {
    const g = new THREE.Group();
    const ceram = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: .35 });
    const fond = new THREE.Mesh(new THREE.CylinderGeometry(.13, .1, .016, 32), ceram); fond.position.y = .008; g.add(fond);
    const rebord = new THREE.Mesh(new THREE.TorusGeometry(.125, .01, 8, 32), ceram); rebord.rotation.x = Math.PI / 2; rebord.position.y = .018; g.add(rebord);
    const liseré = new THREE.Mesh(new THREE.TorusGeometry(.105, .003, 6, 32), new THREE.MeshStandardMaterial({ color: 0x5aa9c9 })); liseré.rotation.x = Math.PI / 2; liseré.position.y = .018; g.add(liseré);
    let k = 0;
    for (const c of couleurs) for (let i = 0; i < 3; i++) {
      const a = (k++ / (couleurs.length * 3)) * Math.PI * 2 + Math.random() * .4, r = .03 + Math.random() * .045;
      const b = new THREE.Mesh(new THREE.SphereGeometry(.022 + Math.random() * .012, 10, 8), new THREE.MeshStandardMaterial({ color: c, roughness: .7 }));
      b.scale.y = .6; b.position.set(Math.cos(a) * r, .03, Math.sin(a) * r); g.add(b);
    }
    return g;
  }
  private couleursRecette(): string[] {
    const j = this.state.eco.jardin; const id = this.state.eco.platEnCours?.recette ?? j.recette?.recette;
    return id ? ECO.recette(id).ingredients.map(i => ECO.graine(i.graine).couleur ?? '#7fae4a') : ['#e04a3a', '#4f9d3a'];
  }
  /** Tenir un objet devant soi (poitrine ou taille), à sa vraie taille quelle que soit l'échelle du personnage. */
  private devantSoi(o: THREE.Object3D, x: number, y: number, z: number, rx = 0, ry = 0) {
    const ws = new THREE.Vector3(); this.char.obj.getWorldScale(ws);
    o.scale.set(o.scale.x / ws.x, o.scale.y / ws.y, o.scale.z / ws.z);
    o.position.set(x / ws.x, y / ws.y, z / ws.z); o.rotation.set(rx, ry, 0);
    this.char.obj.add(o);
    return o;
  }
  /** L'arrosoir tenu : recalé à chaque image dans la main droite, bec vers le pot ; il s'incline pour verser et l'eau coule. */
  private arrosoir: { o: THREE.Object3D; cible: THREE.Vector3; verse: number; versement: number } | null = null;
  private tenirArrosoir(cible: THREE.Vector3) {
    this.lacherArrosoir();
    const o = this.fabriquerArrosoir(); this.world.scene.add(o);
    this.arrosoir = { o, cible, verse: 0, versement: 0 };
    this.placerArrosoir(0);
  }
  /** Verser : l'arrosoir s'incline un peu avant le moment fort du geste, et se redresse un peu après. */
  private verser(effet: number) {
    setTimeout(() => { if (this.arrosoir) this.arrosoir.versement = 1; }, Math.max(0, effet * 1000 - 700));
    setTimeout(() => { if (this.arrosoir) this.arrosoir.versement = 0; }, effet * 1000 + 1100);
  }
  private lacherArrosoir() { if (this.arrosoir) { this.arrosoir.o.parent?.remove(this.arrosoir.o); this.arrosoir = null; } }
  private placerArrosoir(dt: number) {
    const a = this.arrosoir; if (!a || !this.char) return;
    const p = this.paume('Right'); if (!p) return;
    a.verse += ((a.versement) - a.verse) * Math.min(1, dt * 4);             // s'incliner en douceur
    a.o.position.copy(p);
    a.o.rotation.set(0, this.char.obj.rotation.y, 0);                        // droit, le bec dans l'axe du corps (il tournait avec la main)
    a.o.rotateX(a.verse * .70);                                               // incliné seulement pour verser (~40°)
    if (a.versement > .5 && a.verse > .5 && Math.random() < .7) {              // l'eau : des gouttes qui partent du bec vers le pot
      const bec = a.o.localToWorld(a.o.userData.bec.clone());
      this.world.gouttes(bec, a.cible);
    }
  }
  private tel: THREE.Object3D | null = null;
  private poeleEnCours: THREE.Object3D | null = null;
  /** Le téléphone : dans le monde, recalé à chaque image entre ses paumes (ou dans sa main droite), l'écran tourné vers son visage. */
  private tenirTel() { this.lacherTel(); this.tel = this.fabriquerTel(); this.world.scene.add(this.tel); this.placerTel(); }
  private lacherTel() { if (this.tel) { this.tel.parent?.remove(this.tel); this.tel = null; } }
  private paume(cote: 'Right' | 'Left'): THREE.Vector3 | null {
    const poignet = this.char.bone(cote + 'Hand'), doigt = this.char.bone(cote + 'HandMiddle1');
    if (!poignet) return null;
    const a = new THREE.Vector3(); poignet.getWorldPosition(a);
    if (!doigt) return a;
    const b = new THREE.Vector3(); doigt.getWorldPosition(b);
    return a.lerp(b, .65);                                              // le creux de la main, entre poignet et doigts
  }
  private placerTel() {
    if (!this.tel || !this.char) return;
    this.char.obj.updateMatrixWorld(true);
    const d = this.paume('Right'), g = this.paume('Left');
    if (!d) return;
    const p = this.char.deLaBibliotheque ? d.clone() : (g && d.distanceTo(g) < .3 ? d.clone().add(g).multiplyScalar(.5) : d.clone());   // nouveaux corps : main droite seulement
    const tete = this.char.bone('Head'); const h = new THREE.Vector3(); if (tete) tete.getWorldPosition(h); else h.copy(p).add(new THREE.Vector3(0, .4, 0));
    const versTete = h.clone().sub(p).normalize();
    this.tel.position.copy(p).addScaledVector(versTete, this.char.deLaBibliotheque ? .033 : .025);   // posé sur la paume, pas dedans (coque 1 cm + marge)
    this.tel.lookAt(h);                                                   // l'écran regarde le visage
  }
  private porte: THREE.Object3D | null = null;
  private assiettePosee: THREE.Object3D | null = null; private poseTimer = 0;
  /** Poser l'assiette : sur le plan de travail (ou près du panier s'il n'y a pas de cuisine), jamais en l'air. */
  private poserAssiette() {
    if (!this.porte) return;
    const W = this.world, o = this.porte;
    this.lacher();
    const ou = W.kitchenSpot ? W.kitchenLook.clone().lerp(W.kitchenSpot, .35).setY(W.kitchenTop + .005)
      : BASKET_SPOT.clone().add(new THREE.Vector3(.35, .02, 0)).setY(FL + .02);
    o.scale.setScalar(1); o.rotation.set(0, 0, 0); o.position.copy(ou);
    W.scene.add(o); this.assiettePosee = o;
  }
  /** Porter un objet devant soi, à deux mains (l'assiette) : il suit le corps, à plat, à hauteur de poitrine. */
  private porter(name: string) {
    this.lacher();
    const o = name === 'prop_plate' ? this.fabriquerAssiette(this.couleursRecette()) : this.assets.get(name);
    this.porte = this.devantSoi(o, 0, 1.0, .3);
  }
  private lacher(): THREE.Vector3 | null {
    if (!this.porte) return null;
    const p = new THREE.Vector3(); this.porte.getWorldPosition(p);
    this.porte.parent?.remove(this.porte); this.porte = null;
    return p;
  }
  private hold(name: string, kind: 'can' | 'seeds') {
    this.release();
    const sock = Assets.socket(this.char.obj, 'hand_r');
    if (!sock || !this.assets.has(name)) return;
    const o = this.assets.get(name);
    sock.add(o);
    const ws = new THREE.Vector3(); sock.getWorldScale(ws);
    o.userData.unscale = 1 / (ws.x || 1);
    this.held = { obj: o, kind };
    this.applyHand();
  }
  private applyHand() {
    if (!this.held) return;
    const h = HAND[this.held.kind];
    this.held.obj.position.set(h.pos[0], h.pos[1], h.pos[2]);
    this.held.obj.rotation.set(h.rot[0], h.rot[1], h.rot[2]);
    this.held.obj.scale.setScalar(h.scale * (this.held.obj.userData.unscale ?? 1));
  }
  private release() { if (this.held?.obj.parent) this.held.obj.parent.remove(this.held.obj); this.held = null; }
  private canName() { return this.state.items.includes('can_green') ? 'decor_watering_can_green' : 'decor_watering_can_zinc'; }

  // ---------- temps qui passe
  private catchUp() {
    const s = this.state, now = Date.now();
    let ready = 0;
    for (const p of s.pots) if (p.plant) { P.tick(p.plant, now); if (P.isReady(p.plant)) ready++; }
    const away = now - (s.lastSeen || now);
    if (away > 2 * 60 * 1000) {
      const tt = t();
      const lines: string[] = [];
      if (ready) lines.push(tt.readyCount(ready));
      if (s.log.wateredByChar) lines.push(tt.wateredByChar(tx(charDef(s.character).name), s.log.wateredByChar));
      this.ui.welcome(lines.length ? lines : [tt.nothingHappened]);
    }
    s.log.wateredByChar = 0;
    s.lastSeen = now;
    this.ecoTick(true);
    this.rappelEtape();
    if (this.demo) this.ui.toast(t().modeDemo, 4000);
  }
  private tickAll() {
    const now = Date.now();
    for (const p of this.state.pots) { if (p.plant) P.tick(p.plant, now); this.refreshSlot(p); }
    const e = this.state.eco.jardin.etape ?? 0;
    if (e === 2 && this.state.pots.some(p => p.plant && P.isReady(p.plant))) this.etape(3);
    if (now - this.ecoTimer > (this.demo ? 1500 : 5000)) {
      this.ecoTimer = now;
      const avant = { ...this.state.eco.immeuble.cours };
      this.ecoTick();
      if (JSON.stringify(avant) !== JSON.stringify(this.state.eco.immeuble.cours)) this.ui.coursPrecedent = avant;
    }
  }

  // ---------- interactions
  private onTap(d: { moved: number; x: number; y: number }) {
    if (!this.running || d.moved > 12) return;
    this.ui.hidePicker();
    const hit = this.world.pick(d.x, d.y);
    if (!hit) { this.ui.hideCard(); return; }
    if ('slot' in hit) this.tapSlot(hit.slot, d.x, d.y);
    else if (hit.deco === 'basket') {
      const tt = t();
      this.ui.card(d.x, d.y, this.basketCardHtml() + `<button class="primary" id="cardSell">${tt.openPhone}</button>`, 5000);
      const b = document.getElementById('cardSell'); if (b) b.onclick = () => { this.ui.hideCard(); this.ui.togglePhone(true); };
    }
  }
  /** Ce qu'il y a dans un pot : plante, stade, temps, eau, récoltes faites sur ce semis. */
  private potCardHtml(p: PotState): string {
    const tt = t(); const pl = p.plant!; const d = plantDef(pl.plant);
    const stage = P.stage(pl), ready = P.isReady(pl), wilt = P.isWilted(pl), wet = P.isWet(pl);
    const water = ready ? '' : wilt ? `<div class="warn">🥀 ${tt.wilted}</div>` : wet ? `<div class="st">💧 ${tt.soilWet}</div>` : '';
    const pc = Math.round(100 * Math.min(1, pl.grown / d.grow));
    const barre = `<div class="barre"><i style="width:${pc}%"></i></div>`;
    const time = ready ? `<div class="ok">✨ ${tt.readyNow}</div>`
      : !wet ? `<div class="st">${tt.stageNames[stage]}</div>${barre}<div class="warn">${tt.pauseSoif}</div>`
      : `<div class="st">${tt.stageNames[stage]} · <b>${tt.ilReste(UI.timeLeft(P.remainingSec(pl)))}</b></div>${barre}`;
    const cours = this.state.eco.immeuble.cours[pl.plant] ?? d.harvest;
    return `<b>${icon(pl.plant)} ${tx(d.name)}</b>${time}${water}<div class="st">${tt.harvestsDone(pl.harvests, d.harvests)} · ${cours} ${tt.points} / ${lang() === 'fr' ? 'unité' : 'unit'}</div>`;
  }
  private tapSlot(id: number, x: number, y: number) {
    const p = this.slotState(id); if (!p) return;
    this.lastPlayerAction = Date.now();
    this.autoToken++;
    if (this.sleeping) this.wakeUp();
    if (!p.plant) { this.ui.showPicker(id, x, y); return; }
    const pl = p.plant;
    this.carte = { pot: id }; this.ui.card(x, y + 110, this.potCardHtml(p), 6000, true);
    if (P.isReady(pl)) { this.doHarvest(p); return; }
    if (!P.isWet(pl)) { this.doWater(p); return; }
  }
  /** La carte ouverte d'un pot se met à jour chaque seconde : le temps défile, la barre avance. */
  private carte: { pot: number } | null = null; private carteTimer = 0;
  private majCarte() {
    const c = document.getElementById('infoCard');
    if (!this.carte || !c || c.classList.contains('hidden')) return;
    const p = this.slotState(this.carte.pot);
    if (!p?.plant) { this.ui.hideCard(); this.carte = null; return; }
    c.innerHTML = this.potCardHtml(p);
  }
  /** Survol à la souris (ordinateur) : la carte du pot ou du panier s'affiche toute seule. */
  private hoverId: string | number | null = null;
  private onHover(x: number, y: number) {
    if (!this.running) return;
    const hit = this.world.pick(x, y);
    const key = !hit ? null : 'slot' in hit ? hit.slot : hit.deco;
    if (key === this.hoverId) return;
    this.hoverId = key;
    if (key === null) { this.ui.hideCard(); return; }
    if (typeof key === 'number') { const p = this.slotState(key); if (p?.plant) { this.carte = { pot: key }; this.ui.card(x, y + 110, this.potCardHtml(p), 0, true); } else this.ui.hideCard(); }
    else if (key === 'basket') this.ui.card(x, y, this.basketCardHtml(), 0);
    else this.ui.hideCard();
  }
  private basketCardHtml(): string {
    const tt = t(), s = this.state;
    const j = s.eco.jardin;
    const rows = Object.entries(j.panier).filter(([, n]) => n > 0).map(([g, n]) => `<div class="st">${icon(g)} ${tx(plantDef(g).name)} ×${n}</div>`).join('');
    const total = Object.entries(j.panier).reduce((a, [g, n]) => a + n * (s.eco.immeuble.cours[g] ?? 1), 0);
    return `<b>🧺 ${tt.basketTitle} ${s.basket.length}/${s.basketCap}</b>${rows || `<div class="st">${tt.basketEmpty}</div>`}${s.basket.length ? `<div class="ok">${tt.basketTotal(total)}</div>` : ''}`;
  }
  /** Marche sans traverser les pots : on rejoint le couloir central, on le suit, puis on va au point. */
  /** Marche vers un point : la cible est ramenée sur le balcon hors des obstacles, et si la ligne droite traverse
   *  un pot, la chaise ou le panier, on passe par la ligne du couloir. */
  private async walk(target: THREE.Vector3, face?: number, ignore?: string) {
    if (this.onRoof) { await this.char.goTo(target, face); return; }
    if (this.inside) { await this.goOutside(this.autoToken); }
    const t = freePoint(target, ignore);
    const p = this.char.obj.position.clone();
    if (!segmentBlocked(p, t, ignore)) { await this.char.goTo(t, face); return; }
    const a = freePoint(new THREE.Vector3(p.x, FL, LAYOUT.corridorZ), ignore);
    const b = freePoint(new THREE.Vector3(t.x, FL, LAYOUT.corridorZ), ignore);
    if (p.distanceTo(a) > .05) await this.char.goTo(a);
    if (a.distanceTo(b) > .05) await this.char.goTo(b);
    await this.char.goTo(t, face);
  }
  private standFor(slot: Slot, geste?: string): { pos: THREE.Vector3; face: number } {
    const g = geste ? this.char.gestures[geste] : undefined;
    if (!g || slot.roof) return { pos: slot.stand, face: slot.face };
    const dir = Math.sign(LAYOUT.corridorZ - slot.pos.z) || 1;
    const potR = POT_SCALE * 1.06 / 2;
    // on reste sur la ligne du couloir (± 15 cm), jamais dans les autres pots ni dans les barrières
    const d = THREE.MathUtils.clamp(g.distance, potR + .17, Math.abs(LAYOUT.corridorZ - slot.pos.z) + .15);
    // pot devant (côté rue) : il se tient derrière et nous fait face. Pot du fond : il se met de trois quarts,
    // en biais vers le milieu du balcon, pour qu'on le voie de profil plutôt que de dos.
    const u = new THREE.Vector3(dir > 0 ? (slot.pos.x > 0 ? -.75 : .75) : 0, 0, dir).normalize();
    const face = Math.atan2(-u.x, -u.z);
    // la main qui travaille est sur le côté (mesuré) : on décale le personnage pour qu'elle tombe au-dessus du pot
    const right = new THREE.Vector3(-Math.cos(face), 0, Math.sin(face));
    const pos = new THREE.Vector3(slot.pos.x, FL, slot.pos.z).addScaledVector(u, d).addScaledVector(right, -(g.cote ?? 0));
    return { pos: freePoint(pos, `pot${SLOTS.indexOf(slot)}`), face };
  }
  private async gotoSlot(slot: Slot, geste?: string) {
    await this.ensureLevel(slot.roof);
    const st = this.standFor(slot, geste);
    await this.walk(st.pos, st.face, `pot${SLOTS.indexOf(slot)}`);
  }
  /** Passer du balcon au toit et retour, par l'échelle (fondu pour l'instant, montée animée en V2). */
  private async ensureLevel(roof: boolean) {
    if (roof === this.onRoof) return;
    if (roof) await this.walk(LADDER_SPOT, Math.PI); else await this.char.goTo(ROOF_STAND.clone().add(new THREE.Vector3(-1.2, 0, .2)), Math.PI);
    this.char.setFade(0);
    await wait(260);
    this.char.teleport(roof ? ROOF_STAND : LADDER_SPOT, roof ? Math.PI : 0);
    this.char.setFade(1);
    this.onRoof = roof;
    await wait(200);
  }
  private async sow(id: number, plant: string) {
    const s = this.state, p = this.slotState(id);
    const j = s.eco.jardin;
    if (!p || p.plant || this.char.busy) return;
    this.ui.apercuRecolte(plant);                                      // ce que tu récolteras, en image
    if (!j.poche[plant]) { if (!j.rares[plant]) return; j.rares[plant]--; if (!j.rares[plant]) delete j.rares[plant]; }   // une rare se sème une fois
    const slot = SLOTS[id];
    this.ui.refresh();
    await this.gotoSlot(slot, 'plant');
    this.char.busy = true;
    // (plus de sachet de graines dans la main : depuis la réparation des squelettes, il se plaçait dans les bras)
    this.char.regard = SLOTS[p.id].pos.clone().add(new THREE.Vector3(0, .3, 0)); const g = this.char.geste('plant'); const done = g.fin;
    await wait(g.effet * 1000);
    p.plant = P.sow(plant);
    p.plant.wateredAt = Date.now();          // on sème dans une terre humide
    if ((s.eco.jardin.etape ?? 0) < 5) p.plant.acc = Math.max(1, plantDef(plant).grow / 90);   // l'accueil : chaque première pousse mûrit en 90 s
    const nv = this.nbVarietes(plant); if (nv) p.plant.variete = 1 + Math.floor(Math.random() * nv);   // on fait tourner les variétés
    this.refreshSlot(p);
    this.ui.toast(t().planted(tx(plantDef(plant).name)));
    this.dernierSeme = plant;
    if ((s.eco.jardin.etape ?? 0) <= 1) this.etape(1);
    await done; this.char.regard = null; this.char.busy = false; this.release();
    this.persist();
  }
  private async doWater(p: PotState) {
    if (this.char.busy || !p.plant) return;
    await this.gotoSlot(SLOTS[p.id], 'water');
    this.char.busy = true;
    this.tenirArrosoir(SLOTS[p.id].pos.clone().add(new THREE.Vector3(0, .25, 0)));
    this.char.regard = SLOTS[p.id].pos.clone().add(new THREE.Vector3(0, .3, 0)); const g = this.char.geste('water'); const done = g.fin;
    this.verser(g.effet);
    await wait(g.effet * 1000);
    P.water(p.plant);
    this.refreshSlot(p);
    if (this.state.items.includes('can_green')) {
      // l'arrosoir vert arrose aussi le pot voisin qui a soif
      const other = this.state.pots.find(o => o.id !== p.id && o.plant && !P.isWet(o.plant) && SLOTS[o.id].roof === SLOTS[p.id].roof);
      if (other && other.plant) { P.water(other.plant); this.refreshSlot(other); }
    }
    this.ui.toast(t().watered);
    this.etape(2);
    await done; this.char.regard = null; this.char.busy = false; this.release(); this.lacherArrosoir();
    this.persist();
  }
  private async doHarvest(p: PotState) {
    if (this.char.busy || !p.plant) return;
    const tt = t();
    await this.gotoSlot(SLOTS[p.id], 'harvest');
    this.char.busy = true;
    this.char.regard = SLOTS[p.id].pos.clone().add(new THREE.Vector3(0, .3, 0)); const g = this.char.geste('harvest'); const done = g.fin;
    await wait(g.effet * 1000);
    const d = plantDef(p.plant.plant), j = this.state.eco.jardin;
    const r = P.harvest(p.plant);                                          // on récolte toujours : le pot se libère
    this.state.log.recoltes = (this.state.log.recoltes ?? 0) + r.count;
    j.panier[d.id] = Math.min(E.REGLES.PANIER_MAX, (j.panier[d.id] ?? 0) + r.count);
    this.flyCrops(d.id, SLOTS[p.id].pos, r.count, p.plant.variete ?? 1);
    if (r.emptied) { p.plant = null; }
    this.refreshSlot(p);
    this.ui.refresh();
    this.ui.toast(tt.harvested(tx(d.name), r.count));
    this.etape(4);
    await done; this.char.regard = null; this.char.busy = false;
    this.persist();
  }
  /** Les fruits volent du pot au panier. */
  private flyCrops(plant: string, from: THREE.Vector3, n: number, variete = 1) {
    const nv = `crop_${plant}_v${variete}`, n1 = `crop_${plant}_v1`;
    const name = this.assets.has(nv) ? nv : this.assets.has(n1) ? n1 : `crop_${plant}`;
    const versLePanier = (p: THREE.Vector3) => { const sc = this.world.toScreen(p); this.ui.volerAuPanier(plant, sc.x, sc.y, Math.min(n, 5)); };
    if (!this.assets.has(name)) { versLePanier(from.clone().add(new THREE.Vector3(0, .4, 0))); return; }
    // il le tient en main un instant (on voit bien ce qu'on a récolté), puis le légume s'envole vers toi, dans ton panier
    const o = this.assets.get(name); o.scale.setScalar(name.includes('_v') ? 1 : .7);
    o.position.copy(from).add(new THREE.Vector3(0, .5, 0)); this.world.scene.add(o);
    const tient = performance.now(), garder = 1100;
    const suivre = () => {
      const pm = this.paume('Right');
      if (pm) o.position.copy(pm).add(new THREE.Vector3(0, .05, 0));
      o.rotation.y += .03;
      if (performance.now() - tient < garder) requestAnimationFrame(suivre);
      else { this.world.scene.remove(o); versLePanier(o.position.clone()); }
    };
    suivre();
  }

  // ---------- téléphone : vendre et acheter
  private phoneOpen = false;
  /** Téléphone ouvert : le personnage le sort et reste dessus tant que l'écran est ouvert. */
  private phoneGesture(open: boolean) {
    this.phoneOpen = open;
    if (!this.char || !this.running) return;
    this.lastPlayerAction = Date.now();
    this.autoToken++;
    if (open) { if (this.sleeping) this.wakeUp(); if (!this.char.busy) { this.char.play('phone'); this.tenirTel(); } }
    else { if (this.char.currentName === 'phone') this.char.play('idle'); this.lacherTel(); }
  }
  private flyCoins(n: number) {
    if (!this.assets.has('prop_coin')) return;
    for (let i = 0; i < n; i++) {
      const o = this.assets.get('prop_coin'); o.scale.setScalar(.8);
      const start = this.char.obj.position.clone().add(new THREE.Vector3((Math.random() - .5) * .4, 1.2, (Math.random() - .5) * .4));
      const end = start.clone().add(new THREE.Vector3((Math.random() - .5) * 1.2, 1.6 + Math.random(), .2));
      o.position.copy(start); this.world.scene.add(o);
      const t0 = performance.now() + i * 60, dur = 800;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        if (k < 0) { requestAnimationFrame(step); return; }
        o.position.lerpVectors(start, end, k); o.rotation.y += .25; o.rotation.x = k * 3;
        if (k < 1) requestAnimationFrame(step); else { this.world.scene.remove(o); }
      };
      requestAnimationFrame(step);
    }
  }
  private buySeed(id: string) {
    const j = this.state.eco.jardin, tt = t();
    const n = Object.keys(j.poche).length;
    const prix = E.REGLES.BOUTIQUE[n - 3] ?? E.REGLES.BOUTIQUE[E.REGLES.BOUTIQUE.length - 1];
    if (j.poche[id]) { this.ui.toast(tt.dejaATOI, 3000); return; }
    if (j.interdites.includes(id)) { const g = ECO.graine(id); this.ui.toast((lang() === 'en' ? g.interdit_en : g.interdit_fr) || tt.interdite, 4000); return; }
    if (n >= E.REGLES.POCHE_MAX) { this.ui.toast(tt.varietesMax, 3500); return; }
    if (j.points < prix) { this.ui.toast(tt.manquePoints(prix, j.points), 4500); return; }
    const ok = E.acheterGraine(j, id);
    this.ui.toast(ok ? tt.varieteAchetee(tx(plantDef(id).name)) : tt.notEnough, 3500);
    this.ui.refresh(); this.persist();
  }
  private buyPot() {
    const s = this.state, j = s.eco.jardin, tt = t();
    const prix = prixProchainPot(s); if (prix === null) { this.ui.toast(tt.potsComplets); return; }
    if (j.points < prix) { this.ui.toast(tt.manquePoints(prix, j.points), 4500); return; }
    j.points -= prix; s.eco.potsAchetes++;
    const used = new Set(s.pots.map(p => p.id));
    const free = SLOTS.filter(sl => !sl.roof && !used.has(sl.id))[0];
    const p: PotState = { id: free.id, style: 'terracotta', plant: null };
    s.pots.push(p); this.makeSlotView(p);
    this.ui.refresh(); this.ui.toast(tt.potAchete);
    if (!this.char.busy) { this.char.play('dance'); setTimeout(() => { if (this.char.currentName === 'dance') this.char.play('idle'); }, 3000); }
    this.persist();
  }
  private troc(donne: E.Ingredient, cherche: E.Ingredient) {
    const e = this.state.eco, tt = t();
    const r = E.creerAnnonce(e.immeuble, e.jardin, donne, cherche, this.ecoNow());
    this.ui.toast(typeof r === 'string' ? tt.trocRefus[r] ?? r : tt.trocPublie, 3500);
    this.ui.refresh(); this.persist();
  }
  private accepter(id: string) {
    const e = this.state.eco, tt = t();
    const a = e.immeuble.annonces.find(x => x.id === id); if (!a) return;
    const refus = E.refusAccepter(a, e.jardin, this.ecoNow());
    if (refus) { const r = tt.refus[refus]; this.ui.toast(typeof r === 'function' ? r(a.cherche.quantite, a.cherche.graine === E.POINTS ? tt.points : tx(plantDef(a.cherche.graine).name).toLowerCase()) : r, 4000); return; }
    if (E.accepterAnnonce(e.immeuble, a, e.jardin, this.ecoNow())) {
      const nom = (g: string) => tx(plantDef(g).name).toLowerCase(), ic = (g: string) => icon(g);
      const avec = e.immeuble.jardins.find(x => x.id === a.de)?.nom ?? '?';
      const msg = tt.trocFait(`${a.cherche.quantite} ${ic(a.cherche.graine)} ${nom(a.cherche.graine)}`, `${a.donne.quantite} ${ic(a.donne.graine)} ${nom(a.donne.graine)}`, avec);
      this.ui.toast(msg, 4500, true);
      e.immeuble.evenements.push({ a: this.ecoNow(), pour: e.jardin.id, type: 'troc_accepte', de: avec, deId: a.de, repondu: true,
        texte_fr: t().trocFait(`${a.cherche.quantite} ${nom(a.cherche.graine)}`, `${a.donne.quantite} ${nom(a.donne.graine)}`, avec), texte_en: t().trocFait(`${a.cherche.quantite} ${nom(a.cherche.graine)}`, `${a.donne.quantite} ${nom(a.donne.graine)}`, avec) });
      this.flyCoins(4); if ((e.jardin.etape ?? 0) === 5 && E.manque(e.jardin, ECO).every(m => E.cultivables(e.jardin).has(m.graine))) this.etape(6); }
    this.ui.refresh(); this.persist();
  }
  private retirer(id: string) {
    const e = this.state.eco, tt = t();
    const a = e.immeuble.annonces.find(x => x.id === id); if (!a) return;
    if (E.retirerAnnonce(e.immeuble, a, e.jardin)) this.ui.toast(tt.annonceRetiree, 3500);
    this.ui.refresh(); this.persist();
  }
  /** Cuisiner : elle rentre, cuisine dos à nous par la porte-fenêtre, ressort avec l'assiette. */
  private async cuisiner() {
    const e = this.state.eco, tt = t();
    if (this.char.busy || e.platEnCours) return;
    if (!E.peutCuisiner(e.jardin, ECO)) { this.ui.toast(tt.cuisinerPasEncore); return; }
    this.ui.togglePhone(false);
    this.autoToken++; const token = this.autoToken;
    this.char.busy = true;
    await this.goInside(token);
    const W = this.world;
    if (W.kitchenSpot) {                                             // à la cuisinière de ta maison (sur la terrasse pour Jimy)
      const f = Math.atan2(W.kitchenLook.x - W.kitchenSpot.x, W.kitchenLook.z - W.kitchenSpot.z);
      if (!W.hasRoom) await this.char.goTo(new THREE.Vector3(this.char.obj.position.x, FL, LAYOUT.corridorZ));
      await this.char.goTo(W.kitchenSpot.clone(), f);
    } else this.char.obj.rotation.y = Math.PI;                       // sinon dos à nous
    const c = charDef(this.state.character);
    const re = ECO.recette(e.jardin.recette!.recette);
    this.ui.toast(c.universe === 'woman' ? tt.enCuisine : tt.ilCuisine, 3000);
    const fwd = new THREE.Vector3(Math.sin(this.char.obj.rotation.y), 0, Math.cos(this.char.obj.rotation.y));
    // la poêle : sur la cuisinière devant lui, ou dans sa main s'il n'y a pas de cuisine
    let poele: THREE.Object3D | null = null;
    const pan = this.char.obj.position.clone().addScaledVector(fwd, .55);
    const cols = re.ingredients.map(i => ECO.graine(i.graine).couleur ?? '#7fae4a');
    if (W.kitchenSpot) { poele = this.fabriquerPoele(cols); this.poeleEnCours = poele; pan.y = W.kitchenTop + .005; poele.position.copy(pan); poele.rotation.y = this.char.obj.rotation.y + Math.PI / 2; W.scene.add(poele); }
    else { poele = this.devantSoi(this.fabriquerPoele(cols), 0, .98, .34, 0, Math.PI / 2); pan.copy(this.char.obj.position).add(fwdV(this.char.obj, .34)).setY(this.char.obj.position.y + .98); }
    pan.y += .06;
    const DUREE = 7000;
    W.steam(pan, DUREE - 1800);                                        // la vapeur s'éteint en même temps que le geste
    // les gestes, vus de dos : la main droite remue en rond au-dessus de la poêle, la gauche tient le manche ;
    // au moment de l'amour, la main droite monte et saupoudre
    this.char.play('idle', .3);
    const ch = this.char.obj, t0 = performance.now();
    const devant = (d: number, h: number, cote = 0) => {
      const f = new THREE.Vector3(Math.sin(ch.rotation.y), 0, Math.cos(ch.rotation.y)), rgt = new THREE.Vector3(-f.z, 0, f.x);
      return ch.position.clone().addScaledVector(f, d).addScaledVector(rgt, cote).setY(h);
    };
    const hPoele = Math.max(pan.y - .02, ch.position.y + .92);
    let saupoudre = false;
    this.char.mains = {
      droite: () => {
        const t = (performance.now() - t0) / 1000;
        if (saupoudre) return devant(.34, hPoele + .26 + Math.sin(t * 22) * .015, .08 + Math.sin(t * 11) * .03);
        return devant(.38 + Math.cos(t * 5) * .07, hPoele + .06, .10 + Math.sin(t * 5) * .08);
      },
      gauche: W.kitchenSpot ? () => devant(.36, hPoele + .02, -.22) : undefined,
    };
    this.char.ikBut = 1;
    W.coeurs(() => pan.clone().add(new THREE.Vector3(0, .12, 0)), 3000, 420);   // quelques cœurs montent avec la vapeur
    await wait(3200);
    const amour = lang() === 'en' ? re.amour_en : re.amour_fr;              // l'ingrédient le plus important
    if (amour) {
      saupoudre = true; this.ui.toast(amour.charAt(0).toUpperCase() + amour.slice(1), 2600);
      const main = this.char.bone('RightHand');
      W.coeurs(() => { const v = new THREE.Vector3(); if (main) main.getWorldPosition(v); else v.copy(pan).add(new THREE.Vector3(0, .25, 0)); return v; }, 2400);
      await wait(1600); saupoudre = false;
    }
    await wait(DUREE - 3200 - (amour ? 1600 : 0));
    this.char.ikBut = 0; await wait(450);
    this.char.play('idle', .3); await wait(300);
    if (poele) poele.parent?.remove(poele); this.poeleEnCours = null;
    const plat = E.cuisiner(e.immeuble, e.jardin, ECO, this.ecoNow());
    if (plat) {
      e.platEnCours = plat;
      // l'assiette garnie est posée là où il a cuisiné (jamais portée : elle ne vole plus en l'air)
      const a = this.fabriquerAssiette(this.couleursRecette());
      const ou = W.kitchenSpot ? pan.clone().setY(W.kitchenTop + .005) : this.char.obj.position.clone().add(fwd.clone().multiplyScalar(.5)).setY(FL + .02);
      a.position.copy(ou); W.scene.add(a); this.assiettePosee = a;
      this.ui.refresh(); this.persist();
      this.montrerPlat();                                              // le plat est prêt : on le montre tout de suite
      await this.danser(token);                                        // et c'est la fête, au milieu du salon, jusqu'au bout
    }
    this.char.busy = false;
    this.persist();
    this.scheduleAutonomy();
  }
  /** Des gestes fabriqués par le jeu : les mains sont guidées vers des points autour du corps (comme en cuisine),
   *  par-dessus la pose debout. Chaque geste est court, lisible de loin, et ne demande aucune animation téléchargée. */
  private async gesteBras(quoi: 'saluer' | 'etirer' | 'hanches' | 'dos' | 'tete' | 'applaudir' | 'bailler' | 'rambarde' | 'cafe' | 'pointer', ms: number, cible?: () => THREE.Vector3) {
    const ch = this.char.obj, t0 = performance.now();
    const pt = (av: number, haut: number, cote: number) => {
      const f = new THREE.Vector3(Math.sin(ch.rotation.y), 0, Math.cos(ch.rotation.y)), d = new THREE.Vector3(-f.z, 0, f.x);
      return ch.position.clone().addScaledVector(f, av).addScaledVector(d, cote).setY(ch.position.y + haut);
    };
    const t = () => (performance.now() - t0) / 1000, k = () => Math.sin(Math.min(1, (performance.now() - t0) / ms) * Math.PI);
    const CLIP: Record<string, string> = { saluer: 'saluer', etirer: 'etirer', hanches: 'mains_hanches', dos: 'idle_3', tete: 'reflechir', applaudir: 'applaudir', bailler: 'bailler', cafe: 'cafe', pointer: 'pointer' };   // (rambarde : l'animation Mixamo est « dos au mur », on garde les mains sur la vraie rambarde)
    if (this.char.deLaBibliotheque && this.char.has(CLIP[quoi])) {    // que du propre : la vraie animation
      const n = CLIP[quoi], d = this.char.clipDuree(n);
      if (cible) this.char.regard = cible();
      let tasse: THREE.Object3D | null = null, vivant = true;
      if (quoi === 'cafe') {                                             // la tasse : dans la main gauche, droite, l'anse vers le corps
        tasse = await BIBLIO.accessoire('tasse'); if (tasse) { this.world.scene.add(tasse); const suivre = () => { if (!vivant || !tasse) return; const g = this.paume('Left'); if (g) { tasse.position.copy(g); tasse.rotation.set(0, this.char.obj.rotation.y + Math.PI, 0); } requestAnimationFrame(suivre); }; suivre(); }
      }
      await this.char.once(n, Math.max(d, ms / 1000));
      vivant = false; if (tasse) this.world.scene.remove(tasse);
      this.char.play('idle', .3); this.char.regard = null; return;
    }
    if (this.char.currentName !== 'idle') this.char.play('idle', .3);
    let tasse: THREE.Object3D | null = null;
    switch (quoi) {
      case 'saluer': this.char.mains = { droite: () => pt(.32, 1.48, .36 + Math.sin(t() * 9) * .1) }; break;                        // « coucou » : à hauteur d'épaule, devant (plus haut, le coude se retournait)
      case 'etirer': this.char.mains = { droite: () => pt(.05, 1.35 + .6 * k(), .16), gauche: () => pt(.05, 1.35 + .6 * k(), -.16) }; break;
      case 'bailler': this.char.mains = { droite: () => pt(.12, 1.52 + .1 * k(), .05), gauche: () => pt(.05, 1.3 + .55 * k(), -.2) }; this.char.regard = pt(2, 3.5, 0); break;   // une main devant la bouche
      case 'hanches': this.char.mains = { droite: () => pt(-.02, .98, .2), gauche: () => pt(-.02, .98, -.2) }; break;                // les poings sur les hanches
      case 'dos': this.char.mains = { droite: () => pt(-.2, .95, .06), gauche: () => pt(-.2, .95, -.06) }; break;                     // les mains dans le dos
      case 'tete': this.char.mains = { droite: () => pt(.02, 1.66 + Math.sin(t() * 7) * .02, .1 + Math.sin(t() * 7) * .03) }; break;  // se gratter la tête
      case 'applaudir': this.char.mains = { droite: () => pt(.3, 1.3, .04 + Math.abs(Math.sin(t() * 6)) * .12), gauche: () => pt(.3, 1.3, -.04 - Math.abs(Math.sin(t() * 6)) * .12) }; break;
      case 'rambarde': {                                                 // accoudé à la vraie rambarde (mesurée), sinon à 52 cm devant
        const r = this.rambardeDevant(ch.position.x, ch.position.z, ch.rotation.y);
        const av = r ? Math.max(.25, r.dist - .03) : .52, h = r ? r.haut - ch.position.y + .02 : 1.02;
        this.char.mains = { droite: () => pt(av, h, .25), gauche: () => pt(av, h, -.25) }; break;
      }
      case 'pointer': this.char.mains = { droite: () => { const c = cible?.(); if (!c) return pt(.5, 1.5, .2); const e = pt(0, 1.45, .18); return e.add(c.clone().sub(e).normalize().multiplyScalar(.7)); } }; break;
      case 'cafe': {                                                    // une tasse : il la porte à la bouche de temps en temps
        tasse = new THREE.Group();
        const m = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: .4 });
        const bol = new THREE.Mesh(new THREE.CylinderGeometry(.04, .034, .09, 18, 1, true), m); tasse.add(bol);
        const fond = new THREE.Mesh(new THREE.CircleGeometry(.034, 18), m); fond.rotation.x = -Math.PI / 2; fond.position.y = -.045; tasse.add(fond);
        const cafe = new THREE.Mesh(new THREE.CircleGeometry(.036, 18), new THREE.MeshStandardMaterial({ color: 0x4a2c1a })); cafe.rotation.x = -Math.PI / 2; cafe.position.y = .03; tasse.add(cafe);
        const anse = new THREE.Mesh(new THREE.TorusGeometry(.022, .006, 6, 14), m); anse.position.x = .045; tasse.add(anse);
        this.world.scene.add(tasse);
        const boire = () => { const c = t() % 5; return c > 3.2 && c < 4.4; };
        this.char.mains = { droite: () => { const p = boire() ? pt(.1, 1.55, .04) : pt(.22, 1.12, .16); if (tasse) { const pm = this.paume('Right'); if (pm) tasse.position.copy(pm).add(new THREE.Vector3(0, .02, 0)); } return p; } };
        break;
      }
    }
    this.char.ikBut = 1;
    await wait(ms);
    this.char.ikBut = 0; await wait(400);
    if (tasse) this.world.scene.remove(tasse);
    if (quoi === 'bailler') this.char.regard = null;
  }
  /** Un dessin passe dans le ciel : s'il est libre, le personnage le suit des yeux et le montre du doigt. */
  private montrerLeCiel(sp: THREE.Sprite) {
    if (!this.running || this.char.busy || this.sleeping || this.phoneOpen) return;
    // nous fait-il face ? (son regard est tourné vers la caméra, à 60° près)
    const cam = this.world.camera.position, me = this.char.obj.position;
    const versCam = Math.atan2(cam.x - me.x, cam.z - me.z);
    const ecart = Math.abs(((versCam - this.char.obj.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (ecart < 1.05 && this.char.has('regard_epaule')) {
      this.char.busy = true;
      setTimeout(() => {
        const d = this.char.clipDuree('regard_epaule');
        this.char.once('regard_epaule', d).then(() => { this.char.play('idle', .4); this.char.busy = false; });
      }, 1800);
      return;
    }
    this.char.busy = true;
    const suivre = setInterval(() => { this.char.regard = sp.position.clone(); }, 100);
    setTimeout(() => this.gesteBras('pointer', 3200, () => sp.position.clone()).then(() => { clearInterval(suivre); this.char.regard = null; this.char.busy = false; }), 2500);
  }
  /** Une séance de gym : sur la piste (au milieu du salon, ou sur le toit), tous les exercices disponibles à la suite,
   *  chacun répété, puis un étirement. Rien ne l'interrompt tant qu'elle n'est pas finie. */
  private async seanceSport(token: number) {
    const ordre = ['sport_jacks', 'sport_squat', 'sport_pompes', 'sport_abdos', 'sport_gainage', 'sport_burpee'];
    const exos = [...ordre.filter(n => this.char.has(n)), ...this.char.variantes('sport').filter(n => !ordre.includes(n))];
    if (!exos.length) return;
    const W = this.world, sp = W.danseSpot;
    if (sp) {
      if (W.hasRoom && sp.z < FACADE_FRONT - .1) { await this.goInside(token); await this.char.goTo(sp.clone().setY(FL), 0); }
      else await this.walk(freePoint(sp.clone().setY(FL)), 0);
    }
    this.dansant = true; this.char.busy = true;                        // la séance ne se coupe pas
    for (const n of exos) {
      const d = this.char.clipDuree(n); if (!d) continue;
      const fois = n === 'sport_gainage' ? 1 : d < 3 ? 3 : d < 6 ? 2 : 1;   // les exercices courts sont répétés (pas le gainage : il sautait en recommençant)
      for (let i = 0; i < fois; i++) { await this.char.once(n, d); }
      this.char.play('idle', .4); await wait(700);                     // une petite pause entre deux exercices
    }
    await this.gesteBras('etirer', 2600);                              // et on s'étire pour finir
    this.dansant = false; this.char.busy = false;
  }
  /** Danser : au milieu du salon (là où il y a de la place), la danse entière, sans être interrompu. */
  private dansant = false;
  private async danser(token: number) {
    const W = this.world;
    const sp = W.danseSpot;
    if (sp && (W.hasRoom ? true : true)) {
      if (W.hasRoom && sp.z < FACADE_FRONT - .1) { await this.goInside(token); await this.char.goTo(sp.clone().setY(FL), 0); }
      else await this.walk(freePoint(sp.clone().setY(FL)), 0);
    }
    this.dansant = true; this.char.busy = true;
    const danses = this.char.variantes('dance'), laquelle = danses[Math.floor(Math.random() * danses.length)] ?? 'dance';
    const clip = this.char.clipDuree(laquelle);
    this.char.play(laquelle, .3);
    await wait(Math.max(3000, Math.min(12000, clip * 1000)));         // la danse entière (entre 3 et 12 s)
    this.char.play('idle', .4); await wait(400);
    this.dansant = false; this.char.busy = false;
  }
  /** Semer une graine de la recette dans le premier pot libre (depuis le téléphone). */
  private semerDansPotLibre(g: string) {
    const libre = this.state.pots.find(p => !p.plant && SLOTS[p.id] && !SLOTS[p.id].roof);
    if (!libre) { this.ui.toast(t().potsPleins, 4000); return; }
    this.ui.togglePhone(false);
    this.sow(libre.id, g);
  }
  /** Répondre à un voisin avec une phrase préécrite ; il répondra un peu plus tard. */
  private repondre(id: string, texte: { fr: string; en: string }) {
    const e = this.state.eco;
    const ev = e.immeuble.evenements.find(x => `${x.a}_${x.type}_${x.deId ?? ''}` === id);
    const v = ev ? e.immeuble.jardins.find(x => x.id === ev.deId) : undefined;
    if (!ev || !v || ev.repondu) return;
    E.envoyerMessage(e.immeuble, e.jardin, v, texte, this.ecoNow());
    ev.repondu = true;
    this.ui.toast(t().envoye(v.nom), 2500);
    this.persist(); this.ui.ouvrir('notifs', id);
  }
  /** Le plat prêt s'affiche à l'écran : son nom, son image, et à qui l'offrir. */
  private montrerPlat() {
    const e = this.state.eco; if (!e.platEnCours) return;
    clearTimeout(this.poseTimer);
    this.poseTimer = window.setTimeout(() => { if (this.state.eco.platEnCours && this.porte) { this.poserAssiette(); this.scheduleAutonomy(); } }, 20000);   // elle n'attend pas indéfiniment
    const voisins = e.immeuble.jardins.filter(x => x.id !== e.jardin.id).map(v => ({ id: v.id, nom: v.nom, icons: Object.keys(v.poche).slice(0, 4).map(g => icon(g)).join('') }));
    this.ui.platPret(e.platEnCours.recette, voisins, id => this.offrir(id), () => { this.poserAssiette(); this.scheduleAutonomy(); });
  }
  /** Offrir le plat à un voisin : l'assiette s'envole vers lui, les points arrivent, et parfois une graine rare. */
  private async offrir(jardinId: string) {
    const e = this.state.eco, tt = t();
    const plat = e.platEnCours; if (!plat) return;
    const a = e.immeuble.jardins.find(x => x.id === jardinId); if (!a) return;
    this.ui.togglePhone(false);
    e.platEnCours = null;
    const re = ECO.recette(plat.recette);
    const res = E.offrir(e.immeuble, plat, e.jardin, a, ECO, this.ecoNow(), this.ecoRng);
    e.carnet.push(plat);
    const posee = this.assiettePosee; this.assiettePosee = null; clearTimeout(this.poseTimer);
    setTimeout(() => { if (!this.char.busy && this.running) { this.char.busy = true; this.gesteBras('applaudir', 1600).then(() => { this.char.busy = false; }); } }, 900);   // content !
    const assiette = this.porte ?? posee ?? this.fabriquerAssiette(this.couleursRecette());
    const depart = this.lacher() ?? (posee ? posee.position.clone() : this.char.obj.position.clone().add(new THREE.Vector3(0, 1.0, .3)));
    if (posee) posee.parent?.remove(posee);
    this.world.flyAway(depart, assiette);                                // c'est la vraie assiette, garnie, qui s'envole
    this.ui.toast(tt.platOffert(lang() === 'en' ? re.nom_en : re.nom_fr, a.nom, plat.valeur), 3000);
    const ecran = this.world.toScreen(depart);
    const avant = e.jardin.points - plat.valeur;
    setTimeout(() => this.ui.piecesVolent(ecran.x, ecran.y, avant, e.jardin.points, () => {
      const n = Object.keys(e.jardin.poche).length;
      const prix = E.REGLES.BOUTIQUE[n - 3] ?? E.REGLES.BOUTIQUE[E.REGLES.BOUTIQUE.length - 1];
      if (n >= E.REGLES.POCHE_MAX) return;
      if (e.jardin.points >= prix) this.ui.notifier(`${tt.gainPieces(plat.valeur)}. ${tt.peutAcheter}`, 'boutique');
      else this.ui.notifier(`${tt.gainPieces(plat.valeur)}. ${tt.encorePieces(prix - e.jardin.points)}`, 'boutique');
    }), 700);
    if (!this.char.busy) { this.char.play('dance'); setTimeout(() => { if (this.char.currentName === 'dance') this.char.play('idle'); }, 4000); }
    setTimeout(() => this.ecoEvenements(), 800);
    void res;
    this.ui.refresh(); this.persist();
    if ((e.jardin.etape ?? 0) < 5) setTimeout(() => this.etape(5), 4500);
    else if ((e.jardin.etape ?? 0) === 6) setTimeout(() => { E.recetteDeDemain(e.jardin, e.immeuble, ECO, this.ecoNow()); this.etape(7); }, 4500);
  }

  // ---------- vie autonome
  private scheduleAutonomy() {
    const { autonomyMin, autonomyMax } = CATALOG.timing;
    clearTimeout(this.autoTimer);
    this.autoTimer = window.setTimeout(() => this.autonomy(), (autonomyMin + Math.random() * (autonomyMax - autonomyMin)) * 1000);
  }
  private async autonomy() {
    if (!this.running) return;
    const idleFor = (Date.now() - this.lastPlayerAction) / 1000;
    let token = this.autoToken;
    try {
      if (this.char.busy || idleFor < 4 || this.phoneOpen || this.porte || this.dansant) return;   // occupé : on ne touche à rien
      token = ++this.autoToken;                                       // on ne prend la main que si on démarre vraiment
      const night = this.world.targetNight > .5;
      const thirsty = this.state.pots.filter(p => p.plant && !P.isWet(p.plant) && !P.isReady(p.plant) && SLOTS[p.id].roof === this.onRoof);
      if (thirsty.length && idleFor > 45 && (this.state.eco.jardin.etape ?? 0) >= 2) {   // au tout début, c'est au joueur d'arroser
        const p = thirsty[Math.floor(Math.random() * thirsty.length)];
        { const st = this.standFor(SLOTS[p.id], 'water'); await this.walk(st.pos, st.face, `pot${p.id}`); } if (token !== this.autoToken) return;
        this.char.busy = true;
        this.tenirArrosoir(SLOTS[p.id].pos.clone().add(new THREE.Vector3(0, .25, 0)));
        this.char.regard = SLOTS[p.id].pos.clone().add(new THREE.Vector3(0, .3, 0)); const g = this.char.geste('water'); const done = g.fin; this.verser(g.effet); await wait(g.effet * 1000);
        if (p.plant) { P.water(p.plant); this.refreshSlot(p); this.state.log.wateredByChar++; }
        await done; this.char.regard = null; this.char.busy = false; this.release(); this.lacherArrosoir();
      } else if (night && !this.onRoof) {
        await this.goToBed(token);
      } else {
        await this.unMoment(token);
      }
    } finally {
      if (token === this.autoToken) this.scheduleAutonomy(); else this.scheduleAutonomy();
    }
  }
  /** Un moment de vie, choisi selon l'heure (comme les emplois du temps des villageois de Stardew Valley) :
   *  le matin la vue et les plantes, l'après-midi le canapé et la sieste, le soir la rambarde au coucher du soleil et la danse.
   *  Jamais deux fois de suite la même chose ; le regard suit toujours ce qu'il fait. */
  private dernierMoment = '';
  private async unMoment(token: number) {
    const W = this.world, h = this.gameHour();
    const matin = h >= 6 && h < 11, midi = h >= 11 && h < 14, aprem = h >= 14 && h < 18, soir = h >= 18 && h < 23;
    const peutAssoir = !this.char.sitCfg || this.char.sitCfg.chaise_ok !== false || this.world.chairFitted;
    const pots = this.state.pots.filter(p => p.plant && SLOTS[p.id].roof === this.onRoof);
    const choix: [string, number][] = ([
      ['vue', (matin ? 3 : soir ? 2 : 1)],
      ['rambarde', (soir ? 3 : 1.5)],
      ['chaise', peutAssoir && !this.onRoof ? (midi ? 2 : 1.2) : 0],
      ['papillons', W.critters.length ? (matin || aprem ? 2 : 1) : 0],
      ['plantes', pots.length ? (matin ? 3 : aprem ? 2 : 1) : 0],
      ['siege', W.sieges.length && !this.onRoof ? (aprem || midi ? 3.5 : soir ? 2 : 1.2) : 0],
      ['tableau', W.tableauSpot && !this.onRoof ? (midi || aprem ? 1.5 : .6) : 0],
      ['telephone', this.char.has('phone') && !this.onRoof ? (soir ? 1.5 : 1) : 0],
      ['danse', soir ? 3 : 1.2],
      ['sieste', W.hasRoom && !this.onRoof && h >= 13 && h < 17 ? 1.2 : 0],
      ['etirer', matin ? 2 : .4],
      ['saluer', soir || aprem ? 1.2 : .6],
      ['regarder', 1],
      ['bailler', soir || h >= 22 || h < 6 ? 1.2 : .2],
      ['sport', this.char.variantes('sport').length || this.char.has('sport_squat') || this.char.has('sport_gainage')
        ? ((h >= 7 && h < 9) || (h >= 12 && h < 14) || (h >= 18 && h < 20) ? 6 : .4) : 0],      // trois séances : 7-9 h, 12-14 h, 18-20 h
    ] as [string, number][]).filter(([k, w]) => w > 0 && k !== this.dernierMoment);
    let r = Math.random() * choix.reduce((t, c) => t + c[1], 0), quoi = choix[0]?.[0] ?? 'vue';
    for (const [k, w] of choix) { if ((r -= w) <= 0) { quoi = k; break; } }
    this.dernierMoment = quoi;
    const vivre = async (ms: number, regards?: () => THREE.Vector3 | null) => {        // attendre en regardant autour de soi
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (regards) this.char.regard = regards(); await wait(120); if (token !== this.autoToken) break; }
      this.char.regard = null;
    };
    const loin = (dx: number, dy: number) => this.char.obj.position.clone().add(new THREE.Vector3(dx, 1.6 + dy, 25));
    if (quoi === 'vue') {                                          // à la fenêtre (ou au bord du toit) : il regarde Paris, de gauche à droite
      let face = 0;
      if (W.hasRoom && !this.onRoof) {
        await this.goInside(token); if (token !== this.autoToken) return;
        const f = W.fenetres.length ? W.fenetres[Math.floor(Math.random() * W.fenetres.length)] : null;   // une vraie fenêtre de la maison
        if (f) {                                                    // un endroit au hasard devant la fenêtre, sur toute sa largeur
          face = f.dehors;
          const decal = (Math.random() - .5) * Math.max(0, f.largeur - .6);
          await this.char.goTo(f.pos.clone().addScaledVector(f.axe, decal).setY(FL), face);
        } else await this.char.goTo(W.doorSpot.clone().add(new THREE.Vector3(0, 0, -.35)), 0);
      } else {                                                      // sur le toit (Jimy) : il regarde partout, devant ou sur les côtés
        const cote = Math.floor(Math.random() * 3);                 // 0 devant, 1 à gauche, 2 à droite
        face = cote === 0 ? 0 : cote === 1 ? -Math.PI / 2 : Math.PI / 2;
        const p = cote === 0 ? new THREE.Vector3((Math.random() - .5) * 1.6, FL, SLOTS[3].pos.z - .05)
          : new THREE.Vector3((cote === 1 ? -1 : 1) * (LAYOUT.halfW - .35), FL, LAYOUT.corridorZ);
        await this.walk(freePoint(p), face);
      }
      if (token !== this.autoToken) return;
      const t0 = performance.now(), me = this.char.obj.position.clone();
      const geste = Math.random() < .6 ? this.gesteBras('dos', 9000) : null;                                // les mains dans le dos (le café est retiré : la tasse flottait)
      await vivre(9000, () => {                                     // il balaie la vue par la fenêtre, de gauche à droite, au loin
        const t = (performance.now() - t0) / 1000, a = face + Math.sin(t * .45) * .6;
        return me.clone().add(new THREE.Vector3(Math.sin(a) * 25, 1.6 + Math.sin(t * .8) * 1.5, Math.cos(a) * 25));
      });
      if (geste) await geste;
      if (W.hasRoom && !this.onRoof) await this.goOutside(token);
    } else if (quoi === 'rambarde') {                              // accoudé à la rambarde, il suit les passants en bas
      await this.walk(new THREE.Vector3((Math.random() - .5) * 2.4, FL, SLOTS[3].pos.z + .02), 0); if (token !== this.autoToken) return;
      const t0 = performance.now();
      const geste = this.gesteBras('rambarde', 7500);                 // accoudé, les mains sur la rambarde
      await vivre(7000 + Math.random() * 1000, () => { const t = (performance.now() - t0) / 1000; return loin(Math.sin(t * .3) * 8 - 4, -6 + Math.sin(t) * .5); });
      await geste;
    } else if (quoi === 'chaise') {
      await this.goSit(token, 'sit');
    } else if (quoi === 'papillons') {                             // il suit un papillon des yeux, et se tourne s'il passe derrière lui
      const c = W.critters[Math.floor(Math.random() * W.critters.length)];
      await vivre(6500, () => {
        const p = c.s.position.clone(), me = this.char.obj.position;
        const f = Math.atan2(p.x - me.x, p.z - me.z), d = ((f - this.char.obj.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        if (Math.abs(d) > 1.1) this.char.tourner(f);
        return p;
      });
    } else if (quoi === 'plantes') {                               // il va voir une plante et la regarde (plus longtemps si elle est presque prête)
      const p = pots[Math.floor(Math.random() * pots.length)];
      const st = this.standFor(SLOTS[p.id], 'water');
      await this.walk(st.pos, st.face); if (token !== this.autoToken) return;
      const haut = SLOTS[p.id].pos.clone().add(new THREE.Vector3(0, .35, 0));
      const pret = !!p.plant && P.isReady(p.plant);
      const geste = pret ? this.gesteBras('applaudir', 1800) : this.gesteBras(Math.random() < .5 ? 'hanches' : 'tete', 3200);   // contente si c'est prêt, pensive sinon
      await vivre(pret ? 4500 : 3400, () => haut.clone().add(new THREE.Vector3(Math.sin(Date.now() / 700) * .06, 0, 0)));
      await geste;
    } else if (quoi === 'siege') {
      await this.goSiege(token);
    } else if (quoi === 'tableau') {
      await this.goTableau(token);
    } else if (quoi === 'telephone') {                             // debout face à la rue, le nez sur son téléphone
      const spot = freePoint(new THREE.Vector3(-Math.sign(CHAIR_SPOT.pos.x || 1) * LAYOUT.halfW * .45, FL, LAYOUT.corridorZ + .12));
      await this.walk(spot, 0); if (token !== this.autoToken) return;
      this.tenirTel(); this.char.play('phone', .4);
      await vivre(8000);
      this.lacherTel(); this.char.play('idle', .4);
    } else if (quoi === 'danse') {                                 // un pas de danse, au milieu du salon, en entier
      await this.danser(token);
      if (this.inside && this.world.hasRoom) await this.goOutside(token);
    } else if (quoi === 'sieste') {
      await this.goSieste(token);
    } else if (quoi === 'etirer') {                               // s'étirer : les deux bras montent au-dessus de la tête, puis redescendent
      this.char.busy = true;
      if (this.char.has('stretch')) await this.char.once('stretch', Math.max(3, this.char.clipDuree('stretch')));
      else await this.gesteBras('etirer', 3200);
      this.char.busy = false; this.char.play('idle', .4);
    } else if (quoi === 'sport') {                                 // la séance de gym, en entier
      await this.seanceSport(token);
      if (this.inside && this.world.hasRoom) await this.goOutside(token);
    } else if (quoi === 'bailler') {                               // un bâillement, la main devant la bouche
      this.char.busy = true; await this.gesteBras('bailler', 2600); this.char.busy = false;
    } else if (quoi === 'regarder') {                              // regarder autour de soi, en tournant la tête puis le corps
      const t0 = performance.now(), me = this.char.obj.position.clone(), f0 = this.char.obj.rotation.y;
      await vivre(5000, () => { const t = (performance.now() - t0) / 1000, a = f0 + Math.sin(t * .9) * 1.1; if (Math.abs(Math.sin(t * .9)) > .9) this.char.tourner(f0 + Math.sign(Math.sin(t * .9)) * .5); return me.clone().add(new THREE.Vector3(Math.sin(a) * 6, 1.5 + Math.sin(t * 1.7) * .6, Math.cos(a) * 6)); });
      this.char.tourner(f0);
    } else if (quoi === 'saluer') {                               // à la rambarde, il salue quelqu'un dans la rue
      await this.walk(new THREE.Vector3((Math.random() - .5) * 2, FL, SLOTS[3].pos.z + .02), 0); if (token !== this.autoToken) return;
      this.char.regard = this.char.obj.position.clone().add(new THREE.Vector3((Math.random() - .5) * 6, -4, 12));
      this.char.busy = true;
      if (this.char.has('wave')) await this.char.once('wave', Math.max(2.5, this.char.clipDuree('wave')));
      else await this.gesteBras('saluer', 2600);
      this.char.busy = false; this.char.regard = null; this.char.play('idle', .4);
    }
  }
  private inside = false;
  /** Passer la porte-fenêtre : elle s'ouvre, on entre (ou on sort), elle se referme. Sans décor assemblé, on traverse en fondu. */
  private async goInside(token: number) {
    if (this.inside) return;
    if (!this.world.hasRoom) return;                              // toit-terrasse : pas de pièce, on reste dehors
    await this.walk(this.world.doorSpot, Math.PI); if (token !== this.autoToken) return;
    if (this.world.doors.length) { this.world.openDoors(true); await wait(500); }   // sans porte : on passe simplement l'ouverture
    await this.char.goTo(this.world.insideSpot, Math.PI);
    this.inside = true;
    if (this.world.doors.length) { await wait(300); this.world.openDoors(false); }
  }
  private async goOutside(token: number) {
    if (!this.inside) return;
    const W = this.world;
    await this.char.goTo(W.insideSpot, 0); if (token !== this.autoToken && !this.sleeping) return;
    if (W.doors.length) { W.openDoors(true); await wait(500); }
    await this.char.goTo(W.doorSpot, 0);
    this.inside = false;
    if (W.doors.length) { await wait(300); W.openDoors(false); }
  }
  /** La nuit : elle rentre, va jusqu'au lit et s'allonge. Se relève au matin ou dès qu'on la sollicite. */
  private async goToBed(token: number) {
    if (this.sleeping) return;
    if (this.porte) this.poserAssiette();                               // on ne se couche jamais une assiette à la main
    await this.goInside(token); if (token !== this.autoToken) return;
    await this.char.goTo(this.world.bedSide, Math.PI / 2); if (token !== this.autoToken) return;
    const bed = this.world.bedSpot;
    const dos = this.char.sleepCfg?.dos_z ?? 0;                          // hauteur du dos mesurée : il repose sur le matelas
    this.char.teleport(new THREE.Vector3(bed.x, bed.y - dos, bed.z), Math.PI);
    this.char.play('sleep', .4);
    this.sleeping = true;
    while (this.sleeping && token === this.autoToken && this.nightFor(this.gameHour()) > .3) await wait(500);
    if (this.sleeping) this.wakeUp();
  }
  private wakeUp() {
    if (!this.sleeping) return;
    this.sleeping = false;
    this.char.play('idle', .3);
    this.char.teleport(this.world.bedSide.clone(), 0);
    const tk = ++this.autoToken;
    this.goOutside(tk).then(() => { if (tk === this.autoToken) this.scheduleAutonomy(); });
  }
  /** Un moment dans le fauteuil, à l'intérieur. */
  /** Aller regarder son tableau, un moment. */
  private async goTableau(token: number) {
    const sp = this.world.tableauSpot; if (!sp) return;
    await this.goInside(token); if (token !== this.autoToken) return;
    const f = Math.atan2(sp.look.x - sp.pos.x, sp.look.z - sp.pos.z);
    await this.char.goTo(sp.pos.clone().setY(FL), f); if (token !== this.autoToken) return;
    this.char.play('idle', .4);
    const centre = sp.look.clone().setY(sp.look.y > FL + .3 ? sp.look.y : FL + 1.55), t1 = performance.now();
    const t0 = Date.now(); while (Date.now() - t0 < 7000 + Math.random() * 4000) { const t = (performance.now() - t1) / 1000; this.char.regard = centre.clone().add(new THREE.Vector3(Math.sin(t * .6) * .35, Math.sin(t * .9) * .25, 0)); await wait(120); if (token !== this.autoToken) break; }
    this.char.regard = null;
    await this.goOutside(token);
  }
  /** S'asseoir sur un vrai siège de la maison (mesuré dans Blender) : on arrive devant, on se tourne, le bassin sur l'assise. */
  private async goSiege(token: number) {
    const W = this.world;
    const canapes = W.sieges.filter(q => q.genre === 'canape');
    const choix = canapes.length && Math.random() < .6 ? canapes : W.sieges;   // le canapé a la préférence
    if (!choix.length) return;
    const q = choix[Math.floor(Math.random() * choix.length)];
    const rentrer = q.dedans && W.hasRoom;
    if (rentrer) { await this.goInside(token); if (token !== this.autoToken) return; }
    const dir = new THREE.Vector3(Math.sin(q.face), 0, Math.cos(q.face));
    await this.char.goTo(q.pos.clone().addScaledVector(dir, .5).setY(FL), q.face); if (token !== this.autoToken) return;
    this.char.obj.rotation.y = q.face;
    { const ss = this.char.variantes('sit'); this.char.play(ss[Math.floor(Math.random() * ss.length)] ?? 'sit', .3); }
    const cfg = this.char.sitCfg;
    await wait(cfg ? Math.min(4000, cfg.installe_a * 1000 + 450) : 600);
    const hips = this.char.bone('Hips');
    if (hips) {
      const hp = new THREE.Vector3(); hips.getWorldPosition(hp);
      const cible = q.pos.clone().addScaledVector(dir, .06);                // le bassin un peu en avant du centre de l'assise
      this.char.obj.position.x += cible.x - hp.x; this.char.obj.position.z += cible.z - hp.z;
      if (cfg) this.char.obj.position.y = FL + q.h + .06 - cfg.cuisses_z;   // les cuisses posées sur l'assise mesurée
      this.piedsSurLeSol();
    }
    const t0 = Date.now(); while (Date.now() - t0 < 12000 + Math.random() * 8000) { await wait(400); if (token !== this.autoToken) break; }
    this.char.play('idle', .3);
    this.char.teleport(q.pos.clone().addScaledVector(dir, .5).setY(FL), q.face);
    if (rentrer) await this.goOutside(token);
  }
  /** Assis : si un pied passe sous le sol (siège plus bas que l'assise de l'animation), on remonte le personnage d'autant. */
  private piedsSurLeSol() {
    this.char.obj.updateMatrixWorld(true);
    let bas = Infinity;
    for (const n of ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot']) {
      const b = this.char.bone(n); if (!b) continue;
      const p = new THREE.Vector3(); b.getWorldPosition(p); bas = Math.min(bas, p.y);
    }
    if (isFinite(bas) && bas < FL + .02) this.char.obj.position.y += FL + .02 - bas;
  }
  /** S'installer dans le canapé : on arrive devant, on s'assoit, le bassin calé sur l'assise. */
  private async goCanape(token: number) {
    const sp = this.world.canapeSpot; if (!sp) return;
    await this.goInside(token); if (token !== this.autoToken) return;
    const dir = sp.look.clone().sub(sp.pos).setY(0).normalize();
    const face = Math.atan2(dir.x, dir.z);
    await this.char.goTo(sp.pos.clone().addScaledVector(dir, .5).setY(FL), face); if (token !== this.autoToken) return;
    this.char.obj.rotation.y = face;
    this.char.play('sit', .3);
    const cfg = this.char.sitCfg;
    await wait(cfg ? Math.min(4000, cfg.installe_a * 1000 + 450) : 500);
    const hips = this.char.bone('Hips');
    if (hips) { const hp = new THREE.Vector3(); hips.getWorldPosition(hp); const d = sp.pos.clone().addScaledVector(dir, .08).sub(hp); d.y = cfg ? (FL + .42 + .08 - cfg.cuisses_z) - this.char.obj.position.y : 0; this.char.obj.position.add(d); }
    const t0 = Date.now(); while (Date.now() - t0 < 12000 + Math.random() * 6000) { await wait(400); if (token !== this.autoToken) break; }
    this.char.play('idle', .3);
    this.char.teleport(sp.pos.clone().addScaledVector(dir, .5).setY(FL), face);
    await this.goOutside(token);
  }
  /** Une petite sieste sur le lit, en pleine journée. */
  private async goSieste(token: number) {
    await this.goInside(token); if (token !== this.autoToken) return;
    const W = this.world;
    await this.char.goTo(W.bedSide.clone(), Math.PI); if (token !== this.autoToken) return;
    const bed = W.bedSpot, dos = this.char.sleepCfg?.dos_z ?? 0;
    if (this.char.deLaBibliotheque) { const dy = ({ lea: .529, marcel: .638, jimy: .551 } as Record<string, number>)[this.state.character] ?? .55; this.char.teleport(new THREE.Vector3(bed.x, FL + dy, bed.z), 4.2245); }   // torse sur le matelas (Codex)
    else this.char.teleport(new THREE.Vector3(bed.x, bed.y - dos, bed.z), Math.PI);
    this.char.play('sleep', .4);
    const t0 = Date.now(); while (Date.now() - t0 < 16000) { await wait(400); if (token !== this.autoToken) break; }
    this.char.play('idle', .4);
    this.char.teleport(W.bedSide.clone(), Math.PI);
    await this.goOutside(token);
  }
  private async goArmchair(token: number) {
    const spot = this.world.armchairSpot; if (!spot) return;
    await this.goInside(token); if (token !== this.autoToken) return;
    const fwd = new THREE.Vector3(Math.sin(spot.face), 0, Math.cos(spot.face));
    await this.char.goTo(spot.pos.clone().add(fwd.clone().multiplyScalar(.45)), spot.face); if (token !== this.autoToken) return;
    this.char.play('sit');
    await wait(500);
    const hips = this.char.bone('Hips');
    if (hips) { const hp = new THREE.Vector3(); hips.getWorldPosition(hp); const d = spot.pos.clone().setY(FL + .5).sub(hp); d.y = Math.max(-.25, Math.min(.25, d.y + .06)); this.char.obj.position.add(d); }
    const t0 = Date.now(); while (Date.now() - t0 < 12000) { await wait(400); if (token !== this.autoToken) break; }
    this.char.play('idle');
    this.char.teleport(spot.pos.clone().add(fwd.clone().multiplyScalar(.45)).setY(FL), spot.face);
    await this.goOutside(token);
  }
  private async goSit(token: number, anim: 'sit' | 'sleep', then?: string) {
    const fwd = new THREE.Vector3(Math.sin(CHAIR_SPOT.face), 0, Math.cos(CHAIR_SPOT.face));
    // d'où arriver sur la chaise : devant elle si c'est libre, sinon par le côté qui donne sur le balcon, sinon par derrière.
    // Un point n'est gardé que s'il est vraiment libre (ni mur, ni rambarde, ni meuble) et qu'on peut y aller sans rien traverser.
    const centre = new THREE.Vector3(0, FL, LAYOUT.corridorZ);
    const cote = new THREE.Vector3(-fwd.z, 0, fwd.x); if (cote.dot(centre.clone().sub(CHAIR_SPOT.pos)) < 0) cote.negate();
    const essais = [fwd, cote, fwd.clone().add(cote).normalize(), fwd.clone().negate()].map(d => CHAIR_SPOT.pos.clone().addScaledVector(d, .5).setY(FL));
    const libre = essais.map(c => ({ c, f: freePoint(c.clone()) })).find(x => x.f.distanceTo(x.c) < .06 && !segmentBlocked(x.f, centre));
    const approach = libre ? libre.f : freePoint(essais[1].clone());
    await this.walk(approach, CHAIR_SPOT.face); if (token !== this.autoToken) return;       // la chaise reste un obstacle : on ne la traverse pas
    this.char.tourner(CHAIR_SPOT.face); await wait(350);
    this.char.play(anim);
    // on attend que l'animation soit installée (moment mesuré), puis on cale : le bassin au-dessus du centre de l'assise
    // en plan, et les cuisses (hauteur mesurée) posées sur l'assise en hauteur
    const cfg = this.char.sitCfg;
    await wait(cfg ? Math.min(4000, cfg.installe_a * 1000 + 450) : 500); if (token !== this.autoToken) { this.char.play('idle'); return; }   // après le fondu : la pose est la vraie
    const hips = this.char.bone('Hips');
    if (this.chaisePliante && anim === 'sit') {                          // place exacte sur la chaise pliante (Codex)
      const r = Game.CHAISE[this.state.character] ?? Game.CHAISE.lea;
      const end = CHAIR_SPOT.pos.clone().add(new THREE.Vector3(r.dx, r.dy, r.dz)).setY(FL + r.dy);
      const start = this.char.obj.position.clone();
      for (let k = 0; k <= 1.001; k += .1) { this.char.obj.position.lerpVectors(start, end, Math.min(1, k)); await wait(30); }
      this.char.obj.rotation.y = r.yaw;
    } else if (hips) {
      const seat = this.world.seatPoint();
      const hp = new THREE.Vector3(); hips.getWorldPosition(hp);
      const delta = seat.clone().sub(hp);
      if (cfg) delta.y = (seat.y + .08 - cfg.cuisses_z) - this.char.obj.position.y;       // cuisses à 8 cm au-dessus de l'assise
      else delta.y = Math.max(-.25, Math.min(.25, delta.y + .06));
      delta.add(fwd.clone().multiplyScalar(TUNE.sitForward)); delta.y += TUNE.sitDown;
      const start = this.char.obj.position.clone(), end = start.clone().add(delta);
      for (let k = 0; k <= 1.001; k += .1) { this.char.obj.position.lerpVectors(start, end, Math.min(1, k)); await wait(30); }
    }
    if (then === 'phone' && this.char.has('phone')) { await wait(1500); if (token === this.autoToken) { this.tenirTel(); this.char.play('phone', .4); } }
    const stay = anim === 'sleep' ? 40000 : 9000 + Math.random() * 6000;
    const t0 = Date.now();
    while (Date.now() - t0 < stay) { await wait(400); if (token !== this.autoToken) break; }
    this.release();
    this.char.play('idle');
    // on se relève devant la chaise, au sol
    this.char.teleport(new THREE.Vector3(approach.x, FL, approach.z), CHAIR_SPOT.face);
  }

  // ---------- jour et nuit
  private applyNightMode(mode: 'auto' | 'day' | 'night') {
    const q = new URLSearchParams(location.search);
    if (mode === 'auto' && q.get('night')) mode = 'night';
    if (mode === 'night') this.world.setNight(1);
    else if (mode === 'day') this.world.setNight(0);
    else this.world.setNight(this.nightFor(this.gameHour()));
  }

  // ---------- sauvegarde
  private persist() { this.state.lastSeen = Date.now(); this.save.store(this.state); this.sauverNuage(); }
  /** La copie en ligne : compacte (sans l'historique de la Bourse, 30 derniers messages, 20 derniers plats ≈ 23 Ko). */
  private sauverNuage(maintenant = false) {
    if (!EL.EN_LIGNE || !this.state) return;
    const s = this.state, im = s.eco.immeuble, j = s.eco.jardin;
    const data = { ...s, eco: { ...s.eco, immeuble: { ...im, historique: undefined, evenements: im.evenements.filter(e => e.pour === j.id).slice(-30), plats: im.plats.slice(-20) } } };
    const compteurs = { trocs: j.unites_echangees, recoltes: s.log.recoltes ?? 0, offerts: j.plats_offerts, recus: im.plats.filter(p => p.a === j.id).length };
    EL.sauverEnLigne(s.character as EL.Perso, data, compteurs, s.perso?.prenom || s.nickname || 'Jardinier', maintenant);
  }
  /** Connecté avec un compte : chaque partie en ligne (Léa, Marcel, Jimy) plus récente que celle du téléphone la remplace.
   *  Ainsi, on joue sur le téléphone, on rouvre sur l'ordinateur : tout est là. */
  private async recupererNuage(afficher = true) {
    const parties = await EL.partiesEnLigne();
    if (!parties.length) { this.sauverNuage(true); return; }
    const locales = this.save.liste();
    let derniere: { perso: string; t: number } | null = null;
    for (const p of parties) {
      const t = +new Date(p.maj);
      if (!locales[p.perso] || t > locales[p.perso]) this.save.importer(p.data as GameState, t);
      if (!derniere || t > derniere.t) derniere = { perso: p.perso, t };
    }
    this.ui.parties = this.save.liste();
    if (derniere && afficher) {
      const g = await this.save.loadFor(derniere.perso);
      if (g) { this.state = g; this.ui.showStart(true, tx(charDef(g.character).name)); }
      await this.teinterAccueil();
    }
  }

  // ---------- boucle
  private loop() {
    const dt = Math.min(.05, this.world.clock.getDelta());
    TEMPS_ARC.value += dt;
    if (!this.running && this.showroom) {
      this.showroom.update(dt);
      this.world.renderer.render(this.showroom.scene, this.showroom.camera);
      for (const p of this.state.pots) this.ui.clearBubble(p.id);
      if (!document.getElementById('start')?.classList.contains('hidden')) { const f = this.showroom.focused; this.ui.nameTags(this.showroom.labels().map(l => f ? { ...l, visible: l.visible && l.id === f } : l), this.showroom.selected); }
      requestAnimationFrame(() => this.loop());
      return;
    }
    const hour = this.gameHour();
    if (this.ui.nightMode === 'auto') this.world.setNight(this.nightFor(hour));
    this.ui.clock(hour, this.world.targetNight);
    if (this.char && this.running) this.world.suivreX = this.char.obj.position.x; else this.world.suivreX = null;
    this.world.update(dt);
    if (this.running) {
      this.char.update(dt);
      const W = this.world, y = this.char.obj.position.y, dedans = this.char.obj.position.z < FACADE_FRONT - .1;
      const sol = FL + (dedans ? W.solPiece : W.solBalcon);
      if (Math.abs(y - FL) < .03 || Math.abs(y - sol) < .03) this.char.obj.position.y = sol;   // debout : les pieds sur le vrai sol
      if (this.tel) this.placerTel();                                   // après l'animation : les mains sont à leur vraie place
      { const t = this.char.bone('Head'), p = new THREE.Vector3(); if (t) t.getWorldPosition(p); else p.copy(this.char.obj.position).setY(this.char.obj.position.y + 1.4); this.world.voirLaTete(p); }
      if (this.arrosoir) this.placerArrosoir(dt);
      this.tickAll();
      this.updateBubbles();
      if ((this.saveTimer += dt) > 30) { this.saveTimer = 0; this.persist(); }
    }
    this.world.render();
    requestAnimationFrame(() => this.loop());
  }
  private updateBubbles() {
    const now = Date.now();
    for (const p of this.state.pots) {
      const v = this.views.get(p.id); if (!v) continue;
      const base = v.slot.pos.clone().add(new THREE.Vector3(0, -.16, POT_SCALE * .6));    // nettement sous le pot, devant : rien n'est caché
      const sc = this.world.toScreen(base);
      let text = '', cls = '';
      if (p.plant) {
        if (P.isReady(p.plant)) { text = icon(p.plant.plant); cls = 'ready'; }
        else if (P.isWilted(p.plant, now)) { text = '🥀'; cls = 'wilt'; }
        else if (!P.isWet(p.plant, now)) { text = '💧'; cls = 'thirsty'; }
        else if (P.stage(p.plant) <= 1) { text = '🌱'; cls = 'seed'; }
      } else if (!p.plant) { text = '+'; cls = 'empty'; }
      this.ui.bubble(p.id, sc.x, sc.y, text, cls, sc.visible);
    }
  }
}

