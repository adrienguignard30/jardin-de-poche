// =============================================================================================
//  POTAGER DE POCHE — decouper-plats.mjs : 11 planches → 66 images de plats (512 × 512, fond transparent)
//
//  Lancement (depuis jardin-de-poche) :   npm i -D pngjs   puis   node outils/decouper-plats.mjs
//
//  Sources  : ..\images-recettes-source\recettes_planche_01.png … _11.png   (jamais modifiées)
//  Sortie   : public\ui\plats\<id de la recette>.png   (le dossier que lit le téléphone : ui/plats/<id>.png)
//  Noms     : la liste officielle public\data\recettes.json, dans son ordre, vérifiée contre la table ci-dessous.
//  Rapport  : public\ui\plats\_rapport.txt
// =============================================================================================
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const ICI = process.cwd();
// le dossier des planches : on le cherche aux endroits possibles (à côté du projet, dans le projet…)
const CANDIDATS = [path.resolve(ICI, '..', 'images-recettes-source'), path.resolve(ICI, 'images-recettes-source'),
  path.resolve(ICI, 'public', 'images-recettes-source'), path.resolve(ICI, '..', '..', 'images-recettes-source')];
const SOURCES = CANDIDATS.find(d => fs.existsSync(d)) ?? CANDIDATS[0];
const SORTIE = path.resolve(ICI, 'public', 'ui', 'plats');
const RECETTES = path.resolve(ICI, 'public', 'data', 'recettes.json');
const TAILLE = 512, MARGE = 24;                       // image finale, marge transparente régulière

// table de correspondance officielle (ordre des planches, position 1 = haut gauche … 6 = bas droite)
const TABLE = `fraises_au_basilic fraises_a_la_menthe tomates_au_basilic radis_ciboulette carottes_coriandre concombre_a_la_menthe
salade_croquante_du_balcon tomates_persil_oignon rubans_courgette_citron poivron_coriandre_citron epinards_radis_ciboulette haricots_tomates_persil
carottes_menthe_citron concombre_oignon_coriandre salade_peche_basilic radis_persil_citron tomate_poivron_ciboulette courgette_menthe_oignon
poelee_courgette_ail_thym haricots_ail_persil poivron_tomate_oignon epinards_ail_citron carottes_thym_oignon courgette_tomate_basilic
haricots_poivron_coriandre epinards_oignon_ciboulette carotte_courgette_persil tomate_ail_thym poivron_courgette_basilic haricot_carotte_thym
melon_fraise_menthe peche_framboise_basilic mangue_citron_menthe ananas_basilic_citron papaye_framboise_menthe fraise_peche_citron
salade_jardin_citronnee tomates_fraiches_aux_herbes carottes_poivron_coriandre haricots_radis_persil courgette_concombre_menthe epinards_fraise_basilic
salade_peche_radis tomate_concombre_coriandre ratatouille_du_balcon haricots_carottes_persilles epinards_courgette_thym poivrons_tomates_coriandre
carottes_courgettes_thym haricots_tomates_basilic epinards_poivron_ciboulette courgette_oignon_persil carotte_epinard_coriandre haricot_courgette_thym
poivron_carotte_persil tomate_epinard_ciboulette courgette_poivron_thym haricots_epinards_citron carottes_tomates_ciboulette poelee_quatre_du_jardin
salade_tropicale_menthee papaye_mangue_citron ananas_fraise_menthe melon_peche_framboise framboise_fraise_basilic melon_mangue_framboise`.split(/\s+/);

const L = [];
const say = (s) => { console.log(s); L.push(s); };
const stop = (s) => { say('ARRÊT : ' + s); fs.mkdirSync(SORTIE, { recursive: true }); fs.writeFileSync(path.join(SORTIE, '_rapport.txt'), L.join('\n')); process.exit(1); };
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// ---------- 1. la liste officielle
const recettes = JSON.parse(fs.readFileSync(RECETTES, 'utf8'));
const ids = recettes.map(r => r.id);
if (ids.length !== 66) stop(`recettes.json contient ${ids.length} recettes au lieu de 66`);
const ecarts = TABLE.map((t, i) => t !== ids[i] ? `recette ${i + 1} : table « ${t} » ≠ données « ${ids[i]} »` : null).filter(Boolean);
if (ecarts.length) stop('la table ne correspond pas aux données du jeu :\n' + ecarts.join('\n'));
say(`Liste officielle : 66 recettes (public/data/recettes.json), identique à la table.`);

