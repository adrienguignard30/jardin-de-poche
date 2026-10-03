// =============================================================================================
//  ANALYSE AUTOMATIQUE DES ANIMATIONS — Potager de Poche
//  À lancer depuis le dossier jardin-de-poche :   node analyser-animations.mjs
//  Lit chaque personnage (public/models/**/*.glb avec un squelette), rejoue chaque animation os par os
//  (30 images/s) et mesure : pieds sous le sol, personnage qui flotte, pieds qui glissent, main trop basse,
//  coude à l'envers, rotation extrême d'un bras, saut quand l'animation reboucle, personnage qui se déplace,
//  animations manquantes. Écrit le rapport dans rapport-animations.txt. Ne modifie AUCUN fichier.
// =============================================================================================
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

const DOSSIER = process.argv[2] || 'public/models';
const ATTENDUES = ['idle', 'walk', 'plant', 'water', 'harvest', 'pickup', 'phone', 'sit', 'sleep', 'dance', 'sport_squat', 'sport_gainage', 'regard_epaule'];
const SANS_SOL = /sit|sleep|gainage|lie|couch/i;          // assis / couché : on ne juge pas les pieds
const MARCHE = /walk|run|marche/i;
const BOUCLE = /idle|walk|dance|sit|sleep|phone|sport|run/i;
const GESTE_BAS = /plant|harvest|water|pickup|semer|recolt|arros/i;
const TAILLE_REF = 1.70;                                     // pour parler en centimètres

// ---------- lecture d'un fichier .glb
function lireGlb(f) {
  const b = fs.readFileSync(f);
  if (b.readUInt32LE(0) !== 0x46546c67) return null;
  const n = b.readUInt32LE(12), js = JSON.parse(b.toString('utf8', 20, 20 + n));
  const off = 20 + n; const bin = off + 8 <= b.length ? b.subarray(off + 8, off + 8 + b.readUInt32LE(off)) : Buffer.alloc(0);
  return { js, bin };
}
const NB = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessor(g, i) {
  const a = g.js.accessors[i], bv = g.js.bufferViews[a.bufferView], k = NB[a.type];
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const taille = { 5126: 4, 5122: 2, 5123: 2, 5120: 1, 5121: 1 }[a.componentType];
  const pas = bv.byteStride ?? taille * k, out = new Float32Array(a.count * k);
  for (let e = 0; e < a.count; e++) for (let c = 0; c < k; c++) {
    const o = base + e * pas + c * taille; let v;
    switch (a.componentType) {
      case 5126: v = g.bin.readFloatLE(o); break;
      case 5122: v = g.bin.readInt16LE(o); if (a.normalized) v = Math.max(v / 32767, -1); break;
      case 5123: v = g.bin.readUInt16LE(o); if (a.normalized) v /= 65535; break;
      case 5120: v = g.bin.readInt8(o); if (a.normalized) v = Math.max(v / 127, -1); break;
      default: v = g.bin.readUInt8(o); if (a.normalized) v /= 255;
    }
    out[e * k + c] = v;
  }
  return { data: out, k, count: a.count };
}

