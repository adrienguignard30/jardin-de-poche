import * as E from './economie';
import { tx } from './i18n';

// ---------- catalogue (public/data/catalog.json)
export type Bi = { fr: string; en: string };
export interface PlantDef { id: string; name: Bi; seed: number; harvest: number; grow: number; yield: number; harvests: number; unlock: { earned?: number; roof?: boolean } }
export interface PotStyle { id: string; name: Bi; extra: number }
export interface ItemDef { id: string; kind: 'deco' | 'upgrade' | 'roof'; object: string | null; price: number; name: Bi; desc: Bi; effect?: string }
export interface CharacterDef { id: string; file: string; name: Bi; tagline: Bi; age?: number; job?: Bi; story?: Bi; address?: Bi; likes?: Bi; theme?: { plaster: string; plasterDark: string; tileA: string; tileB: string; rail: string; brass: string; roof: boolean; terrace?: boolean }; phone?: { image?: string; screen?: [number, number, number, number] }; env?: { apartment?: string; balcony?: string; extra?: string; roof?: boolean }; view: string; universe: string; startSeeds: Record<string, number> }
export interface ViewDef { farDay: string; farNight: string; nearDay: string; nearNight: string }
export interface Catalog {
  version: number;
  characters: CharacterDef[];
  views: Record<string, ViewDef>;
  plants: PlantDef[];
  pots: { basePrice: number; stepPrice: number; max: number; styles: PotStyle[] };
  items: ItemDef[];
  start: { coins: number; pots: number; basket: number };
  timing: { wetFraction: number; wetMin: number; wiltAfterDry: number; regrowFraction: number; autonomyMin: number; autonomyMax: number; dayLength?: number };
}

export let CATALOG: Catalog;
export let ECO: E.Catalogue;
export async function loadCatalog(): Promise<Catalog> {
  const r = await fetch('data/catalog.json');
  CATALOG = await r.json();
  // les graines et les recettes du potager (fichiers fournis à part, remplaçables tels quels)
  const [gr, re] = await Promise.all([fetch('data/graines.json').then(x => x.json()), fetch('data/recettes.json').then(x => x.json())]);
  ECO = new E.Catalogue(gr, re);
  for (const g of ECO.v1()) {                                // chaque graine devient aussi une plante affichable
    const exist = CATALOG.plants.find(p => p.id === g.id);
    const def: PlantDef = { id: g.id, name: { fr: g.nom_fr, en: g.nom_en }, seed: 0, harvest: g.prix_base, grow: g.pousse_min * 60, yield: g.unites_par_recolte, harvests: g.recoltes, unlock: {} };
    if (exist) Object.assign(exist, def); else CATALOG.plants.push(def);
  }
  CATALOG.plants = CATALOG.plants.filter(p => ECO.graines.some(g => g.id === p.id));
  CATALOG.timing.wetFraction = .55; CATALOG.timing.regrowFraction = .35;   // un arrosage à mi-pousse ; repousse à 35 %
  return CATALOG;
}
export const plantDef = (id: string) => CATALOG.plants.find(p => p.id === id)!;
export const itemDef = (id: string) => CATALOG.items.find(i => i.id === id)!;
export const charDef = (id: string) => CATALOG.characters.find(c => c.id === id) ?? CATALOG.characters[0];

// ---------- état du jeu : un seul objet, sauvegardé tel quel
export interface PlantState {
  plant: string;          // id de la plante
  sownAt: number;         // ms
  grown: number;          // secondes de pousse effectives (n'avance que si la terre est humide)
  wateredAt: number;      // ms du dernier arrosage (0 = jamais)
  lastTick: number;       // ms du dernier calcul
  harvests: number;       // récoltes déjà faites sur ce semis
  acc?: number;           // accélération de ce semis (les premières pousses de l'accueil mûrissent en 90 s)
  variete?: number;       // quelle variété de la plante (les modèles v1, v2… de plantes.glb), tirée au semis
}
export interface PotState {
  id: number;             // index de l'emplacement (0..7 balcon, 8..13 toit)
  style: string;          // terracotta | wood | painted | metal | roof
  plant: PlantState | null;
}
export interface BasketItem { plant: string; count: number; value: number }
export interface Perso { prenom: string; age?: number; metier?: string; couleurs: Record<string, string>; photo?: string }

