// Vérifie un corps de personnage (.glb) pour Potager de Poche :   node analyser-corps.mjs chemin\du\fichier.glb
// Triangles, textures, matériaux, squelette (os Mixamo), animations présentes, taille, orientation. Ne modifie rien.
import fs from 'node:fs';
import path from 'node:path';

const f = process.argv[2];
if (!f || !fs.existsSync(f)) { console.log('Usage : node analyser-corps.mjs fichier.glb'); process.exit(1); }
const b = fs.readFileSync(f);
if (b.readUInt32LE(0) !== 0x46546c67) { console.log('Ce fichier n\'est pas un GLB.'); process.exit(1); }
const n = b.readUInt32LE(12), js = JSON.parse(b.toString('utf8', 20, 20 + n));
const off = 20 + n, bin = off + 8 <= b.length ? b.subarray(off + 8, off + 8 + b.readUInt32LE(off)) : Buffer.alloc(0);

const taille = buf => {
  if (buf[0] === 0x89 && buf[1] === 0x50) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf[0] === 0xff && buf[1] === 0xd8) { let i = 2; while (i < buf.length) { if (buf[i] !== 0xff) { i++; continue; } const m = buf[i + 1], len = buf.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]; i += 2 + len; } }
  if (buf.toString('ascii', 0, 4) === 'RIFF') { const t = buf.toString('ascii', 12, 16); if (t === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)]; if (t === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff]; if (t === 'VP8L') { const v = buf.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; } }
  return [0, 0];
};
const lire = (acc) => { const a = js.accessors[acc], bv = js.bufferViews[a.bufferView], k = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type] ?? 1, base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), sz = { 5126: 4, 5123: 2, 5125: 4, 5121: 1, 5122: 2, 5120: 1 }[a.componentType], pas = bv.byteStride ?? sz * k, out = []; for (let e = 0; e < a.count; e++) { const v = []; for (let c = 0; c < k; c++) { const o = base + e * pas + c * sz; v.push(a.componentType === 5126 ? bin.readFloatLE(o) : a.componentType === 5123 ? bin.readUInt16LE(o) : a.componentType === 5125 ? bin.readUInt32LE(o) : a.componentType === 5121 ? bin.readUInt8(o) : a.componentType === 5122 ? bin.readInt16LE(o) : bin.readInt8(o)); } out.push(v); } return out; };

const L = [], ok = [], ko = [];
L.push(`CORPS : ${path.basename(f)} — ${(b.length / 1048576).toFixed(1)} Mo`);
(b.length / 1048576 <= 8 ? ok : ko).push(`fichier ${(b.length / 1048576).toFixed(1)} Mo (limite 8 Mo)`);

// triangles, boîte englobante
let tri = 0, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const m of js.meshes ?? []) for (const p of m.primitives ?? []) {
  if (p.indices !== undefined) tri += js.accessors[p.indices].count / 3; else tri += js.accessors[p.attributes.POSITION].count / 3;
  const a = js.accessors[p.attributes.POSITION]; if (a.min && a.max) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], a.min[k]); max[k] = Math.max(max[k], a.max[k]); }
}
tri = Math.round(tri);
L.push(`Triangles : ${tri.toLocaleString('fr-FR')} — ${js.meshes?.length ?? 0} maillage(s), ${(js.meshes ?? []).reduce((s, m) => s + (m.primitives?.length ?? 0), 0)} partie(s)`);
(tri <= 20000 ? ok : ko).push(`${tri.toLocaleString('fr-FR')} triangles (limite 20 000)`);

