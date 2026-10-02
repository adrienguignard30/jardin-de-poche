// =============================================================================================
//  EN LIGNE : comptes, sauvegardes dans le nuage, classement (Supabase).
//  Tout est facultatif : sans les clés du projet (fichier .env.local / réglages Vercel), le jeu reste 100 % local.
//  - « Jouer tout de suite » : un compte invité invisible (on peut le garder pour toujours, ou en faire un vrai compte).
//  - « Pseudo + mot de passe » : 8 caractères minimum. Supabase garde le mot de passe haché : personne ne peut le lire.
//    Supabase demande une adresse e-mail ; on en fabrique une invisible à partir du pseudo (aucune vraie adresse).
// =============================================================================================
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Le projet Supabase « potager-de-poche ». Ces deux valeurs sont PUBLIQUES par nature (elles arrivent dans le navigateur
// de chaque joueur) : la sécurité vient des règles de la base (chacun ne voit que ses lignes). Un fichier .env.local peut
// les remplacer. La clé « service_role » / « secret », elle, ne doit JAMAIS apparaître ici.
const URL_SB = ((import.meta as any).env?.VITE_SUPABASE_URL as string | undefined) || 'https://jbwlhapwszsuwirspybg.supabase.co';
const CLE_SB = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_Q8e86m330gqO-yRG3zawGA_JVEz2WvB';
export const EN_LIGNE = !!(URL_SB && CLE_SB);
export const sb: SupabaseClient | null = EN_LIGNE ? createClient(URL_SB!, CLE_SB!, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

const DOMAINE = 'joueurs.potager-de-poche.app';
export const MDP_MIN = 8;
export type Perso = 'lea' | 'marcel' | 'jimy';

/** Le pseudo tel qu'il est enregistré : minuscules, sans accents, lettres/chiffres/_.- , 3 à 20 caractères. */
export function normaliser(pseudo: string): string {
  return pseudo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '');
}
export const pseudoValide = (p: string) => /^[a-z0-9_.-]{3,20}$/.test(normaliser(p));
const emailDe = (pseudo: string) => `${normaliser(pseudo)}@${DOMAINE}`;
const COURANTS = new Set(['12345678', '123456789', '1234567890', 'azertyui', 'azertyuiop', 'qwertyui', 'qwertyuiop', 'password', 'motdepasse', '00000000', '11111111', 'abcdefgh', 'iloveyou', 'jardinier', 'potager1']);
export function refusMotDePasse(mdp: string): string | null {
  if (mdp.length < MDP_MIN) return 'court';
  if (COURANTS.has(mdp.toLowerCase())) return 'courant';
  return null;
}

export interface Etat { connecte: boolean; invite: boolean; pseudo: string | null }
let etat: Etat = { connecte: false, invite: false, pseudo: null };
const ecouteurs: ((e: Etat) => void)[] = [];
export const etatCompte = () => etat;
export function surCompte(f: (e: Etat) => void) { ecouteurs.push(f); f(etat); }
function maj(e: Partial<Etat>) { etat = { ...etat, ...e }; for (const f of ecouteurs) f(etat); }

/** Au démarrage : reprendre la session du téléphone (s'il y en a une). */
export async function demarrer() {
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  const u = data.session?.user;
  if (u) maj({ connecte: true, invite: !!u.is_anonymous, pseudo: u.is_anonymous ? null : (u.email ?? '').split('@')[0] });
}

/** « Jouer tout de suite » : un compte invité, sans rien taper. */
export async function jouerInvite(nom: string, captcha?: string): Promise<string | null> {
  if (!sb) return 'hors_ligne';
  if (etat.connecte) return null;
  const { error } = await sb.auth.signInAnonymously({ options: { captchaToken: captcha ?? await jetonAntiRobot().catch(() => undefined) } });
  if (error) return error.message;
  await sb.rpc('creer_profil', { p_pseudo: null, p_nom: nom });
  maj({ connecte: true, invite: true, pseudo: null });
  return null;
}

export async function pseudoDisponible(pseudo: string): Promise<boolean> {
  if (!sb || !pseudoValide(pseudo)) return false;
  const { data } = await sb.rpc('pseudo_disponible', { p: normaliser(pseudo) });
  return !!data;
}

/** Créer un compte. Si on jouait en invité, l'invité DEVIENT ce compte : rien n'est perdu. */
export async function creerCompte(pseudo: string, mdp: string, nom: string, captcha?: string): Promise<string | null> {
  if (!sb) return 'hors_ligne';
  const p = normaliser(pseudo);
  if (!pseudoValide(p)) return 'pseudo_invalide';
  const r = refusMotDePasse(mdp); if (r) return r;
  if (!(await pseudoDisponible(p))) return 'pseudo_pris';
  if (etat.connecte && etat.invite) {
    const { error } = await sb.auth.updateUser({ email: emailDe(p), password: mdp });
    if (error) return error.message;
  } else {
    const { error } = await sb.auth.signUp({ email: emailDe(p), password: mdp, options: { captchaToken: captcha } });
    if (error) return error.message.includes('registered') ? 'pseudo_pris' : error.message;
  }
  const { error: e2 } = await sb.rpc('creer_profil', { p_pseudo: p, p_nom: nom });
  if (e2) return e2.message.includes('duplicate') ? 'pseudo_pris' : e2.message;
  maj({ connecte: true, invite: false, pseudo: p });
  return null;
}

export async function seConnecter(pseudo: string, mdp: string, captcha?: string): Promise<string | null> {
  if (!sb) return 'hors_ligne';
  const { error } = await sb.auth.signInWithPassword({ email: emailDe(pseudo), password: mdp, options: { captchaToken: captcha } });
  if (error) return 'identifiants';
  maj({ connecte: true, invite: false, pseudo: normaliser(pseudo) });
  return null;
}

export async function seDeconnecter() { if (sb) await sb.auth.signOut(); maj({ connecte: false, invite: false, pseudo: null }); }

// ---------- les parties dans le nuage (une par personnage)
export async function partiesEnLigne(): Promise<{ perso: Perso; data: any; maj: string }[]> {
  if (!sb || !etat.connecte) return [];
  const { data } = await sb.from('parties').select('perso, data, maj');
  return (data ?? []) as any;
}
let derniereSauvegarde = 0, enAttente: { perso: Perso; data: any; compteurs: Compteurs; nom: string } | null = null, minuterie = 0;
export interface Compteurs { trocs: number; recoltes: number; offerts: number; recus: number }
/** Sauvegarder : au plus une fois par minute (et tout de suite en quittant la page). Très peu de transfert. */
export function sauverEnLigne(perso: Perso, data: any, compteurs: Compteurs, nom: string, maintenant = false) {
  if (!sb || !etat.connecte) return;
  enAttente = { perso, data, compteurs, nom };
  const attente = maintenant ? 0 : Math.max(0, 60000 - (Date.now() - derniereSauvegarde));
  clearTimeout(minuterie);
  minuterie = window.setTimeout(envoyer, attente);
}
async function envoyer() {
  const e = enAttente; if (!e || !sb) return;
  enAttente = null; derniereSauvegarde = Date.now();
  try {
    await sb.from('parties').upsert({ joueur: (await sb.auth.getUser()).data.user?.id, perso: e.perso, data: e.data, maj: new Date().toISOString() });
    await sb.rpc('maj_compteurs', { p_trocs: e.compteurs.trocs, p_recoltes: e.compteurs.recoltes, p_offerts: e.compteurs.offerts, p_recus: e.compteurs.recus, p_nom: e.nom });
  } catch (err) { console.warn('[en ligne] sauvegarde reportée', err); enAttente = enAttente ?? e; }
}
if (typeof window !== 'undefined') window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && enAttente) envoyer(); });