// ---------- 2. les planches, et leur empreinte avant traitement
if (!fs.existsSync(SOURCES)) stop(`dossier des planches introuvable. Cherché ici :\n  ${CANDIDATS.join('\n  ')}`);
const contenu = fs.readdirSync(SOURCES);
say(`Dossier des planches : ${SOURCES} (${contenu.length} fichiers)`);
// chaque planche est reconnue par son numéro, quelle que soit l'écriture exacte (planche_01, Planche 1, .PNG, .png.png, .jpg…)
const images = contenu.filter(x => /\.(png|jpe?g)$/i.test(x));
let planches = Array.from({ length: 11 }, (_, i) => {
  const n = i + 1;
  const f = images.find(x => new RegExp(`planche\\D*0*${n}(?!\\d)`, 'i').test(x));
  return f ? path.join(SOURCES, f) : null;
});
let ordre = 'par numéro de planche dans le nom';
if (planches.some(p => !p)) {
  // pas de numéro dans les noms (« ChatGPT Image … ») : l'ordre d'arrivée fait foi, la plus ancienne = planche 01
  if (images.length !== 11) stop(`il faut exactement 11 images dans ${SOURCES}, il y en a ${images.length} :\n  ${images.join('\n  ')}`);
  const dates = images.map(f => ({ f, t: fs.statSync(path.join(SOURCES, f)).mtimeMs }));
  dates.sort((a, b) => a.t - b.t || a.f.localeCompare(b.f, 'fr', { numeric: true }));
  planches = dates.map(d => path.join(SOURCES, d.f));
  ordre = 'par ordre d\u2019arrivée (la plus ancienne = planche 01, la plus récente = planche 11)';
}
say(`Ordre des planches : ${ordre}`);
planches.forEach((p, i) => say(`  planche ${String(i + 1).padStart(2, '0')} ← ${path.basename(p)}   (${new Date(fs.statSync(p).mtimeMs).toLocaleString('fr-FR')})`));
const avant = planches.map(sha);

// ---------- outils image (RGBA 8 bits, en mémoire)
function lire(f) {
  const buf = fs.readFileSync(f);
  if (/\.jpe?g$/i.test(f)) { const j = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 1024 }); return { w: j.width, h: j.height, d: Buffer.from(j.data) }; }
  const png = PNG.sync.read(buf); return { w: png.width, h: png.height, d: png.data };
}
function ecrire(img, f) { const png = new PNG({ width: img.w, height: img.h }); img.d.copy(png.data); fs.writeFileSync(f, PNG.sync.write(png)); }

/** Si la planche n'a pas de transparence, on rend transparent son fond (remplissage depuis les bords, tolérance douce). */
function fondTransparent(img) {
  const { w, h, d } = img;
  let transp = 0;
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i] < 250) transp++;
  if (transp > (w * h / 97) * 0.05) return 'déjà transparente';
  // couleur du fond : médiane des bords
  const bord = [];
  for (let x = 0; x < w; x += 3) { bord.push(x * 4, ((h - 1) * w + x) * 4); }
  for (let y = 0; y < h; y += 3) { bord.push(y * w * 4, (y * w + w - 1) * 4); }
  const med = [0, 1, 2].map(k => { const v = bord.map(i => d[i + k]).sort((a, b) => a - b); return v[v.length >> 1]; });
  const dist = (i) => Math.hypot(d[i] - med[0], d[i + 1] - med[1], d[i + 2] - med[2]);
  const T = 12, T2 = 26;                                  // fond franc sous T, bord adouci jusqu'à T2 (serré : on ne mange jamais le bord d'une assiette claire)
  const vu = new Uint8Array(w * h), pile = [];
  for (let x = 0; x < w; x++) { pile.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { pile.push(y * w, y * w + w - 1); }
  while (pile.length) {
    const p = pile.pop(); if (vu[p]) continue;
    const i = p * 4, dd = dist(i);
    if (dd > T2) continue;
    vu[p] = 1;
    d[i + 3] = dd <= T ? 0 : Math.round(255 * (dd - T) / (T2 - T));
    if (dd > T) continue;                                 // on ne traverse que le vrai fond
    const x = p % w, y = (p / w) | 0;
    if (x > 0) pile.push(p - 1); if (x < w - 1) pile.push(p + 1); if (y > 0) pile.push(p - w); if (y < h - 1) pile.push(p + w);
  }
  return `fond ${'#' + med.map(v => v.toString(16).padStart(2, '0')).join('')} rendu transparent`;
}