// échelle : la boîte en coordonnées du maillage, et le facteur d'échelle du nœud racine s'il y en a un
const scaleNoeud = (js.nodes ?? []).find(nd => nd.scale && nd.scale.some(s => s !== 1))?.scale;
const h = (max[1] - min[1]) * (scaleNoeud?.[1] ?? 1), prof = (max[2] - min[2]) * (scaleNoeud?.[2] ?? 1), larg = (max[0] - min[0]) * (scaleNoeud?.[0] ?? 1);
L.push(`Dimensions (unités du fichier × échelle du nœud) : hauteur ${h.toFixed(2)}, largeur ${larg.toFixed(2)}, profondeur ${prof.toFixed(2)}${scaleNoeud ? ` (échelle de nœud ${scaleNoeud.map(s => s.toFixed(3)).join(', ')})` : ''}`);
if (h > 1.3 && h < 2.1) ok.push(`hauteur ${h.toFixed(2)} m, plausible`); else ko.push(`hauteur ${h.toFixed(2)} : à ramener vers 1,65 m dans Blender (l'unité n'est sans doute pas le mètre)`);
if (Math.abs(min[1] * (scaleNoeud?.[1] ?? 1)) < .05) ok.push('pieds au niveau zéro'); else ko.push(`le bas du modèle est à ${(min[1] * (scaleNoeud?.[1] ?? 1)).toFixed(2)} : à poser à zéro`);
if (larg > prof) ok.push('plus large que profond : il fait face à la caméra (bras écartés)'); else ko.push('plus profond que large : vérifier l\'orientation (doit regarder vers +Z, bras écartés en X)');

// textures
const imgs = (js.images ?? []).map((im, i) => { if (im.bufferView === undefined) return `${i}: externe (${im.uri ?? '?'})`; const bv = js.bufferViews[im.bufferView]; const [w, hh] = taille(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)); return `${w}×${hh} ${im.mimeType ?? ''} (${(bv.byteLength / 1048576).toFixed(1)} Mo)`; });
L.push(`Textures : ${imgs.length ? imgs.join(' | ') : 'aucune'}`);
if (!imgs.length) ko.push('aucune texture intégrée');

// matériaux
const mats = (js.materials ?? []).map(m => m.name ?? '(sans nom)');
L.push(`Matériaux (${mats.length}) : ${mats.join(', ') || 'aucun'}`);
const zones = ['peau', 'cheveux', 'haut', 'bas', 'chaussures'];
const trouvees = zones.filter(z => mats.some(m => new RegExp(`^mat_[a-z0-9]+_${z}$`).test(m)));
if (trouvees.length === 5) ok.push('les 5 zones de couleur sont nommées'); else ko.push(`zones de couleur : ${trouvees.length}/5 (il faut mat_<perso>_peau, _cheveux, _haut, _bas, _chaussures) — à faire dans Blender`);

// squelette
const skins = js.skins ?? [];
if (!skins.length) { L.push('Squelette : AUCUN (modèle non riggé)'); ko.push('pas de squelette : à rigger (Tripo, format Mixamo)'); }
else {
  const joints = skins[0].joints.map(j => js.nodes[j].name ?? '?');
  const mix = joints.filter(j => /mixamorig/i.test(j)).length;
  const essentiels = ['Hips', 'Spine', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
  const manque = essentiels.filter(e => !joints.some(j => j.replace(/^.*mixamorig[:_]?/i, '') === e));
  L.push(`Squelette : ${joints.length} os, dont ${mix} nommés « mixamorig » — ex. ${joints.slice(0, 4).join(', ')}`);
  if (mix >= 15 && !manque.length) ok.push('squelette Mixamo complet'); else ko.push(`squelette : ${mix} os Mixamo, manquent ${manque.join(', ') || 'aucun'} — il faut le squelette Mixamo complet`);
}
// animations
const anims = (js.animations ?? []).map(a => a.name ?? '?');
L.push(`Animations dans le fichier : ${anims.length ? anims.join(', ') : 'aucune (c\'est ce qu\'on veut : la bibliothèque les apporte)'}`);
if (anims.length) ko.push(`${anims.length} animation(s) dans le corps : à retirer (le corps doit en être vide)`);

L.push('', 'OK :', ...ok.map(x => '  ✓ ' + x), '', 'À CORRIGER :', ...(ko.length ? ko.map(x => '  ✗ ' + x) : ['  (rien)']));
console.log(L.join('\n'));
