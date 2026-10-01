// ---------------------------------------------------------------------------------------------
//  POTAGER DE POCHE — le moteur du jeu : graines, recette du jour, cours, troc, voisins, points.
//  Aucun rendu ici : tout est calculable, rejouable (hasard à graine fixe) et testable en dehors du navigateur.
//  Le temps passe par l'horloge `Horloge` : en mode démo, elle tourne 90 fois plus vite.
// ---------------------------------------------------------------------------------------------

export type Bi = { fr: string; en: string };
export type Famille = 'herbe' | 'racine' | 'fruit';

export interface Graine {
  id: string; v1?: boolean; famille: Famille;
  nom_fr: string; nom_en: string;
  pousse_min: number;            // minutes réelles pour arriver à maturité
  recoltes: number;              // nombre de récoltes par semis
  unites_par_recolte: number;
  prix_base: number;             // points, avant le cours
  phrase_fr?: string; phrase_en?: string; interdit_fr?: string; interdit_en?: string; couleur?: string;
}
export interface Ingredient { graine: string; quantite: number }
export interface Recette {
  id: string; type: 'entree' | 'plat' | 'dessert'; accueil?: boolean; amour_fr?: string; amour_en?: string; etapes_fr?: string[]; etapes_en?: string[];
  nom_fr: string; nom_en: string; ingredients: Ingredient[]; phrase_fr?: string; phrase_en?: string; difficulte?: number;
}

/** Une plante en pot, côté règles (le rendu lit `avancement`). */
export interface Semis {
  graine: string; seme_a: number; pousse_ms: number;   // pousse effective accumulée
  arrose: boolean;                                       // l'arrosage de mi-pousse a été fait
  recoltes_faites: number; dernier_tick: number;
}
export interface Jardin {
  id: string; nom: string; bot: boolean; caractere?: 'rapide' | 'marchand' | 'tardif' | 'genereux' | 'discret';
  interdites: string[];          // 2 graines à jamais impossibles ici (racontées par le décor)
  poche: Record<string, number>; // graines en sachet
  rares: Record<string, number>; // graines rares reçues (case à part)
  pots: (Semis | null)[];
  panier: Record<string, number>;// unités récoltées
  points: number;
  recette: RecetteDuJour | null;
  plats_offerts: number; rares_recues: number; unites_echangees: number;
  dernier_plat_offert_jour?: string;
  etape?: number;                 // les premiers pas (0 arrivée … 6 tout appris), pour le joueur humain
  recus?: Record<string, { de: string; n: number; comment: 'cadeau' | 'troc' }>;   // ce qui vient d'un voisin (affiché dans la recette)
}
export interface RecetteDuJour { recette: string; jour: string; faite: boolean; manquant: string }
export interface Annonce {
  id: string; de: string; donne: Ingredient; cherche: Ingredient; cree_a: number; expire_a: number;
  accepte_par?: string; accepte_a?: number; livree?: boolean;
}
export interface Plat { id: string; recette: string; par: string; a: string; jour: string; cree_a: number; valeur: number; nom?: string }
export interface Historique { t: number; jour: string; cours: Record<string, number>; demande: Record<string, number>; offre: Record<string, number>; cultivateurs: Record<string, number> }
export interface Immeuble {
  id: string; jardins: Jardin[]; annonces: Annonce[]; plats: Plat[]; _chauffe?: boolean;
  historique?: { heures: Historique[]; jours: Historique[] };
  reponses?: { de: string; pour: string; a: number }[];
  dernierPlatAuJoueur?: number;
  cours: Record<string, number>; cours_calcule_a: number; jour: string;
  evenements: Evenement[];
}
export interface Evenement { a: number; jour?: string; pour: string; type: 'troc_accepte' | 'plat_recu' | 'graine_rare' | 'bienvenue' | 'recette' | 'message'; de?: string; deId?: string; repondu?: boolean; platId?: string; texte_fr: string; texte_en: string }

/** Les premières recettes : pour chaque ingrédient qui manque, il existe toujours une annonce que le joueur peut payer
 *  tout de suite (une unité qu'il a en trop, ou des points). Plus tard, le marché est libre et demande de vrais choix. */