/** Les 6 assiettes : composantes connexes des pixels visibles (sur une version réduite), rangées par lignes puis colonnes. */
function assiettes(img) {
  const { w, h, d } = img;
  const f = Math.max(1, Math.ceil(Math.max(w, h) / 900));      // travail sur une grille réduite, puis retour à la vraie taille
  const W = Math.ceil(w / f), H = Math.ceil(h / f);
  const m = new Uint8Array(W * H);
  for (let y = 0; y < h; y += f) for (let x = 0; x < w; x += f) if (d[(y * w + x) * 4 + 3] > 24) m[((y / f) | 0) * W + ((x / f) | 0)] = 1;
  const lab = new Int32Array(W * H).fill(-1), comps = [];
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || lab[s] >= 0) continue;
    const c = { n: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, sx: 0, sy: 0 }, id = comps.length; comps.push(c);
    const st = [s]; lab[s] = id;
    while (st.length) {
      const p = st.pop(), x = p % W, y = (p / W) | 0;
      c.n++; c.sx += x; c.sy += y; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx; if (m[q] && lab[q] < 0) { lab[q] = id; st.push(q); }
      }
    }
  }
  const total = W * H;
  let grandes = comps.filter(c => c.n > total * 0.01).sort((a, b) => b.n - a.n);
  if (grandes.length < 6) return null;
  grandes = grandes.slice(0, 6);
  // les petits morceaux détachés (une feuille, une goutte d'huile) rejoignent l'assiette qui les entoure
  for (const c of comps) {
    if (grandes.includes(c) || c.n < 3) continue;
    const cx = c.sx / c.n, cy = c.sy / c.n;
    const g = grandes.find(G => { const mx = (G.x1 - G.x0) * .08, my = (G.y1 - G.y0) * .08; return cx >= G.x0 - mx && cx <= G.x1 + mx && cy >= G.y0 - my && cy <= G.y1 + my; });
    if (g) { g.x0 = Math.min(g.x0, c.x0); g.y0 = Math.min(g.y0, c.y0); g.x1 = Math.max(g.x1, c.x1); g.y1 = Math.max(g.y1, c.y1); }
  }
  // lignes : les 3 plus hautes, puis les 3 autres ; dans chaque ligne, de gauche à droite
  const cy = (c) => (c.y0 + c.y1) / 2, cx = (c) => (c.x0 + c.x1) / 2;
  const tri = [...grandes].sort((a, b) => cy(a) - cy(b));
  const rangees = [tri.slice(0, 3).sort((a, b) => cx(a) - cx(b)), tri.slice(3).sort((a, b) => cx(a) - cx(b))];
  const pad = f + 2;
  return rangees.flat().map(c => ({ x0: Math.max(0, c.x0 * f - pad), y0: Math.max(0, c.y0 * f - pad), x1: Math.min(w - 1, (c.x1 + 1) * f + pad), y1: Math.min(h - 1, (c.y1 + 1) * f + pad) }));
}
/** Secours : la grille 3 × 2 fixe, puis la boîte des pixels visibles dans chaque case. */
function grille(img) {
  const { w, h, d } = img, out = [];
  for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
    const X0 = Math.floor(k * w / 3), X1 = Math.floor((k + 1) * w / 3) - 1, Y0 = Math.floor(r * h / 2), Y1 = Math.floor((r + 1) * h / 2) - 1;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    out.push(x1 < 0 ? { x0: X0, y0: Y0, x1: X1, y1: Y1 } : { x0: Math.max(X0, x0 - 2), y0: Math.max(Y0, y0 - 2), x1: Math.min(X1, x1 + 2), y1: Math.min(Y1, y1 + 2) });
  }
  return out;
}

/** Recadre, met à l'échelle sans déformer (moyenne par surface, alpha prémultiplié), centre dans 512 × 512 transparent. */
function vignette(img, b) {
  const sw = b.x1 - b.x0 + 1, sh = b.y1 - b.y0 + 1, inner = TAILLE - 2 * MARGE;
  const s = Math.min(inner / sw, inner / sh);
  const dw = Math.max(1, Math.round(sw * s)), dh = Math.max(1, Math.round(sh * s));
  const out = { w: TAILLE, h: TAILLE, d: Buffer.alloc(TAILLE * TAILLE * 4) };
  const ox = Math.floor((TAILLE - dw) / 2), oy = Math.floor((TAILLE - dh) / 2);
  for (let y = 0; y < dh; y++) {
    const sy0 = b.y0 + y / s, sy1 = b.y0 + (y + 1) / s;
    for (let x = 0; x < dw; x++) {
      const sx0 = b.x0 + x / s, sx1 = b.x0 + (x + 1) / s;
      let r = 0, g = 0, bl = 0, a = 0, wt = 0;
      for (let yy = Math.floor(sy0); yy < Math.ceil(sy1); yy++) {
        const wy = Math.min(yy + 1, sy1) - Math.max(yy, sy0); if (wy <= 0) continue;
        const Y = Math.min(img.h - 1, Math.max(0, yy));
        for (let xx = Math.floor(sx0); xx < Math.ceil(sx1); xx++) {
          const wx = Math.min(xx + 1, sx1) - Math.max(xx, sx0); if (wx <= 0) continue;
          const X = Math.min(img.w - 1, Math.max(0, xx));
          const i = (Y * img.w + X) * 4, al = img.d[i + 3] / 255, ww = wx * wy;
          r += img.d[i] * al * ww; g += img.d[i + 1] * al * ww; bl += img.d[i + 2] * al * ww; a += al * ww; wt += ww;
        }
      }
      const o = ((oy + y) * TAILLE + ox + x) * 4;
      if (a > 0) { out.d[o] = Math.round(r / a); out.d[o + 1] = Math.round(g / a); out.d[o + 2] = Math.round(bl / a); }
      out.d[o + 3] = Math.round(255 * a / wt);
    }
  }
  return { out, dw, dh };
}