// ---------- squelette : positions monde de chaque nœud à un instant donné
function preparer(g) {
  const nodes = g.js.nodes.map((n, i) => {
    const t = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(t, r, s);
    if (n.translation) t.fromArray(n.translation);
    if (n.rotation) r.fromArray(n.rotation);
    if (n.scale) s.fromArray(n.scale);
    return { i, nom: n.name ?? `noeud${i}`, enfants: n.children ?? [], t, r, s, parent: -1 };
  });
  nodes.forEach(n => n.enfants.forEach(c => { nodes[c].parent = n.i; }));
  const racines = (g.js.scenes?.[g.js.scene ?? 0]?.nodes) ?? nodes.filter(n => n.parent < 0).map(n => n.i);
  return { nodes, racines };
}
function poseMonde(sq, local /* Map i -> {t,r,s} */) {
  const monde = new Array(sq.nodes.length);
  const m = new THREE.Matrix4();
  const visiter = (i, parent) => {
    const n = sq.nodes[i], L = local.get(i);
    m.compose(L?.t ?? n.t, L?.r ?? n.r, L?.s ?? n.s);
    monde[i] = parent ? parent.clone().multiply(m) : m.clone();
    for (const c of n.enfants) visiter(c, monde[i]);
  };
  for (const r of sq.racines) visiter(r, null);
  return monde;
}
function echantillonneur(g, anim) {
  const canaux = anim.channels.filter(c => c.target.node !== undefined).map(c => {
    const smp = anim.samplers[c.sampler], inp = accessor(g, smp.input), out = accessor(g, smp.output);
    return { node: c.target.node, path: c.target.path, temps: inp.data, val: out.data, k: out.k, cubic: smp.interpolation === 'CUBICSPLINE', step: smp.interpolation === 'STEP' };
  }).filter(c => c.path !== 'weights');
  const duree = Math.max(0, ...canaux.map(c => c.temps[c.temps.length - 1] ?? 0));
  const valeur = (c, j) => { const k = c.k, o = c.cubic ? (j * 3 + 1) * k : j * k; return Array.from(c.val.subarray(o, o + k)); };
  return {
    duree,
    local(t) {
      const L = new Map();
      for (const c of canaux) {
        const T = c.temps; let j = 0;
        while (j < T.length - 1 && T[j + 1] <= t) j++;
        const a = valeur(c, j), b = valeur(c, Math.min(j + 1, T.length - 1));
        const u = c.step || j >= T.length - 1 ? 0 : Math.min(1, Math.max(0, (t - T[j]) / Math.max(1e-6, T[j + 1] - T[j])));
        const e = L.get(c.node) ?? {}; L.set(c.node, e);
        if (c.path === 'rotation') e.r = new THREE.Quaternion().fromArray(a).slerp(new THREE.Quaternion().fromArray(b), u).normalize();
        else if (c.path === 'translation') e.t = new THREE.Vector3().fromArray(a).lerp(new THREE.Vector3().fromArray(b), u);
        else if (c.path === 'scale') e.s = new THREE.Vector3().fromArray(a).lerp(new THREE.Vector3().fromArray(b), u);
      }
      return L;
    },
  };
}

// ---------- les os qui nous intéressent (Mixamo : mixamorig:Hips, mixamorigLeftFoot…)
const propre = s => s.replace(/^.*mixamorig[:_]?/i, '').replace(/[^a-z]/gi, '').toLowerCase();
function trouverOs(sq) {
  const os = {};
  const veux = { hips: 'hips', head: 'head', piedG: 'leftfoot', piedD: 'rightfoot', orteilG: 'lefttoebase', orteilD: 'righttoebase',
    mainG: 'lefthand', mainD: 'righthand', brasG: 'leftarm', brasD: 'rightarm', avbrasG: 'leftforearm', avbrasD: 'rightforearm' };
  for (const [cle, nom] of Object.entries(veux)) { const n = sq.nodes.find(x => propre(x.nom) === nom); if (n) os[cle] = n.i; }
  return os;
}
const pos = (monde, i) => i === undefined ? null : new THREE.Vector3().setFromMatrixPosition(monde[i]);