export function aideDebutant(im: Immeuble, j: Jardin, cat: Catalogue, now: number, recettesAidees = 4): number {
  if (j.bot || j.plats_offerts > recettesAidees || !j.recette || j.recette.faite) return 0;
  const besoin = new Set(cat.recette(j.recette.recette).ingredients.map(i => i.graine));
  const peutPayer = (a: Annonce) => a.cherche.graine === POINTS ? j.points >= a.cherche.quantite : (j.panier[a.cherche.graine] ?? 0) >= a.cherche.quantite && !besoin.has(a.cherche.graine);
  let n = 0;
  for (const m of manque(j, cat).filter(x => !j.poche[x.graine])) {
    const ok = im.annonces.some(a => !a.accepte_par && a.de !== j.id && a.donne.graine === m.graine && a.donne.quantite >= m.quantite && peutPayer(a));
    if (ok) continue;
    const v = im.jardins.find(x => x.bot && (x.poche[m.graine] || (x.panier[m.graine] ?? 0) > 0)) ?? im.jardins.find(x => x.bot);
    if (!v) continue;
    v.poche[m.graine] = v.poche[m.graine] ?? 1;
    const mien = Object.entries(j.panier).filter(([g, q]) => q > 0 && !besoin.has(g)).sort((x, y) => y[1] - x[1])[0]?.[0];
    const prix = Math.max(1, Math.round(valeur(im, m) * .8));
    const cherche: Ingredient = mien ? { graine: mien, quantite: 1 } : { graine: POINTS, quantite: Math.min(Math.max(1, j.points), prix) };
    if (cherche.graine === POINTS && j.points < 1) continue;                 // rien pour payer : on attendra une récolte
    im.annonces = im.annonces.filter(a => !(a.id.includes('_aide') && a.donne.graine === m.graine && !a.accepte_par));
    im.annonces.push({ id: `a${now}_${m.graine}_aide`, de: v.id, donne: { graine: m.graine, quantite: m.quantite }, cherche, cree_a: now, expire_a: now + 24 * H });
    n++;
  }
  return n;
}
export function garantirMarche(im: Immeuble, j: Jardin, cat: Catalogue, now: number): number {
  if (j.bot || !j.recette || j.recette.faite) return 0;
  const re = cat.recette(j.recette.recette);
  const besoin = new Set(re.ingredients.map(i => i.graine));
  const debutant = j.plats_offerts <= 4;
  const bots = im.jardins.filter(x => x.bot);
  let n = 0;
  // ce qui manque et que je n'ai pas en graine, ou que j'ai en graine mais qui ne pousse dans aucun de mes pots
  const enPousse = new Set(j.pots.filter(Boolean).map(x => x!.graine));
  for (const m of manque(j, cat).filter(x => !j.poche[x.graine] || !enPousse.has(x.graine))) {
    // 1. quelqu'un le cultive et en a assez de côté
    let v = bots.filter(b => b.poche[m.graine]).sort((a, b) => (b.panier[m.graine] ?? 0) - (a.panier[m.graine] ?? 0))[0];
    if (!v) { v = [...bots].sort((a, b) => Object.keys(a.poche).length - Object.keys(b.poche).length)[0]; v.poche[m.graine] = 1; }
    if ((v.panier[m.graine] ?? 0) < m.quantite + 2) v.panier[m.graine] = m.quantite + 2;
    // 2. une annonce qui le propose existe, et le joueur peut la payer (avec ce qu'il a EN TROP, ou ses points)
    const garde = (g: string) => re.ingredients.find(i => i.graine === g)?.quantite ?? 0;
    const surplus = (g: string) => Math.max(0, (j.panier[g] ?? 0) - garde(g));
    const paie = (a: Annonce) => a.cherche.graine === POINTS ? j.points >= a.cherche.quantite : surplus(a.cherche.graine) >= a.cherche.quantite;
    const ouvertes = im.annonces.filter(a => !a.accepte_par && a.de !== j.id && a.donne.graine === m.graine && a.donne.quantite >= m.quantite);
    if (ouvertes.some(paie)) continue;
    const valeurM = valeur(im, m);
    // ce que j'ai en trop qui tombe le plus juste (quantité arrondie au plus près)
    const essais = Object.keys(j.panier).filter(g => surplus(g) > 0).map(g => {
      const c = im.cours[g] ?? 1, q = Math.max(1, Math.min(surplus(g), Math.round(valeurM / c)));
      return { g, q, ecart: Math.abs(q * c - valeurM) / valeurM };
    }).sort((a, b) => a.ecart - b.ecart);
    const mien = essais[0]?.g;
    let cherche: Ingredient;
    if (mien) cherche = { graine: mien, quantite: debutant ? 1 : essais[0].q };
    else if (j.points > 0) cherche = { graine: POINTS, quantite: Math.max(1, Math.min(j.points, Math.round(valeurM * (debutant ? .6 : 1)))) };
    else {                                                                     // rien à donner aujourd'hui : une plante de sa poche, à récolter
      const vite = Object.keys(j.poche).sort((a, b) => cat.graine(a).pousse_min - cat.graine(b).pousse_min)[0];
      if (!vite) continue;
      if (ouvertes.some(a => a.id.includes('_aide') && a.cherche.graine === vite)) continue;   // déjà demandée : il la récoltera
      cherche = { graine: vite, quantite: 1 };
    }
    im.annonces = im.annonces.filter(a => !(a.id.includes('_aide') && a.donne.graine === m.graine && !a.accepte_par));
    // si ce que je donne vaut nettement plus, le voisin donne plus d'unités pour que ce soit juste
    const qDonne = Math.max(m.quantite, Math.round(valeur(im, cherche) / Math.max(.01, im.cours[m.graine] ?? 1)));
    if ((v.panier[m.graine] ?? 0) < qDonne) v.panier[m.graine] = qDonne + 1;
    im.annonces.push({ id: `a${now}_${m.graine}_aide`, de: v.id, donne: { graine: m.graine, quantite: debutant ? m.quantite : qDonne }, cherche, cree_a: now, expire_a: now + 24 * H });
    v.panier[m.graine] = Math.max(0, (v.panier[m.graine] ?? 0) - (debutant ? m.quantite : qDonne));   // l'annonce bloque ses unités
    n++;
  }
  return n;
}
/** Une annonce peut demander des points au lieu d'une plante (le premier troc guidé). */
export const POINTS = '__points__';

export const REGLES = {
  POCHE_MAX: 5, POINTS_MAX: 500, ANNONCES_MAX: 3, PANIER_MAX: 40,
  ANNONCE_DUREE_H: 24, COURS_PERIODE_MIN: 60, BOT_PERIODE_MIN: 10,
  COURS_MIN: 0.5, COURS_MAX: 3, ECART_TROC_MAX: 0.25, BOT_ACCEPTE_SI: 0.8,
  RARE_CHANCE: 1 / 3, RARE_CHANCE_DESSERT: 1 / 2,
  BOUTIQUE: [60, 120] as number[],           // prix de la 4e et de la 5e graine
  MULT_TYPE: { entree: 1, plat: 2, dessert: 3 } as Record<string, number>,
};

// ---------- horloge (réelle ou démo)
export class Horloge {
  constructor(public echelle = 1, private origine = Date.now(), private depart = Date.now()) {}
  now(): number { return this.origine + (Date.now() - this.depart) * this.echelle; }
  static fixe(t: number) { const h = new Horloge(0, t, 0); (h as any).now = () => t; return h; }
}
export const MIN = 60_000, H = 3_600_000;
export const jourDe = (t: number) => new Date(t).toISOString().slice(0, 10);

// ---------- hasard rejouable
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pick = <T>(arr: T[], r: () => number) => arr[Math.floor(r() * arr.length)];