export interface GameState {
  version: number;
  createdAt: number;
  savedAt: number;
  character: string;
  view: string;
  nickname: string;
  coins: number;
  totalEarned: number;
  basketCap: number;
  basket: BasketItem[];
  seeds: Record<string, number>;
  pots: PotState[];
  items: string[];        // ids d'objets achetés (décos, améliorations, roof)
  roof: boolean;
  lastSeen: number;       // ms, pour le résumé au retour
  log: { wateredByChar: number; recoltes?: number };
  /** Mon profil : prénom, âge, métier, couleurs des vêtements, photo prise dans le jeu. */
  perso?: Perso;
  /** Le potager : mon jardin (règles), l'immeuble (voisins, cours, annonces), le carnet, l'horloge. */
  eco: { jardin: E.Jardin; immeuble: E.Immeuble; carnet: E.Plat[]; demo: boolean; t0: number; start: number; vus: number; platEnCours: E.Plat | null; potsAchetes: number; recusVus?: number; notifsVues?: number };
}

export const SAVE_KEY = 'jdp.save.v2';

export function newGame(characterId: string, nickname: string, perso?: Perso): GameState {
  const c = charDef(characterId);
  const now = Date.now();
  const pots: PotState[] = [];
  for (let i = 0; i < CATALOG.start.pots; i++) pots.push({ id: i, style: 'terracotta', plant: null });
  const v1 = ECO.v1().map(g => g.id);
  const poche = Object.keys(c.startSeeds).filter(id => v1.includes(id)).slice(0, 3);
  while (poche.length < 3) { const g = v1.find(x => !poche.includes(x)); if (!g) break; poche.push(g); }
  const r = E.rng(now & 0xffff);
  const interdites = v1.filter(g => !poche.includes(g)).sort(() => r() - .5).slice(0, 2);   // 2 graines impossibles ici, pour toujours
  const prenom = perso?.prenom?.trim() || nickname || tx(c.name);
  const jardin = E.creerJardin('moi', prenom, false, ECO, r, poche, interdites);
  jardin.pots = Array(8).fill(null);
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  const voisins = ['Léa', 'Marcel', 'Jimy', 'Nour', 'Théo', 'Inès'].filter(n => n.toLowerCase() !== prenom.toLowerCase()).slice(0, 5);
  const immeuble = E.creerImmeuble('imm_' + now.toString(36), jardin, ECO, now, voisins);
  return {
    version: 2, createdAt: now, savedAt: now, character: c.id, view: c.view, nickname: prenom, perso,
    coins: 0, totalEarned: 0, basketCap: 9999, basket: [],
    seeds: {}, pots, items: [], roof: false, lastSeen: now, log: { wateredByChar: 0 },
    eco: { jardin, immeuble, carnet: [], demo, t0: now, start: now, vus: 0, platEnCours: null, potsAchetes: 0 },
  };
}
/** Prix du prochain pot en points (3 offerts, puis 40, 70, 110, 160, 220). */
export const PRIX_POTS = [40, 70, 110, 160, 220];
export function prixProchainPot(s: GameState): number | null {
  const n = s.pots.filter(p => p.id < 8).length;
  if (n >= 8) return null;
  return PRIX_POTS[n - 3] ?? PRIX_POTS[PRIX_POTS.length - 1];
}

export function balconyValue(s: GameState): number {
  let v = 0;
  s.pots.forEach((p, i) => {
    if (i >= CATALOG.start.pots && p.id < 8) v += CATALOG.pots.basePrice + CATALOG.pots.stepPrice * (i - CATALOG.start.pots);
    const st = CATALOG.pots.styles.find(x => x.id === p.style);
    if (st) v += st.extra;
    if (p.plant) {
      const d = plantDef(p.plant.plant);
      const stage = Math.min(4, Math.floor(stageFraction(p.plant, d) * 5));
      v += Math.round(d.seed * (1 + stage));
    }
  });
  for (const id of s.items) v += itemDef(id)?.price ?? 0;
  return v;
}
export const score = (s: GameState) => s.totalEarned + balconyValue(s);