// ---------- 3. le découpage
fs.mkdirSync(SORTIE, { recursive: true });
const faits = [];
for (let pi = 0; pi < 11; pi++) {
  const img = lire(planches[pi]);
  const fond = fondTransparent(img);
  let boites = assiettes(img), methode = 'détection des 6 assiettes';
  if (!boites) { boites = grille(img); methode = 'grille 3 × 2 (secours)'; }
  say(`Planche ${String(pi + 1).padStart(2, '0')} : ${img.w} × ${img.h}, ${fond}, ${methode}`);
  boites.forEach((b, k) => {
    const n = pi * 6 + k + 1, nom = ids[n - 1] + '.png';
    const { out, dw, dh } = vignette(img, b);
    ecrire(out, path.join(SORTIE, nom));
    faits.push({ n, planche: pi + 1, pos: k + 1, nom, dw, dh });
    say(`  position ${k + 1} → recette ${String(n).padStart(2, ' ')} → ${nom}   (assiette ${b.x1 - b.x0 + 1} × ${b.y1 - b.y0 + 1} px → ${dw} × ${dh})`);
  });
}

// ---------- 4. les vérifications
say('\nVÉRIFICATIONS');
const ok = (c, m) => { say(`  ${c ? 'OK' : '!!'}  ${m}`); return c; };
let tout = true;
const fichiers = fs.readdirSync(SORTIE).filter(f => f.endsWith('.png'));
const attendus = ids.map(i => i + '.png');
tout &= ok(faits.length === 66, `${faits.length} images produites (66 attendues)`);
tout &= ok(new Set(faits.map(f => f.nom)).size === 66, 'aucun doublon de nom');
const manquants = attendus.filter(a => !fichiers.includes(a));
tout &= ok(!manquants.length, manquants.length ? `fichiers manquants : ${manquants.join(', ')}` : 'aucun fichier attendu manquant');
let mauvaisesTailles = [], sansTransparence = [];
for (const a of attendus) {
  if (!fichiers.includes(a)) continue;
  const im = lire(path.join(SORTIE, a));
  if (im.w !== TAILLE || im.h !== TAILLE) mauvaisesTailles.push(a);
  const coin = im.d[3], transp = (() => { for (let i = 3; i < im.d.length; i += 4) if (im.d[i] === 0) return true; return false; })();
  if (coin !== 0 || !transp) sansTransparence.push(a);
}
tout &= ok(!mauvaisesTailles.length, mauvaisesTailles.length ? `pas en 512 × 512 : ${mauvaisesTailles.join(', ')}` : 'chaque image fait 512 × 512');
tout &= ok(!sansTransparence.length, sansTransparence.length ? `sans transparence : ${sansTransparence.join(', ')}` : 'transparence présente dans chaque image (coins et marge transparents)');
tout &= ok(faits.every(f => f.nom === TABLE[f.n - 1] + '.png' && f.n === (f.planche - 1) * 6 + f.pos), 'recette → planche → position → nom : conforme à la table');
const apres = planches.map(sha);
tout &= ok(apres.every((h, i) => h === avant[i]), 'aucune planche source modifiée (empreintes identiques avant / après)');
say(tout ? '\nTERMINÉ : 66 images prêtes dans public/ui/plats. Dans le jeu : F5, puis le Carnet.' : '\nTERMINÉ AVEC DES POINTS À VOIR (ci-dessus).');
fs.writeFileSync(path.join(SORTIE, '_rapport.txt'), L.join('\n'));