// ---------- le classement
export type Categorie = 'trocs' | 'recoltes' | 'offerts' | 'recus';
export async function classement(cat: Categorie): Promise<{ rang: number; nom: string; score: number; moi: boolean }[]> {
  if (!sb) return [];
  const { data } = await sb.rpc('classement', { p_type: cat, p_n: 20 });
  return (data ?? []) as any;
}

// ---------- l'anti-robot (Cloudflare Turnstile, gratuit et invisible pour un humain)
// Sa clé de site est PUBLIQUE (comme celle de Supabase). Tant qu'elle est vide, on ne demande rien (et Supabase non plus).
const CLE_TURNSTILE = ((import.meta as any).env?.VITE_TURNSTILE_SITEKEY as string | undefined) || '0x4AAAAAAFMLQ4CjEyknI-gx';   // clé de site (publique)
let chargement: Promise<any> | null = null;
function turnstile(): Promise<any> {
  if (!chargement) chargement = new Promise((ok, ko) => {
    if ((window as any).turnstile) return ok((window as any).turnstile);
    const sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; sc.async = true;
    sc.onload = () => ok((window as any).turnstile); sc.onerror = () => ko(new Error('captcha'));
    document.head.appendChild(sc);
  });
  return chargement;
}
/** Un jeton anti-robot tout frais (ou rien si l'anti-robot n'est pas encore branché). */
export async function jetonAntiRobot(): Promise<string | undefined> {
  if (!CLE_TURNSTILE) return undefined;
  const ts = await turnstile();
  return new Promise((ok, ko) => {
    const boite = document.createElement('div'); boite.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(boite);
    const fin = (f: () => void) => { try { ts.remove(id); } catch { /* ignore */ } boite.remove(); f(); };
    const id = ts.render(boite, { sitekey: CLE_TURNSTILE, size: 'invisible', callback: (t: string) => fin(() => ok(t)), 'error-callback': () => fin(() => ko(new Error('captcha'))) });
    setTimeout(() => fin(() => ko(new Error('captcha'))), 15000);
  });
}
