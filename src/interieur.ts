import * as THREE from 'three';

type Finition = 'chaux' | 'bois' | 'lin' | 'pierre';
const textures = new Map<Finition, THREE.CanvasTexture>();

/** Quatre petites textures partagées ; aucun fichier ni image personnelle remplacé. */
function texture(finition: Finition) {
  let t = textures.get(finition); if (t) return t;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f1f0eb'; ctx.fillRect(0, 0, 128, 128);
  let seed = 731;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  if (finition === 'bois') {
    for (let x = 0; x < 128; x++) {
      ctx.strokeStyle = `rgba(55,40,25,${.025 + rand() * .10})`; ctx.beginPath();
      for (let y = 0; y <= 128; y += 4) {
        const u = x + Math.sin(y * .065 + x * .18) * 1.3;
        if (!y) ctx.moveTo(u, y); else ctx.lineTo(u, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(55,40,25,.13)'; ctx.fillRect(0, 0, 1, 128); ctx.fillRect(64, 0, 1, 128);
  } else if (finition === 'lin') {
    for (let i = 0; i < 128; i += 2) {
      ctx.fillStyle = i % 4 ? 'rgba(80,70,60,.08)' : 'rgba(255,255,255,.35)';
      ctx.fillRect(i, 0, 1, 128); ctx.fillRect(0, i, 128, 1);
    }
  } else {
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(90,80,70,${rand() * (finition === 'pierre' ? .09 : .035)})`;
      ctx.fillRect(Math.floor(rand() * 128), Math.floor(rand() * 128), 1, 1);
    }
  }
  t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); t.anisotropy = 2;
  textures.set(finition, t); return t;
}

export function styliserInterieur(root: THREE.Object3D, perso: string) {
  if (perso !== 'lea' && perso !== 'marcel') return;
  const lea = perso === 'lea';
  const palette = { mur: lea ? '#e9e3d7' : '#e6ded0', bois: lea ? '#ad8561' : '#8c684b', tissu: lea ? '#83988a' : '#69766a', meuble: lea ? '#b8c3b1' : '#53655b', pierre: '#dfddd5', tapis: lea ? '#c9baa3' : '#b7aa94', bord: lea ? '#a6b1a1' : '#8b978a' };
  const copies = new Map<string, THREE.MeshStandardMaterial>();
  root.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const next = mats.map(mat => {
      const source = mat as THREE.MeshStandardMaterial;
      // Les images du propriétaire (tableaux, photos, couverture…) n'ont pas __jeu.
      if (!source.isMeshStandardMaterial || !source.name.endsWith('__jeu')) return mat;
      const label = (m.name + ' ' + mat.name).toLowerCase();
      let finition: Finition | null = null, couleur = '', rugosite = .85;
      if (/a[12]_back|a[12]_inside/.test(label)) { finition = 'chaux'; couleur = palette.mur; }
      else if (/a[12]_floor|bed_frame|kitchen_base/.test(label)) { finition = 'bois'; couleur = palette.bois; }
      else if (/kitchen_door/.test(label)) { finition = 'chaux'; couleur = palette.meuble; rugosite = .58; }
      else if (/kitchen_counter/.test(label)) { finition = 'pierre'; couleur = palette.pierre; rugosite = .48; }
      else if (/armchair|sofa/.test(label)) { finition = 'lin'; couleur = palette.tissu; }
      else if (/rug/.test(label)) { finition = 'lin'; couleur = /center/.test(label) ? palette.tapis : palette.bord; }
      else if (/bed_mattress|bed_pillow/.test(label)) { finition = 'lin'; couleur = '#eee8dc'; }
      if (!finition) return mat;
      const key = `${source.uuid}:${finition}:${couleur}`;
      let c = copies.get(key);
      if (!c) {
        c = source.clone(); c.color.set(couleur); c.map = texture(finition);
        c.roughness = rugosite; c.metalness = 0; c.roughnessMap = null; c.metalnessMap = null;
        c.emissive.set(0); c.emissiveMap = null;
        c.bumpMap = c.map; c.bumpScale = finition === 'lin' ? .003 : finition === 'bois' ? .002 : .0008;
        c.needsUpdate = true; copies.set(key, c);
      }
      return c;
    });
    m.material = Array.isArray(m.material) ? next : next[0];
  });
}