// ---------- catalogue
export class Catalogue {
  constructor(public graines: Graine[], public recettes: Recette[]) {
    const ids = new Set(graines.map(g => g.id));
    this.recettes = recettes.filter(r => r.ingredients.every(i => ids.has(i.graine)));   // jamais une recette infaisable
  }
  graine(id: string) { const g = this.graines.find(x => x.id === id); if (!g) throw new Error('graine inconnue ' + id); return g; }
  recette(id: string) { const r = this.recettes.find(x => x.id === id); if (!r) throw new Error('recette inconnue ' + id); return r; }
  v1() { return this.graines.filter(g => g.v1 !== false); }
}

// ---------- pousse
export function avancement(s: Semis, g: Graine): number { return Math.min(1, s.pousse_ms / (g.pousse_min * MIN)); }
export function aSoif(s: Semis, g: Graine): boolean { return !s.arrose && avancement(s, g) >= .5 && avancement(s, g) < 1; }
export function mure(s: Semis, g: Graine): boolean { return avancement(s, g) >= 1; }
/** Fait avancer un semis jusqu'à `now` : la pousse s'arrête à mi-chemin tant qu'on n'a pas arrosé. Rien ne meurt. */
export function tickSemis(s: Semis, g: Graine, now: number) {
  const dt = Math.max(0, now - s.dernier_tick); s.dernier_tick = now;
  const total = g.pousse_min * MIN, mi = total / 2;
  if (s.pousse_ms < mi) s.pousse_ms = Math.min(mi, s.pousse_ms + dt) + (s.arrose ? Math.max(0, s.pousse_ms + dt - mi) : 0);
  else if (s.arrose) s.pousse_ms = Math.min(total, s.pousse_ms + dt);
  s.pousse_ms = Math.min(total, s.pousse_ms);
}
export function arroser(s: Semis) { s.arrose = true; }
export function tickJardin(j: Jardin, cat: Catalogue, now: number) { for (const s of j.pots) if (s) tickSemis(s, cat.graine(s.graine), now); }

// ---------- actions du joueur (et des bots : mêmes fonctions)
export function semer(j: Jardin, pot: number, graine: string, now: number): boolean {
  if (j.pots[pot] || !j.poche[graine] || j.interdites.includes(graine)) return false;
  j.pots[pot] = { graine, seme_a: now, pousse_ms: 0, arrose: false, recoltes_faites: 0, dernier_tick: now };
  return true;
}
export function semerRare(j: Jardin, pot: number, graine: string, now: number): boolean {
  if (j.pots[pot] || (j.rares[graine] ?? 0) <= 0) return false;                  // une rare pousse même si « interdite »
  j.rares[graine]--; if (j.rares[graine] === 0) delete j.rares[graine];
  j.pots[pot] = { graine, seme_a: now, pousse_ms: 0, arrose: false, recoltes_faites: 0, dernier_tick: now };
  return true;
}
/** Récolte : ajoute les unités au panier ; la plante repart pour un cycle de plus tant qu'il lui reste des récoltes. */
export function recolter(j: Jardin, pot: number, cat: Catalogue): number {
  const s = j.pots[pot]; if (!s) return 0;
  const g = cat.graine(s.graine); if (!mure(s, g)) return 0;
  // on récolte toujours (sinon le pot reste occupé pour rien) ; au-delà de la limite, le surplus part chez les voisins
  j.panier[g.id] = Math.min(REGLES.PANIER_MAX, (j.panier[g.id] ?? 0) + g.unites_par_recolte);
  s.recoltes_faites++;
  if (s.recoltes_faites >= g.recoltes) j.pots[pot] = null;
  else { s.pousse_ms = g.pousse_min * MIN * .35; s.arrose = false; }                 // repousse plus vite : 35 % déjà fait
  return g.unites_par_recolte;
}
export function acheterGraine(j: Jardin, graine: string): boolean {
  const n = Object.keys(j.poche).length;
  if (j.poche[graine] || n >= REGLES.POCHE_MAX || j.interdites.includes(graine)) return false;
  const prix = REGLES.BOUTIQUE[n - 3] ?? REGLES.BOUTIQUE[REGLES.BOUTIQUE.length - 1];
  if (n < 3) { j.poche[graine] = 1; return true; }                                  // les 3 premières sont offertes
  if (j.points < prix) return false;
  j.points -= prix; j.poche[graine] = 1; return true;
}