export function stageFraction(p: PlantState, d: PlantDef): number {
  return Math.min(1, p.grown / d.grow);
}
export function nextPotPrice(s: GameState): number | null {
  const balcony = s.pots.filter(p => p.id < 8).length;
  if (balcony >= CATALOG.pots.max) return null;
  return CATALOG.pots.basePrice + CATALOG.pots.stepPrice * (balcony - CATALOG.start.pots);
}
export function generateNickname(lang: 'fr' | 'en'): string {
  const n = 1000 + Math.floor(Math.random() * 9000);
  return (lang === 'fr' ? 'Jardinier ' : 'Gardener ') + n;
}

// ---------- couche de sauvegarde : le jeu ne parle qu'à ça
export interface SaveProvider {
  load(): Promise<GameState | null>;
  store(s: GameState): Promise<void>;
  clear(perso?: string): Promise<void>;
}
export class LocalSave implements SaveProvider {
  private cle = (perso: string) => `${SAVE_KEY}.${perso}`;
  private migrer() {                                                    // l'ancienne sauvegarde unique devient celle de son personnage
    try {
      const raw = localStorage.getItem(SAVE_KEY); if (!raw) return;
      const g = JSON.parse(raw) as GameState;
      if (g?.character && !localStorage.getItem(this.cle(g.character))) { localStorage.setItem(this.cle(g.character), raw); localStorage.setItem(`${SAVE_KEY}.dernier`, g.character); }
      localStorage.removeItem(SAVE_KEY);
    } catch { /* ignore */ }
  }
  /** La dernière partie jouée (pour « Reprendre » en haut de l'accueil). */
  async load() {
    this.migrer();
    try { const d = localStorage.getItem(`${SAVE_KEY}.dernier`); return d ? this.loadFor(d) : null; } catch { return null; }
  }
  async loadFor(perso: string): Promise<GameState | null> {
    try { const raw = localStorage.getItem(this.cle(perso)); return raw ? (JSON.parse(raw) as GameState) : null; } catch { return null; }
  }
  /** Les personnages qui ont déjà une partie, avec la date de sauvegarde. */
  liste(): Record<string, number> {
    this.migrer();
    const out: Record<string, number> = {};
    for (const p of ['lea', 'marcel', 'jimy']) { try { const raw = localStorage.getItem(this.cle(p)); if (raw) out[p] = (JSON.parse(raw) as GameState).savedAt ?? 1; } catch { /* ignore */ } }
    return out;
  }
  async store(s: GameState) {
    s.savedAt = Date.now();
    try { localStorage.setItem(this.cle(s.character), JSON.stringify(s)); localStorage.setItem(`${SAVE_KEY}.dernier`, s.character); } catch { /* quota ou navigation privée */ }
  }
  /** Effacer la partie d'un personnage (par défaut : la dernière jouée). */
  async clear(perso?: string) {
    try { const p = perso ?? localStorage.getItem(`${SAVE_KEY}.dernier`); if (p) localStorage.removeItem(this.cle(p)); localStorage.removeItem(`${SAVE_KEY}.dernier`); } catch { /* ignore */ }
  }
}
/**
 * Supabase (étape 7) : même interface, session anonyme, table players.
 * Le jeu appellera `new SupabaseSave(url, anonKey)` à la place de LocalSave, sans autre changement.
 * Tant que ce n'est pas branché, LocalSave sert aussi de secours si le réseau tombe.
 */
export class SupabaseSave implements SaveProvider {
  private fallback = new LocalSave();
  constructor(_url: string, _anonKey: string) { /* branchement à l'étape 7 */ }
  load() { return this.fallback.load(); }
  store(s: GameState) { return this.fallback.store(s); }
  clear() { return this.fallback.clear(); }
}