// ---------- analyse d'une animation
function analyser(g, sq, os, anim, ref) {
  const smp = echantillonneur(g, anim), nom = anim.name ?? 'sans_nom';
  const N = Math.max(2, Math.round(smp.duree * 30) + 1), H = ref.H, cm = v => Math.round(v / H * TAILLE_REF * 100);
  const pb = [];
  let sousSol = 0, flotte = 0, mainBasse = Infinity, coudeEnvers = { G: 0, D: 0 }, extreme = { G: 0, D: 0 }, glisse = 0, auSol = 0;
  let premiere = null, derniere = null, hips0 = null, hipsN = null, piedsPrec = null;
  for (let f = 0; f < N; f++) {
    const t = smp.duree * f / (N - 1), L = smp.local(t), M = poseMonde(sq, L);
    const pieds = ['piedG', 'piedD', 'orteilG', 'orteilD'].map(k => pos(M, os[k])).filter(Boolean);
    const bas = Math.min(...pieds.map(p => p.y)) - ref.sol;
    if (!SANS_SOL.test(nom)) {
      sousSol = Math.min(sousSol, bas);
      if (bas > .05 * H) flotte++;
      // glissement : un pied posé (au ras du sol) qui avance
      if (piedsPrec && !MARCHE.test(nom)) for (let p = 0; p < pieds.length; p++) {
        if (pieds[p].y - ref.sol < .025 * H) { auSol++; const v = Math.hypot(pieds[p].x - piedsPrec[p].x, pieds[p].z - piedsPrec[p].z) * 30 / H * TAILLE_REF; if (v > .35) glisse++; }
      }
    }
    piedsPrec = pieds;
    for (const k of ['mainG', 'mainD']) { const p = pos(M, os[k]); if (p) mainBasse = Math.min(mainBasse, p.y - ref.sol); }
    // coude à l'envers : le coude pointe vers l'avant du corps alors que le bras est plié
    const hips = os.hips !== undefined ? M[os.hips] : null;
    const avant = hips ? new THREE.Vector3(0, 0, 1).transformDirection(hips).setY(0).normalize() : new THREE.Vector3(0, 0, 1);
    for (const c of ['G', 'D']) {
      const e = pos(M, os['bras' + c]), co = pos(M, os['avbras' + c]), mn = pos(M, os['main' + c]);
      if (e && co && mn) {
        const a = co.clone().sub(e), b = mn.clone().sub(co);
        const pli = a.angleTo(b) * 180 / Math.PI;
        const ligne = mn.clone().sub(e).normalize(), proj = e.clone().add(ligne.clone().multiplyScalar(co.clone().sub(e).dot(ligne)));
        const pointe = co.clone().sub(proj);
        const centre = hips ? new THREE.Vector3().setFromMatrixPosition(hips) : e.clone();
        const dehors = e.clone().sub(centre).setY(0).normalize();               // du centre du corps vers cette épaule
        if (pli > 35 && pointe.length() > .01 * H) {
          pointe.normalize();
          const mainDerriere = b.dot(avant) < -.05 * H;                          // l'avant-bras part vers l'arrière
          if ((pointe.dot(avant) > .45 && mainDerriere) || pointe.dot(dehors) < -.75) coudeEnvers[c]++;   // coude vers l'avant, ou vers le ventre
        }
      }
      // rotation extrême d'un os du bras par rapport au repos (bras « retourné »)
      for (const k of ['bras' + c, 'avbras' + c, 'main' + c]) {
        const i = os[k]; if (i === undefined) continue;
        const q = L.get(i)?.r; if (!q) continue;
        if (q.angleTo(sq.nodes[i].r) * 180 / Math.PI > 150) { extreme[c]++; break; }
      }
    }
    const poseRot = new Map([...L].filter(([, v]) => v.r).map(([i, v]) => [i, v.r.clone()]));
    if (f === 0) { premiere = poseRot; hips0 = pos(M, os.hips); }
    if (f === N - 1) { derniere = poseRot; hipsN = pos(M, os.hips); }
  }
  // les constats
  if (sousSol < -.02 * H) pb.push(`pieds sous le sol (jusqu'à ${-cm(sousSol)} cm)`);
  if (!SANS_SOL.test(nom) && flotte / N > .5) pb.push(`flotte au-dessus du sol (${Math.round(flotte / N * 100)} % du temps)`);
  if (auSol > 10 && glisse / auSol > .15) pb.push(`pied posé qui glisse (${Math.round(glisse / auSol * 100)} % du temps au sol)`);
  if (mainBasse < Infinity) {
    const h = cm(mainBasse);
    if (GESTE_BAS.test(nom) && h < 22) pb.push(`la main descend à ${h} cm du sol : plus bas que la terre des pots (vers 30 cm), elle s'enfonce`);
    else if (!SANS_SOL.test(nom) && h < 4) pb.push(`une main touche le sol (${h} cm)`);
  }
  for (const c of ['G', 'D']) {
    const cote = c === 'G' ? 'gauche' : 'droit';
    if (coudeEnvers[c] / N > .1) pb.push(`coude ${cote} plié à l'envers ${Math.round(coudeEnvers[c] / N * 100)} % du temps`);
    if (extreme[c] / N > .1) pb.push(`bras ${cote} retourné (rotation de plus de 150°) ${Math.round(extreme[c] / N * 100)} % du temps`);
  }
  if (BOUCLE.test(nom) && premiere && derniere) {
    let ecart = 0;
    for (const [i, q] of premiere) { const q2 = derniere.get(i); if (q2) ecart = Math.max(ecart, q.angleTo(q2) * 180 / Math.PI); }
    if (ecart > 35) pb.push(`saute quand elle reboucle (écart de ${Math.round(ecart)}° entre la fin et le début)`);
  }
  if (hips0 && hipsN) { const d = Math.hypot(hipsN.x - hips0.x, hipsN.z - hips0.z); if (d > .15 * H) pb.push(`le personnage se déplace de ${cm(d)} cm (pas « sur place »)`); }
  return { nom, duree: smp.duree, pb };
}