// ---------- le cours : base × (demande + 1) / (offre + 1), borné, recalculé toutes les heures
export function coursDe(base: number, offre: number, demande: number) {
  return Math.round(Math.max(base * REGLES.COURS_MIN, Math.min(base * REGLES.COURS_MAX, base * (demande + 1) / (offre + 1))) * 10) / 10;
}
export function calculerCours(im: Immeuble, cat: Catalogue, now: number) {
  const offre: Record<string, number> = {}, demande: Record<string, number> = {};
  for (const j of im.jardins) {
    for (const s of j.pots) if (s) { const g = cat.graine(s.graine); offre[g.id] = (offre[g.id] ?? 0) + g.unites_par_recolte * (g.recoltes - s.recoltes_faites); }
    for (const [g, n] of Object.entries(j.panier)) offre[g] = (offre[g] ?? 0) + n;
    if (j.recette && !j.recette.faite) for (const ing of cat.recette(j.recette.recette).ingredients) {
      const manque = Math.max(0, ing.quantite - (j.panier[ing.graine] ?? 0));
      if (manque) demande[ing.graine] = (demande[ing.graine] ?? 0) + manque;
    }
  }
  const cours: Record<string, number> = {};
  for (const g of cat.graines) cours[g.id] = coursDe(g.prix_base, offre[g.id] ?? 0, demande[g.id] ?? 0);
  im.cours = cours; im.cours_calcule_a = now;
  const cultivateurs: Record<string, number> = {};
  for (const j of im.jardins) { const vus = new Set([...Object.keys(j.poche), ...j.pots.filter(Boolean).map(x => x!.graine)]); for (const g of vus) cultivateurs[g] = (cultivateurs[g] ?? 0) + 1; }
  const H_ = (im.historique ??= { heures: [], jours: [] });
  const jr = jourDe(now);
  const dernier = H_.heures[H_.heures.length - 1];
  if (dernier && dernier.jour !== jr) {                                          // un jour se termine : sa moyenne rejoint l'historique
    const hs = H_.heures.filter(h => h.jour === dernier.jour);
    const moy = (k: 'cours' | 'demande' | 'offre' | 'cultivateurs') => { const o: Record<string, number> = {}; for (const g of cat.graines) o[g.id] = Math.round(hs.reduce((t, h) => t + (h[k][g.id] ?? 0), 0) / hs.length * 10) / 10; return o; };
    H_.jours.push({ t: dernier.t, jour: dernier.jour, cours: moy('cours'), demande: moy('demande'), offre: moy('offre'), cultivateurs: moy('cultivateurs') });
    if (H_.jours.length > 8) H_.jours.shift();
  }
  H_.heures.push({ t: now, jour: jr, cours: { ...cours }, demande: { ...demande }, offre: { ...offre }, cultivateurs });
  if (H_.heures.length > 60) H_.heures.shift();
  return { offre, demande };
}
export function prevision(im: Immeuble, cat: Catalogue, g: string, now: number): { prix: number; sens: 'hausse' | 'baisse' | 'stable' } {
  const gr = cat.graine(g), H_ = im.historique;
  let offre = 0, mures = 0;
  for (const j of im.jardins) { for (const s of j.pots) if (s && s.graine === g) { offre += gr.unites_par_recolte; const reste = gr.pousse_min * MIN - s.pousse_ms; if (reste < 24 * H) mures += gr.unites_par_recolte; } offre += j.panier[g] ?? 0; }
  const jours = H_?.jours.slice(-3) ?? [];
  const dem = jours.length ? jours.reduce((t, d) => t + (d.demande[g] ?? 0), 0) / jours.length : 0;
  const prix = coursDe(gr.prix_base, offre + mures * .5, dem);
  const cur = im.cours[g] ?? gr.prix_base;
  void now;
  return { prix, sens: prix > cur * 1.08 ? 'hausse' : prix < cur * .92 ? 'baisse' : 'stable' };
}
/** Un échange vu par celui qui reçoit « recu » et donne « donne » : avantageux, équitable ou désavantageux (aux prix du moment). */
export function jugement(im: Immeuble, recu: Ingredient, donne: Ingredient): { recoit: number; donne: number; ratio: number; verdict: 'avantageux' | 'equitable' | 'desavantageux' } {
  const vr = valeur(im, recu), vd = valeur(im, donne), ratio = vr / Math.max(.01, vd);
  return { recoit: Math.round(vr), donne: Math.round(vd), ratio, verdict: ratio >= 1.15 ? 'avantageux' : ratio >= .87 ? 'equitable' : 'desavantageux' };
}
export const valeur = (im: Immeuble, ing: Ingredient) => (ing.graine === POINTS ? 1 : (im.cours[ing.graine] ?? 1)) * ing.quantite;

// ---------- la recette du jour : 2 à 4 ingrédients que je cultive + 1 que je ne cultive pas
export function cultivables(j: Jardin) { return new Set([...Object.keys(j.poche), ...j.pots.filter(Boolean).map(s => s!.graine), ...Object.keys(j.rares)]); }
/** La toute première recette : un seul ingrédient, que je cultive déjà. On réussit avant d'apprendre le manque. */
export function tirerRecetteAccueil(j: Jardin, cat: Catalogue, jour: string): RecetteDuJour | null {
  const mes = cultivables(j);
  const re = cat.recettes.find(r => r.accueil && r.ingredients.every(i => mes.has(i.graine)));
  return re ? { recette: re.id, jour, faite: false, manquant: '' } : null;
}
export function tirerRecette(j: Jardin, im: Immeuble, cat: Catalogue, jour: string, hier?: string): RecetteDuJour | null {
  const r = rng(hash(j.id + jour));
  const mes = cultivables(j);
  // ce que les voisins font pousser : tout ce qui me manque doit exister chez au moins l'un d'eux (sinon la recette est infaisable)
  const chezVoisins = new Set<string>();
  for (const v of im.jardins) if (v.id !== j.id) { for (const g of Object.keys(v.poche)) chezVoisins.add(g); for (const [g, n] of Object.entries(v.panier)) if (n > 0) chezVoisins.add(g); }
  const note = (re: Recette) => {
    const manquants = re.ingredients.filter(i => !mes.has(i.graine));
    const miens = re.ingredients.length - manquants.length;
    if (miens < 1 || manquants.length < 1 || manquants.length > 2) return -1;       // au moins un à moi, un ou deux à troquer
    if (!manquants.every(i => chezVoisins.has(i.graine))) return -1;                   // faisable grâce aux voisins
    return miens * 2 - manquants.length;                                               // on préfère : beaucoup à moi, peu à troquer
  };
  let notes = cat.recettes.filter(re => !re.accueil && re.id !== hier).map(re => ({ re, n: note(re) })).filter(x => x.n >= 0);
  if (!notes.length && !j.bot) {
    // aucun voisin n'a encore ce qu'il faut : un voisin se met à le cultiver (la recette reste toujours faisable)
    const souple = cat.recettes.filter(re => !re.accueil && re.id !== hier).filter(re => { const m = re.ingredients.filter(i => !mes.has(i.graine)).length; return m >= 1 && m <= 2 && m < re.ingredients.length; });
    if (!souple.length) return null;
    const re = pick(souple, r);
    const bots = im.jardins.filter(v => v.bot);
    for (const i of re.ingredients.filter(x => !mes.has(x.graine))) { const b = pick(bots, r); if (b) { b.poche[i.graine] = 1; b.panier[i.graine] = (b.panier[i.graine] ?? 0) + i.quantite; } }
    notes = [{ re, n: 0 }];
  }
  if (!notes.length) return null;
  const best = Math.max(...notes.map(x => x.n));
  const top = notes.filter(x => x.n >= best - 1);                                      // les meilleures, avec un peu de variété
  const re = pick(top, r).re;
  return { recette: re.id, jour, faite: false, manquant: re.ingredients.find(i => !mes.has(i.graine))!.graine };
}
export function recetteDeDemain(j: Jardin, im: Immeuble, cat: Catalogue, now: number): RecetteDuJour | null {
  if (!j.recette || !j.recette.faite) return j.recette;
  const demain = jourDe(now + 24 * H);
  const r = tirerRecette(j, im, cat, demain, j.recette.recette);
  if (r) j.recette = r;
  return r;
}
export function manque(j: Jardin, cat: Catalogue): Ingredient[] {
  if (!j.recette || j.recette.faite) return [];
  return cat.recette(j.recette.recette).ingredients.map(i => ({ graine: i.graine, quantite: Math.max(0, i.quantite - (j.panier[i.graine] ?? 0)) })).filter(i => i.quantite > 0);
}

