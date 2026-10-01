import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const COLLECTIONS = ['pots', 'plants', 'seeds', 'crops', 'furniture', 'decor'];

export interface CharacterAsset { scene: THREE.Object3D; clips: THREE.AnimationClip[] }

export class Assets {
  private lib = new Map<string, THREE.Object3D>();       // nom d'objet → prototype (jamais ajouté à la scène)
  private chars = new Map<string, CharacterAsset>();
  private textures = new Map<string, THREE.Texture>();
  private loader: GLTFLoader;
  private texLoader = new THREE.TextureLoader();
  onProgress: (done: number, total: number, label: string) => void = () => {};

  constructor() {
    this.loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.loader.setDRACOLoader(draco);
  }

  async loadCollections() {
    let done = 0;
    for (const c of COLLECTIONS) {
      this.onProgress(done, COLLECTIONS.length, c);
      try {
        const gltf = await this.loader.loadAsync(`models/${c}.glb`);
        for (const child of [...gltf.scene.children]) {
          child.position.set(0, 0, 0);
          this.prepare(child);
          this.lib.set(child.name, child);
        }
      } catch (e) {
        console.warn(`models/${c}.glb introuvable ou illisible`, e);
      }
      done++;
    }
    this.onProgress(done, COLLECTIONS.length, '');
  }

  /** Matériaux : ombrage plat, double face pour les feuilles, ombres. */
  private prepare(root: THREE.Object3D) {
    root.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          const s = mat as THREE.MeshStandardMaterial;
          if (s.isMeshStandardMaterial) {
            s.flatShading = true;
            if (/leaf|mint|lettuce|petal|wicker|terracotta|paint_blue|metal/.test(s.name)) s.side = THREE.DoubleSide;
            s.needsUpdate = true;
          }
        }
      }
    });
  }

  /** Les décors assemblés (environments.glb, interiors.glb, env_decor.glb) : optionnels, chargés s'ils existent. */
  async loadOptional(files: string[]) {
    for (const f of files) {
      try {
        const gltf = await this.loader.loadAsync(`models/${f}.glb`);
        for (const child of [...gltf.scene.children]) {
          this.prepare(child);
          child.traverse(o => {
            const m = o as THREE.Mesh; if (!m.isMesh) return;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            for (const mat of mats) {
              const st = mat as THREE.MeshPhysicalMaterial;
              if (!st.isMeshStandardMaterial) continue;
              if (st.transmission && st.transmission > 0) { st.transparent = false; st.depthWrite = true; continue; }   // vrai verre (transmission glTF) : rendu physique
              if (st.transparent && st.opacity < 1) { st.depthWrite = false; continue; }                            // alpha réglé dans Blender : respecté
              if (/glass|vitre|window/i.test(st.name)) { st.transparent = true; st.opacity = .22; st.depthWrite = false; }
            }
          });
          if (!this.lib.has(child.name)) this.lib.set(child.name, child);
        }
        console.info(`models/${f}.glb :`, gltf.scene.children.map(c => c.name).join(', '));
      } catch { /* fichier absent : on reste sur le décor fait par le code */ }
    }
  }
  has(name: string) { return this.lib.has(name); }
  /** Ajoute un objet fabriqué dans le code (assiette de secours…). */
  register(name: string, obj: THREE.Object3D) { obj.name = name; this.lib.set(name, obj); }

  /** Une copie prête à poser dans la scène (géométries et matériaux partagés). */
  get(name: string): THREE.Object3D {
    const proto = this.lib.get(name);
    if (!proto) {
      console.warn('objet manquant :', name);
      const ph = new THREE.Mesh(new THREE.BoxGeometry(.3, .3, .3), new THREE.MeshStandardMaterial({ color: 0xff00ff, wireframe: true }));
      ph.name = name;
      return ph;
    }
    return proto.clone(true);
  }

  /** Empty exporté depuis Blender : retrouvé par sa propriété socket, jamais par son nom. */
  static socket(root: THREE.Object3D, tag: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    root.traverse(o => { if (!found && o.userData && o.userData.socket === tag) found = o; });
    return found;
  }
  static sockets(root: THREE.Object3D, tag: string): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    root.traverse(o => { if (o.userData && o.userData.socket === tag) out.push(o); });
    return out;
  }

  async loadCharacter(id: string, file: string): Promise<CharacterAsset> {
    const cached = this.chars.get(id);
    if (cached) return cached;
    const gltf: GLTF = await this.loader.loadAsync(file);
    gltf.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false; }
    });
    const asset = { scene: gltf.scene, clips: gltf.animations };
    this.chars.set(id, asset);
    return asset;
  }

  /** Instance animable d'un personnage (SkeletonUtils.clone garde le squelette cohérent). */
  instantiate(asset: CharacterAsset): THREE.Object3D {
    return skeletonClone(asset.scene);
  }

  async texture(url: string): Promise<THREE.Texture> {
    const cached = this.textures.get(url);
    if (cached) return cached;
    const tex = await this.texLoader.loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.textures.set(url, tex);
    return tex;
  }
}