// ---------- tous les personnages
function fichiers(d) { const out = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) out.push(...fichiers(p)); else if (e.name.endsWith('.glb')) out.push(p); } return out; }
const lignes = [`ANALYSE DES ANIMATIONS — ${new Date().toLocaleString('fr-FR')}`, `(automatique : rien n'a été modifié)`, ''];
let total = 0, abimees = 0;
for (const f of fichiers(DOSSIER).sort()) {
  const g = lireGlb(f); if (!g || !g.js.skins?.length || !g.js.animations?.length) continue;
  const sq = preparer(g), os = trouverOs(sq);
  if (os.hips === undefined) { lignes.push(`=== ${f} : squelette non reconnu (pas d'os « Hips »)`, ''); continue; }
  // référence : la pose de repos (sol = point le plus bas des pieds, taille = tête - sol)
  let M = poseMonde(sq, new Map());
  let sol = Math.min(...['piedG', 'piedD', 'orteilG', 'orteilD'].map(k => pos(M, os[k])?.y ?? Infinity));
  let H = (pos(M, os.head)?.y ?? 1.6) - sol;
  const idle = g.js.animations.find(a => /idle/i.test(a.name ?? ''));
  if (idle && !(H > 0)) { M = poseMonde(sq, echantillonneur(g, idle).local(0)); sol = Math.min(...['piedG', 'piedD'].map(k => pos(M, os[k]).y)); H = pos(M, os.head).y - sol; }
  const noms = g.js.animations.map(a => a.name ?? '');
  lignes.push(`=== ${path.basename(f)} — ${noms.length} animations (taille mesurée ${H.toFixed(2)} unités)`);
  for (const a of g.js.animations) {
    const r = analyser(g, sq, os, a, { sol, H }); total++;
    if (r.pb.length) abimees++;
    lignes.push(`${r.pb.length ? '✗' : '✓'} ${r.nom} (${r.duree.toFixed(1)} s)${r.pb.length ? ' — ' + r.pb.join(' ; ') : ''}`);
  }
  const manque = ATTENDUES.filter(n => !noms.some(x => x === n || x.startsWith(n + '_')));
  if (manque.length) lignes.push(`  Manquent : ${manque.join(', ')}`);
  lignes.push('');
}
lignes.push(`BILAN : ${abimees} animation(s) à corriger sur ${total}.`);
const texte = lignes.join('\n');
fs.writeFileSync('rapport-animations.txt', texte, 'utf8');
console.log(texte);
console.log('\n(rapport enregistré dans rapport-animations.txt)');