// ---------- le troc : annonce valorisée aux cours, écart ≤ 25 %, unités bloquées, acceptée par n'importe qui
export function creerAnnonce(im: Immeuble, j: Jardin, donne: Ingredient, cherche: Ingredient, now: number): Annonce | string {
  if (im.annonces.filter(a => a.de === j.id && !a.accepte_par).length >= (j.bot ? 2 : REGLES.ANNONCES_MAX)) return 'trop_d_annonces';
  if (donne.graine === POINTS ? j.points < donne.quantite : (j.panier[donne.graine] ?? 0) < donne.quantite) return 'pas_assez';
  const vd = valeur(im, donne), vc = valeur(im, cherche);
  if (j.bot ? Math.abs(vd - vc) > REGLES.ECART_TROC_MAX * Math.max(vd, vc) : (vd / Math.max(.01, vc) > 3 || vc / Math.max(.01, vd) > 3)) return 'ecart_trop_grand';
  if (donne.graine === POINTS) j.points -= donne.quantite;                         // bloqué
  else { j.panier[donne.graine] -= donne.quantite; if (!j.panier[donne.graine]) delete j.panier[donne.graine]; }
  const a: Annonce = { id: `a${now}_${j.id}`, de: j.id, donne, cherche, cree_a: now, expire_a: now + REGLES.ANNONCE_DUREE_H * H };
  im.annonces.push(a); return a;
}
export function retirerAnnonce(im: Immeuble, a: Annonce, j: Jardin): boolean {
  if (a.de !== j.id || a.accepte_par) return false;
  if (a.donne.graine === POINTS) j.points += a.donne.quantite; else j.panier[a.donne.graine] = (j.panier[a.donne.graine] ?? 0) + a.donne.quantite;
  im.annonces = im.annonces.filter(x => x !== a);
  return true;
}
/** Pourquoi je ne peux pas accepter cette annonce (null si je peux). */
export function refusAccepter(a: Annonce, j: Jardin, now: number): 'deja' | 'mienne' | 'expiree' | 'pas_assez' | null {
  if (a.accepte_par) return 'deja'; if (a.de === j.id) return 'mienne'; if (now > a.expire_a) return 'expiree';
  if (a.cherche.graine === POINTS ? j.points < a.cherche.quantite : (j.panier[a.cherche.graine] ?? 0) < a.cherche.quantite) return 'pas_assez';
  return null;
}
export function accepterAnnonce(im: Immeuble, a: Annonce, j: Jardin, now: number): boolean {
  if (a.accepte_par || a.de === j.id || now > a.expire_a) return false;
  if (a.cherche.graine === POINTS) {
    if (j.points < a.cherche.quantite) return false;
    j.points -= a.cherche.quantite;
    const v = im.jardins.find(x => x.id === a.de); if (v) v.points = Math.min(REGLES.POINTS_MAX, v.points + a.cherche.quantite);
  } else {
    if ((j.panier[a.cherche.graine] ?? 0) < a.cherche.quantite) return false;
    j.panier[a.cherche.graine] -= a.cherche.quantite; if (!j.panier[a.cherche.graine]) delete j.panier[a.cherche.graine];
  }
  if (a.donne.graine === POINTS) j.points = Math.min(REGLES.POINTS_MAX, j.points + a.donne.quantite);
  else { j.panier[a.donne.graine] = (j.panier[a.donne.graine] ?? 0) + a.donne.quantite; (j.recus ??= {})[a.donne.graine] = { de: im.jardins.find(x => x.id === a.de)?.nom ?? '?', n: a.donne.quantite, comment: 'troc' }; }
  a.accepte_par = j.id; a.accepte_a = now;
  j.unites_echangees += a.donne.quantite;
  return true;
}
/** Livraison au retour de l'auteur de l'annonce : ce qu'il cherchait arrive dans son panier, avec une bulle. */
export function livrer(im: Immeuble, j: Jardin, now: number, cat?: Catalogue): Annonce[] {
  const livrees: Annonce[] = [];
  for (const a of im.annonces) if (a.de === j.id && a.accepte_par && !a.livree) {
    j.panier[a.cherche.graine] = (j.panier[a.cherche.graine] ?? 0) + a.cherche.quantite;
    (j.recus ??= {})[a.cherche.graine] = { de: im.jardins.find(x => x.id === a.accepte_par)?.nom ?? '?', n: a.cherche.quantite, comment: 'troc' };
    j.points = Math.min(REGLES.POINTS_MAX, j.points + Math.round(valeur(im, a.donne) * .2));   // petite prime de troc
    j.unites_echangees += a.cherche.quantite; a.livree = true; livrees.push(a);
    const de = im.jardins.find(x => x.id === a.accepte_par)?.nom ?? '?';
    const g = cat?.graines.find(x => x.id === a.cherche.graine);
    const re = cat && j.recette ? cat.recettes.find(x => x.id === j.recette!.recette) : undefined;
    const pour = re && re.ingredients.some(i => i.graine === a.cherche.graine);
    im.evenements.push({ a: now, pour: j.id, type: 'troc_accepte', de, deId: a.accepte_par,
      texte_fr: `${de} a accepté ton échange : ${a.cherche.quantite} ${(g?.nom_fr ?? a.cherche.graine).toLowerCase()} dans ton panier${pour ? ` pour « ${re!.nom_fr} »` : ''}.`,
      texte_en: `${de} accepted your trade: ${a.cherche.quantite} ${(g?.nom_en ?? a.cherche.graine).toLowerCase()} in your basket${pour ? ` for “${re!.nom_en}”` : ''}.` });
  }
  return livrees;
}
export function purgerAnnonces(im: Immeuble, now: number) {
  for (const a of im.annonces) if (!a.accepte_par && now > a.expire_a) {           // expirée : on rend les unités bloquées
    const j = im.jardins.find(x => x.id === a.de); if (j) { if (a.donne.graine === POINTS) j.points += a.donne.quantite; else j.panier[a.donne.graine] = (j.panier[a.donne.graine] ?? 0) + a.donne.quantite; }
    a.accepte_par = '__expiree__';
  }
  im.annonces = im.annonces.filter(a => a.accepte_par !== '__expiree__' && !(a.livree && now - (a.accepte_a ?? 0) > 48 * H));
}

