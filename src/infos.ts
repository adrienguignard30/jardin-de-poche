import { lang, texteNonVide, type Lang } from './i18n';

export interface TextePlante {
  titre: string; bienfaits: string[]; exposition: string; arrosage: string; recolte: string;
}
export interface TexteRecette {
  titre: string; resume: string; ingredients: string[]; etapes: string[]; astuce: string;
}
export interface LecturePlante { langue: Lang; texte: TextePlante }
export interface LectureRecette {
  langue: Lang; texte: TexteRecette; portions: number; usage: string;
  temps: { preparationMin: number; cuissonMin: number; reposMin: number };
}
const objet = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const liste = (v: unknown, min = 1): v is string[] =>
  Array.isArray(v) && v.length >= min && Array.from(v).every(texteNonVide);
function textePlante(v: unknown): v is TextePlante {
  const o = objet(v);
  return !!o && ['titre', 'exposition', 'arrosage', 'recolte'].every(k => texteNonVide(o[k])) && liste(o.bienfaits, 2);
}
function texteRecette(v: unknown): v is TexteRecette {
  const o = objet(v);
  return !!o && ['titre', 'resume', 'astuce'].every(k => texteNonVide(o[k])) && liste(o.ingredients) && liste(o.etapes, 3);
}
function fiche(donnees: unknown, collection: string, id: string) {
  const catalogue = objet(objet(donnees)?.[collection]);
  return catalogue && Object.prototype.hasOwnProperty.call(catalogue, id) ? objet(catalogue[id]) : null;
}

/** Une traduction incomplète fait revenir tout le bloc en anglais. */
export function lirePlante(donnees: unknown, id: string, l: Lang = lang()): LecturePlante | null {
  const textes = objet(fiche(donnees, 'plantes', id)?.textes), anglais = textes?.en;
  if (!textePlante(anglais)) return null;
  const candidat = textes?.[l];
  return textePlante(candidat) && candidat.bienfaits.length === anglais.bienfaits.length
    ? { langue: l, texte: candidat } : { langue: 'en', texte: anglais };
}
export function lireRecette(donnees: unknown, id: string, l: Lang = lang()): LectureRecette | null {
  const f = fiche(donnees, 'recettes', id), textes = objet(f?.textes), anglais = textes?.en, temps = objet(f?.temps);
  if (!f || !texteRecette(anglais) || !temps || !Number.isInteger(f.portions) || (f.portions as number) <= 0
    || !['entree', 'dessert', 'accompagnement'].includes(String(f.usage))
    || !['preparationMin', 'cuissonMin', 'reposMin'].every(k => typeof temps[k] === 'number' && Number.isFinite(temps[k]) && (temps[k] as number) >= 0)) return null;
  const candidat = textes?.[l];
  const complet = texteRecette(candidat) && candidat.ingredients.length === anglais.ingredients.length && candidat.etapes.length >= anglais.etapes.length;
  return {
    langue: complet ? l : 'en', texte: complet ? candidat as TexteRecette : anglais,
    portions: f.portions as number, usage: f.usage as string,
    temps: { preparationMin: temps.preparationMin as number, cuissonMin: temps.cuissonMin as number, reposMin: temps.reposMin as number },
  };
}

let chargement: Promise<{ plantes: unknown; recettes: unknown }> | undefined;
/** Chargement éditorial indépendant de l'économie et des sauvegardes. */
export function chargerInfos() {
  if (!chargement) {
    const charger = async (nom: string): Promise<unknown> => {
      try {
        const r = await fetch(new URL(`data/${nom}.json`, document.baseURI));
        return r.ok ? await r.json() : null;
      } catch { return null; }
    };
    chargement = Promise.all([charger('infos-plantes'), charger('infos-recettes')])
      .then(([plantes, recettes]) => ({ plantes, recettes }));
  }
  return chargement;
}
