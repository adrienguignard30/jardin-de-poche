// =============================================================================================
//  LA BIBLIOTHÈQUE D'ANIMATIONS — un squelette (Mixamo X Bot), toutes les animations, aucun corps.
//  Les corps (char_*_v2.glb) n'ont pas d'animation : ils reçoivent celles-ci. Même squelette, mêmes noms d'os,
//  proportions propres : Character convertit les rotations et la translation du bassin au repos du corps.
// =============================================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const BIBLIO = {
  clips: [] as THREE.AnimationClip[],
  extra: [] as THREE.AnimationClip[],
  prete: false,
  hanches: 0,                      // hauteur du bassin de X Bot au repos (m)
  /** La pose de repos de X Bot : pour chaque os, rotation monde, translation locale, parent (sert au retarget). */
  repos: new Map<string, { qW: THREE.Quaternion; p: THREE.Vector3; parent: string }>(),
  accessoires: new Map<string, THREE.Object3D>(),
  /** Charge le cœur (obligatoire avant les personnages). */
  async charger(url: string) {
    try {
      const g = await new GLTFLoader().loadAsync(url);
      this.hanches = 0; this.repos.clear();
      this.clips = g.animations; this.prete = true;
      g.scene.updateMatrixWorld(true);
      g.scene.traverse(o => {
        if (!this.hanches && /Hips$/.test(o.name)) this.hanches = o.getWorldPosition(new THREE.Vector3()).y;
        this.repos.set(o.name, { qW: o.getWorldQuaternion(new THREE.Quaternion()), p: o.position.clone(), parent: o.parent?.name ?? '' });
      });
      console.info(`[bibliothèque] ${this.clips.length} animations, bassin X Bot à ${this.hanches.toFixed(3)} m : ${this.clips.map(c => c.name).join(', ')}`);
    } catch (e) { console.warn('[bibliothèque] introuvable, chaque corps jouera ses propres animations', e); }
  },
  /** Un accessoire (models/accessoires/<nom>.glb), chargé une fois ; chaque appel renvoie une copie. */
  async accessoire(nom: string): Promise<THREE.Object3D | null> {
    try {
      if (!this.accessoires.has(nom)) { const g = await new GLTFLoader().loadAsync(`models/accessoires/${nom}.glb`); this.accessoires.set(nom, g.scene); }
      const o = this.accessoires.get(nom)!.clone(true); o.traverse(m => { const mm = m as THREE.Mesh; if (mm.isMesh) { mm.castShadow = true; mm.receiveShadow = true; } }); return o;
    } catch (e) { console.warn(`[accessoire] ${nom} introuvable`, e); return null; }
  },
  /** Les extras (émotions, danses en plus…), à la demande, sans bloquer le jeu. */
  async chargerExtra(url: string) {
    try { const g = await new GLTFLoader().loadAsync(url); this.extra = g.animations; console.info(`[bibliothèque] ${this.extra.length} animations en plus`); } catch { /* pas d'extra */ }
  },
};