// ---------- cuisiner et offrir
export function peutCuisiner(j: Jardin, cat: Catalogue) { return !!j.recette && !j.recette.faite && manque(j, cat).length === 0; }
export function cuisiner(im: Immeuble, j: Jardin, cat: Catalogue, now: number): Plat | null {
  if (!peutCuisiner(j, cat)) return null;
  const re = cat.recette(j.recette!.recette);
  let v = 0;
  for (const ing of re.ingredients) { j.panier[ing.graine] -= ing.quantite; if (!j.panier[ing.graine]) delete j.panier[ing.graine]; v += valeur(im, ing); }
  const rare = re.ingredients.some(i => j.interdites.includes(i.graine)) ? 3 : 1;   // une rare dans le plat : ×3
  const plat: Plat = { id: `p${now}_${j.id}`, recette: re.id, par: j.id, a: '', jour: j.recette!.jour, cree_a: now, valeur: Math.round(v * REGLES.MULT_TYPE[re.type] * rare) };
  j.recette!.faite = true;
  return plat;
}
export function offrir(im: Immeuble, plat: Plat, j: Jardin, a: Jardin, cat: Catalogue, now: number, r = Math.random): { rare?: string } {
  plat.a = a.id; im.plats.push(plat);
  j.points = Math.min(REGLES.POINTS_MAX, j.points + plat.valeur);
  j.plats_offerts++; j.dernier_plat_offert_jour = jourDe(now);
  const re = cat.recette(plat.recette);
  const chance = re.type === 'dessert' ? REGLES.RARE_CHANCE_DESSERT : REGLES.RARE_CHANCE;
  let rare: string | undefined;
  if (r() < chance) {
    const dispo = cat.graines.filter(g => !cultivables(j).has(g.id) || j.interdites.includes(g.id));
    if (dispo.length) { rare = pick(dispo, r).id; j.rares[rare] = (j.rares[rare] ?? 0) + 1; j.rares_recues++; }
  }
  im.evenements.push({ a: now, pour: a.id, type: 'plat_recu', de: j.nom, deId: j.id, platId: plat.id, texte_fr: `${j.nom} t'a offert un plat : ${re.nom_fr}. Il est dans ton carnet.`, texte_en: `${j.nom} gave you a dish: ${re.nom_en}. It's in your notebook.` });
  if (rare) im.evenements.push({ a: now, pour: j.id, type: 'graine_rare', de: a.nom, texte_fr: `${a.nom} te remercie avec une graine rare : ${cat.graine(rare).nom_fr} !`, texte_en: `${a.nom} thanks you with a rare seed: ${cat.graine(rare).nom_en}!` });
  return { rare };
}

// ---------- la journée
export function nouveauJour(im: Immeuble, cat: Catalogue, now: number) {
  const jour = jourDe(now);
  if (im.jour === jour) return false;
  for (const j of im.jardins) {
    const hier = j.recette?.recette;
    if (!j.bot && (j.etape ?? 0) < 5) continue;                 // les premiers pas : la recette vient à son heure, pas à minuit
    if (j.recette && !j.recette.faite && j.recette.jour >= jour) continue;   // la recette de demain, déjà regardée, reste
    j.recette = tirerRecette(j, im, cat, jour, hier);
    if (!j.bot && j.recette) im.evenements.push({ a: now, pour: j.id, type: 'recette', texte_fr: `Ta recette du jour est arrivée : ${cat.recette(j.recette.recette).nom_fr}.`, texte_en: `Today's recipe has arrived: ${cat.recette(j.recette.recette).nom_en}.` });
  }
  im.jour = jour; purgerAnnonces(im, now);
  return true;
}

// ---------- les bots : de vrais jardins qui vivent, jamais préférés à un humain
export const CARACTERES: Record<string, { fr: string; accepte: number; poste: [number, number] }> = {
  rapide:   { fr: 'accepte tout de suite', accepte: 0.7, poste: [8, 20] },
  marchand: { fr: 'marchande', accepte: 0.95, poste: [8, 22] },
  tardif:   { fr: 'poste tard', accepte: 0.8, poste: [18, 24] },
  genereux: { fr: 'offre souvent', accepte: 0.75, poste: [7, 23] },
  discret:  { fr: 'peu d\'annonces', accepte: 0.85, poste: [9, 12] },
};
export function tickBot(im: Immeuble, b: Jardin, cat: Catalogue, now: number, r: () => number) {
  tickJardin(b, cat, now); livrer(im, b, now, cat);
  const heure = new Date(now).getUTCHours() + 1;                                  // ~Paris
  const car = CARACTERES[b.caractere ?? 'rapide'];
  // 1. jardiner : arroser, récolter, resemer
  b.pots.forEach((s, i) => {
    if (!s) { const g = pick(Object.keys(b.poche).filter(x => b.poche[x] > 0), r); if (g) semer(b, i, g, now); return; }
    const gd = cat.graine(s.graine);
    if (aSoif(s, gd) && r() < .9) arroser(s);
    if (mure(s, gd)) recolter(b, i, cat);
  });
  // 2a. les annonces du joueur d'abord : s'il a ce que le joueur cherche, il accepte (le prix est déjà équitable)
  const humain0 = im.jardins.find(j => !j.bot);
  if (humain0 && !im._chauffe) for (const a of im.annonces) {
    if (a.accepte_par || a.de !== humain0.id || a.cherche.graine === POINTS) continue;
    const pourLui = valeur(im, a.donne) / Math.max(.01, valeur(im, a.cherche));        // ce qu'il reçoit / ce qu'il donne
    const chance = Math.min(.95, Math.max(.03, .85 * pourLui * pourLui));
    if ((b.panier[a.cherche.graine] ?? 0) >= a.cherche.quantite && r() < chance && accepterAnnonce(im, a, b, now)) break;
  }
  // 2b. le marché : accepter une annonce qui lui va (prix ≥ 80 % du cours, il a besoin de la graine ou en manque)
  const besoins = new Set(manque(b, cat).map(m => m.graine));
  for (const a of im.annonces) {
    if (a.accepte_par || a.de === b.id) continue;
    if (a.id.includes('_guide') || a.id.includes('_aide') || a.donne.graine === POINTS || a.cherche.graine === POINTS) continue;   // réservées au joueur
    const bon = valeur(im, a.donne) >= car.accepte * REGLES.BOT_ACCEPTE_SI * valeur(im, a.cherche) * (1 / car.accepte);
    if (bon && (besoins.has(a.donne.graine) || r() < .25) && accepterAnnonce(im, a, b, now)) break;
  }
  // 3. poster un surplus, dans ses heures
  if (heure >= car.poste[0] && heure < car.poste[1] && r() < .5) {
    const surplus = Object.entries(b.panier).filter(([, n]) => n >= 4).sort((x, y) => y[1] - x[1])[0];
    const cherche = [...besoins][0] ?? pick(cat.v1().map(g => g.id).filter(g => g !== surplus?.[0]), r);
    if (surplus && cherche) {
      const donne: Ingredient = { graine: surplus[0], quantite: Math.min(4, surplus[1]) };
      const q = Math.max(1, Math.round(valeur(im, donne) / (im.cours[cherche] ?? 1)));
      creerAnnonce(im, b, donne, { graine: cherche, quantite: q }, now);
    }
  }
  // 4. cuisiner et offrir au joueur humain, une fois par jour
  // les voisins cuisinent et s'offrent des plats entre eux ; au joueur, au plus un plat par jour pour tout l'immeuble
  if (!im._chauffe && peutCuisiner(b, cat) && b.dernier_plat_offert_jour !== jourDe(now)) {
    const plat = cuisiner(im, b, cat, now);
    const humain = im.jardins.find(j => !j.bot);
    const auJoueur = !!humain && humain.plats_offerts >= 1 && (humain.etape ?? 6) >= 6            // jamais avant son premier plat offert
      && now - (im.dernierPlatAuJoueur ?? 0) >= 24 * H && r() < .5;
    const autres = im.jardins.filter(j => j.bot && j !== b);
    const dest = auJoueur ? humain! : autres[Math.floor(r() * autres.length)];
    if (plat && dest) { offrir(im, plat, b, dest, cat, now, r); if (auJoueur) im.dernierPlatAuJoueur = now; }
  }
}

// ---------- création d'un immeuble : le joueur + 5 voisins aux besoins complémentaires
export function creerJardin(id: string, nom: string, bot: boolean, cat: Catalogue, r: () => number, poche: string[], interdites: string[], caractere?: Jardin['caractere']): Jardin {
  const j: Jardin = { id, nom, bot, caractere, interdites, poche: {}, rares: {}, pots: Array(8).fill(null), panier: {}, points: 0, recette: null, plats_offerts: 0, rares_recues: 0, unites_echangees: 0 };
  for (const g of poche) j.poche[g] = 1;
  return j;
}
export function creerImmeuble(id: string, joueur: Jardin, cat: Catalogue, now: number, noms = ['Léa', 'Marcel', 'Jimy', 'Nour', 'Théo']): Immeuble {
  const r = rng(hash(id));
  const v1 = cat.v1().map(g => g.id);
  const im: Immeuble = { id, jardins: [joueur], annonces: [], plats: [], cours: {}, cours_calcule_a: 0, jour: '', evenements: [] };
  const cars: Jardin['caractere'][] = ['rapide', 'marchand', 'tardif', 'genereux', 'discret'];
  // chaque bot cultive en priorité ce que le joueur ne peut pas : ses interdites et ce qui n'est pas dans sa poche
  const freq: Record<string, number> = {};
  for (const re of cat.recettes) for (const i of re.ingredients) freq[i.graine] = (freq[i.graine] ?? 0) + 1;
  const manquePourLui = v1.filter(g => !joueur.poche[g]).sort((a, b) => (freq[b] ?? 0) - (freq[a] ?? 0)).slice(0, 12);
  noms.forEach((nom, k) => {
    const poche = [pick(manquePourLui, r), pick(manquePourLui, r), pick(v1, r)].filter((x, i, a) => a.indexOf(x) === i);
    while (poche.length < 3) { const g = pick(v1, r); if (!poche.includes(g)) poche.push(g); }
    const interdites = v1.filter(g => !poche.includes(g)).slice(0, 2);
    const b = creerJardin(`bot${k}`, nom, true, cat, r, poche, interdites, cars[k]);
    b.pots.forEach((_, i) => { if (i < 5) semer(b, i, poche[i % poche.length], now - (r() * 3 * H)); });   // ils ont déjà commencé
    b.panier[poche[0]] = 4; b.points = 40;
    im.jardins.push(b);
  });
  im._chauffe = true;
  const r2 = rng(hash(id + 'chauffe'));
  for (let t = now - 7 * 24 * H; t < now; t += 30 * MIN) tickImmeuble(im, cat, t, r2);
  im._chauffe = false;
  im.annonces = im.annonces.filter(a => a.de !== joueur.id);
  im.evenements = im.evenements.filter(e => e.pour !== joueur.id);
  im.plats = im.plats.filter(p => p.a !== joueur.id && p.par !== joueur.id);
  for (const b of im.jardins) if (b.bot) b.points = Math.min(b.points, 80);
  calculerCours(im, cat, now);
  nouveauJour(im, cat, now);
  joueur.etape = 0;
  return im;
}
/** Le premier manque : un voisin qui cultive l'ingrédient poste une annonce faite pour toi (il donne ce qui te manque,
 *  contre une seule unité de ce que tu as déjà). On apprend le troc en le faisant, jamais par un cadeau. */
export function premierTroc(im: Immeuble, j: Jardin, cat: Catalogue, now: number): Annonce | null {
  if (!j.recette || j.recette.faite) return null;
  const mqs = manque(j, cat).filter(m => !cultivables(j).has(m.graine));
  if (!mqs.length) return null;
  const mq = mqs[0];
  const v = im.jardins.find(x => x.bot && (x.poche[mq.graine] || (x.panier[mq.graine] ?? 0) > 0)) ?? im.jardins.find(x => x.bot)!;
  v.poche[mq.graine] = v.poche[mq.graine] ?? 1;
  const besoin = new Set(cat.recette(j.recette.recette).ingredients.map(i => i.graine));
  const mien = Object.entries(j.panier).filter(([g, n]) => n > 0 && !besoin.has(g)).sort((x, y) => y[1] - x[1])[0]?.[0];
  const prix = (m: Ingredient) => Math.max(1, Math.round(valeur(im, m) * .8));
  const contre = (m: Ingredient): Ingredient => mien ? { graine: mien, quantite: 1 } : { graine: POINTS, quantite: Math.min(j.points || prix(m), prix(m)) };
  const a: Annonce = { id: `a${now}_guide`, de: v.id, donne: { graine: mq.graine, quantite: mq.quantite }, cherche: contre(mq), cree_a: now, expire_a: now + 48 * H };
  im.annonces = im.annonces.filter(x => !x.id.includes('_guide'));
  im.annonces.push(a);
  for (const m of mqs.slice(1)) {                                       // un deuxième manque : un autre voisin l'a aussi en annonce
    const w = im.jardins.find(x => x.bot && x !== v && (x.poche[m.graine] || (x.panier[m.graine] ?? 0) > 0)) ?? v;
    w.poche[m.graine] = w.poche[m.graine] ?? 1;
    im.annonces.push({ id: `a${now}_${m.graine}_guide2`, de: w.id, donne: { graine: m.graine, quantite: m.quantite }, cherche: contre(m), cree_a: now, expire_a: now + 48 * H });
  }
  return a;
}

/** Un tour de simulation : à appeler souvent ; il fait le nécessaire selon l'heure (cours, bots, jour). */
/** Les messages préécrits (comme dans les jeux entre voisins : pas de chat libre, que de la gentillesse). */
export const REPONSES: Record<string, { fr: string; en: string }[]> = {
  plat_recu: [{ fr: 'Merci, c\u2019était délicieux !', en: 'Thank you, it was delicious!' }, { fr: 'Merci voisin, tu m\u2019as fait plaisir !', en: 'Thanks neighbour, you made my day!' },
    { fr: 'Tu as des talents de chef !', en: 'You\u2019re a real chef!' }, { fr: 'Je te rends la pareille très vite !', en: 'I\u2019ll return the favour soon!' }],
  troc_accepte: [{ fr: 'Merci pour l\u2019échange !', en: 'Thanks for the trade!' }, { fr: 'Parfait, merci voisin !', en: 'Perfect, thanks neighbour!' },
    { fr: 'Au plaisir de troquer à nouveau !', en: 'Happy to trade again!' }, { fr: 'Tes récoltes sont superbes !', en: 'Your harvest looks great!' }],
  message: [{ fr: 'Avec plaisir !', en: 'My pleasure!' }, { fr: 'Bonne journée, voisin !', en: 'Have a nice day, neighbour!' }],
};
const REPONSES_VOISINS = [{ fr: 'Avec plaisir !', en: 'My pleasure!' }, { fr: 'De rien, bon appétit !', en: 'You\u2019re welcome, enjoy!' },
  { fr: 'À charge de revanche !', en: 'Next one\u2019s on me!' }, { fr: 'Ça me fait plaisir !', en: 'Glad to help!' }, { fr: 'Merci à toi, voisin !', en: 'Thank you, neighbour!' }];
export function envoyerMessage(im: Immeuble, de: Jardin, a: Jardin, texte: { fr: string; en: string }, now: number) {
  im.evenements.push({ a: now, pour: a.id, type: 'message', de: de.nom, deId: de.id, texte_fr: texte.fr, texte_en: texte.en });
  if (a.bot) (im.reponses ??= []).push({ de: a.id, pour: de.id, a: now + (3 + Math.random() * 12) * MIN });   // il répond un peu plus tard
}
export function tickImmeuble(im: Immeuble, cat: Catalogue, now: number, r: () => number, echelle = 1) {
  for (const rep of (im.reponses ?? []).filter(x => x.a <= now)) {
    const b = im.jardins.find(x => x.id === rep.de); if (!b) continue;
    const t = REPONSES_VOISINS[Math.floor(r() * REPONSES_VOISINS.length)];
    im.evenements.push({ a: now, pour: rep.pour, type: 'message', de: b.nom, deId: b.id, texte_fr: `${b.nom} : « ${t.fr} »`, texte_en: `${b.nom}: “${t.en}”` });
  }
  if (im.reponses) im.reponses = im.reponses.filter(x => x.a > now);
  const p_cours = REGLES.COURS_PERIODE_MIN * MIN, p_bot = REGLES.BOT_PERIODE_MIN * MIN;
  void echelle;
  if (now - im.cours_calcule_a >= p_cours) calculerCours(im, cat, now);
  nouveauJour(im, cat, now);
  for (const b of im.jardins) if (b.bot) {
    const bb = b as Jardin & { _tick?: number };
    if (!bb._tick || now - bb._tick >= p_bot) { bb._tick = now; tickBot(im, b, cat, now, r); }
  }
  purgerAnnonces(im, now);
}
