import * as THREE from 'three';
import { Ciel } from './ciel';
import { Assets } from './assets';
import { SkyLife } from './sky';
import { styliserInterieur } from './interieur';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ViewDef } from './state';

/** Fichier layout_<perso>.json écrit par jdp_assemblage.py (repère Blender). */
export interface Layout {
  character: string;
  groups: Record<string, { loc: number[]; rz?: number }>;
  slots: { id: number; loc: number[] }[];
  spots: Record<string, { loc: number[]; rz?: number }>;
  doors?: { left?: { open_deg: number }; right?: { open_deg: number } };
  camera?: { pitch: number; dist: number; look_z: number; fov?: number; loc?: number[]; x?: number };
  apartment_top?: number;
  parts?: Record<string, Record<string, { dloc: number[]; drz?: number }>>;
}

export const FL = 1.37;                 // hauteur du sol du balcon (socle 1,25 + dalle 0,12)
const USE_NEAR_LAYER = false;           // les calques « toits » actuels ne sont pas détourés : on attend les bons
// ---- réglages du décor (modifiables ici, ou en direct avec ?tune=1)
export const TUNE = {
  width: 1.25,          // largeur du balcon (× 3,8 m)
  depth: 1.7,           // profondeur (× 1,5 m)
  railScale: 0.78,      // hauteur de la barrière (1 = 0,95 m)
  camPitch: 0.17,       // inclinaison de la caméra (rad) : presque à l'horizontale, comme depuis le balcon d'en face
  camDist: 7.2,         // distance (ordinateur) ; téléphone = × 1.3
  lookY: FL + 1.45,     // hauteur du point visé
  sitForward: 0.0,      // réglage fin ; l'assise est calée automatiquement sur le bassin
  sitDown: 0.0,
};
const DEPTH = TUNE.depth;
export const POT_SCALE = 0.38;                        // pots de 29 cm : le poignet arrive à la terre, les doigts y entrent
export const ROOF_Y = FL + 3.26;        // gouttière du toit
const ROOF_SLOPE = 0.55;
const W = TUNE.width;

/** Emplacements : 0..7 balcon (5 devant, 3 derrière), 8..13 toit (3 bacs × 2). */
export interface Slot { id: number; pos: THREE.Vector3; stand: THREE.Vector3; face: number; roof: boolean; planter?: number }
export const SLOTS: Slot[] = [];
export const FACADE_FRONT = -0.6 * DEPTH + 0.15;   // face avant du mur
export const LAYOUT = { corridorZ: 0.0, halfW: 1.9 * TUNE.width, backZ: -0.6 * TUNE.depth + 0.35, frontZ: 0.72 * TUNE.depth - 0.3 };   // zone de marche, ajustée au décor chargé

/** Tout ce qu'on ne traverse pas sur le balcon : pots, chaise, panier (cercles au sol, rayon = objet + demi-corps). */
export function obstacles(ignore?: string): { x: number; z: number; r: number; id: string }[] {
  const out: { x: number; z: number; r: number; id: string }[] = [];
  const potR = POT_SCALE * 1.06 / 2 + .17;
  SLOTS.forEach((s, i) => { if (!s.roof && `pot${i}` !== ignore) out.push({ x: s.pos.x, z: s.pos.z, r: potR, id: `pot${i}` }); });
  if (ignore !== 'chair') out.push({ x: CHAIR_SPOT.pos.x, z: CHAIR_SPOT.pos.z, r: .42, id: 'chair' });
  if (ignore !== 'basket') out.push({ x: BASKET_SPOT.x, z: BASKET_SPOT.z, r: .38, id: 'basket' });
  return out;
}
/** Le point libre le plus proche : sur le balcon (ni barrière ni mur) et hors des obstacles. */
export function freePoint(p: THREE.Vector3, ignore?: string): THREE.Vector3 {
  const q = p.clone();
  for (let it = 0; it < 6; it++) {
    q.x = THREE.MathUtils.clamp(q.x, -LAYOUT.halfW + .2, LAYOUT.halfW - .2);
    q.z = THREE.MathUtils.clamp(q.z, LAYOUT.backZ, LAYOUT.frontZ);
    let moved = false;
    for (const o of obstacles(ignore)) {
      const dx = q.x - o.x, dz = q.z - o.z, d = Math.hypot(dx, dz);
      if (d < o.r - .005) {
        const k = d < 1e-4 ? 1 : (o.r + .02) / d;
        if (d < 1e-4) { q.z = o.z + (LAYOUT.corridorZ >= o.z ? o.r + .02 : -(o.r + .02)); } else { q.x = o.x + dx * k; q.z = o.z + dz * k; }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return q;
}
/** Vrai si le segment a→b traverse un obstacle. */
export function segmentBlocked(a: THREE.Vector3, b: THREE.Vector3, ignore?: string): boolean {
  const abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz;
  for (const o of obstacles(ignore)) {
    const t = L2 < 1e-6 ? 0 : THREE.MathUtils.clamp(((o.x - a.x) * abx + (o.z - a.z) * abz) / L2, 0, 1);
    const cx = a.x + abx * t, cz = a.z + abz * t;
    if (Math.hypot(o.x - cx, o.z - cz) < o.r - .04) return true;
  }
  return false;
}
/** Échec attendu de navigation, distinct d'une erreur de programmation. */
export class TrajetImpossible extends Error {}
/** Sortie courte d'une marge d'obstacle : on s'en éloigne sans en traverser un autre.
 * Le point retourné doit être rejoint à pied, jamais par teleport(). */
export function degagementBalcon(a: THREE.Vector3, ignore?: string): THREE.Vector3 | null {
  const obs = obstacles(ignore), contient = obs.filter(o => Math.hypot(a.x - o.x, a.z - o.z) < o.r - .04);
  const bornes = (p: THREE.Vector3) => p.x >= -LAYOUT.halfW + .2 && p.x <= LAYOUT.halfW - .2 && p.z >= LAYOUT.backZ && p.z <= LAYOUT.frontZ;
  if (!contient.length && bornes(a)) return null;
  for (let d = .06; d <= .60; d += .02) for (let i = 0; i < 64; i++) {
    const angle = i * Math.PI / 32, p = a.clone().add(new THREE.Vector3(Math.cos(angle) * d, 0, Math.sin(angle) * d));
    if (!bornes(p) || obs.some(o => Math.hypot(p.x - o.x, p.z - o.z) < o.r - .005)) continue;
    const dx = p.x - a.x, dz = p.z - a.z;
    if (contient.some(o => (a.x - o.x) * dx + (a.z - o.z) * dz < -1e-8)) continue;
    const traverse = obs.filter(o => !contient.includes(o)).some(o => {
      const t = THREE.MathUtils.clamp(((o.x - a.x) * dx + (o.z - a.z) * dz) / (d * d), 0, 1);
      return Math.hypot(a.x + dx * t - o.x, a.z + dz * t - o.z) < o.r - .04;
    });
    if (traverse) continue;
    return p;
  }
  throw new TrajetImpossible('Aucun dégagement court sur le balcon');
}
/** Graphe de visibilité autour des obstacles : chaque segment est contrôlé,
 * y compris la jonction avec le couloir qui était auparavant supposée libre. */
export function cheminBalcon(a: THREE.Vector3, cible: THREE.Vector3, ignore?: string): THREE.Vector3[] {
  if (![a.x, a.z, cible.x, cible.z].every(Number.isFinite)) throw new TrajetImpossible('Position de marche invalide');
  const sortie = degagementBalcon(a, ignore);
  if (sortie) return [sortie, ...cheminBalcon(sortie, cible, ignore)];
  const b = freePoint(cible, ignore);
  if (obstacles(ignore).some(o => Math.hypot(b.x - o.x, b.z - o.z) < o.r - .04)) throw new TrajetImpossible('Arrivée occupée sur le balcon');
  if (!segmentBlocked(a, b, ignore)) return [b];
  const points = [a.clone(), b];
  for (const o of obstacles(ignore)) for (let i = 0; i < 16; i++) {
    const t = i * Math.PI / 8, p = new THREE.Vector3(o.x + Math.cos(t) * (o.r + .055), a.y, o.z + Math.sin(t) * (o.r + .055));
    if (freePoint(p, ignore).distanceTo(p) < .005) points.push(p);
  }
  const d = points.map(() => Infinity), avant = points.map(() => -1), visite = new Set<number>(); d[0] = 0;
  for (;;) {
    let u = -1; for (let i = 0; i < points.length; i++) if (!visite.has(i) && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0 || !Number.isFinite(d[u])) throw new TrajetImpossible('Aucun trajet libre sur le balcon');
    if (u === 1) break; visite.add(u);
    for (let v = 1; v < points.length; v++) {
      if (visite.has(v) || segmentBlocked(points[u], points[v], ignore)) continue;
      const nd = d[u] + points[u].distanceTo(points[v]); if (nd < d[v]) { d[v] = nd; avant[v] = u; }
    }
  }
  const chemin: THREE.Vector3[] = []; for (let v = 1; v !== 0; v = avant[v]) chemin.unshift(points[v]); return chemin;
}
const BACK_Z = FACADE_FRONT + 0.34, FRONT_Z = 0.56;
export const CORRIDOR_Z = 0.0;
[-0.9, 0, 0.9].forEach((x, i) => SLOTS.push({ id: i, pos: new THREE.Vector3(x * W, FL, BACK_Z), stand: new THREE.Vector3(x * W, FL, CORRIDOR_Z), face: Math.PI, roof: false }));
[-1.36, -0.68, 0, 0.68, 1.36].forEach((x, i) => SLOTS.push({ id: 3 + i, pos: new THREE.Vector3(x * W, FL, FRONT_Z), stand: new THREE.Vector3(x * W, FL, CORRIDOR_Z), face: 0, roof: false }));
[-1.2, 0, 1.2].forEach((x, i) => {
  const y = ROOF_Y + .32, z = -.6 * DEPTH - 1.35;
  SLOTS.push({ id: 8 + i * 2, pos: new THREE.Vector3(x - .25, y, z), stand: new THREE.Vector3(x, y, z + .55), face: Math.PI, roof: true, planter: i });
  SLOTS.push({ id: 9 + i * 2, pos: new THREE.Vector3(x + .25, y, z), stand: new THREE.Vector3(x, y, z + .55), face: Math.PI, roof: true, planter: i });
});
export const CHAIR_SPOT = { pos: new THREE.Vector3(1.6 * W + .12, FL, -.32), face: -1.6 };
export const BASKET_SPOT = new THREE.Vector3(-1.55 * W - .15, FL, -.25);
export const LADDER_SPOT = new THREE.Vector3(-1.4 * W, FL, CORRIDOR_Z);
export const ROOF_STAND = new THREE.Vector3(0, ROOF_Y + .32, -.6 * DEPTH - .8);
export const START_SPOT = new THREE.Vector3(0.3, FL, CORRIDOR_Z);

/** Vrai si le haut de l'image est transparent (calque de toits correctement détouré). */
function hasTransparentTop(tex: THREE.Texture): boolean {
  try {
    const img = tex.image as HTMLImageElement; const w = 64, h = 64;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d')!; c.drawImage(img, 0, 0, w, h);
    const d = c.getImageData(0, 0, w, Math.round(h * .2)).data;
    let opaque = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) opaque++;
    return opaque / (d.length / 4) < .5;
  } catch { return true; }
}

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  clock = new THREE.Clock();
  root = new THREE.Group();            // le balcon
  potGroup = new THREE.Group();        // les pots (pour le raycast)
  decoGroup = new THREE.Group();
  roofGroup = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private lampLight: THREE.PointLight;
  private wallLight!: THREE.PointLight;
  private sconce: THREE.Mesh | null = null;
  private skyMat: THREE.ShaderMaterial;
  private layers: { farDay: THREE.Mesh; farNight: THREE.Mesh; nearDay: THREE.Mesh; nearNight: THREE.Mesh } | null = null;
  night = 0;                            // 0 jour, 1 nuit (lissé)
  targetNight = 0;
  yaw = 0; private yawTarget = 0;
  zoom = 1; private zoomTarget = 1;
  private lookAt = new THREE.Vector3(0, TUNE.lookY, 0);
  private dist = TUNE.camDist;
  private pitch = TUNE.camPitch;
  isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  sky: SkyLife | null = null;
  hatch: { closed: THREE.Object3D | null; open: THREE.Object3D | null } = { closed: null, open: null };
  ladder: THREE.Object3D | null = null;
  basket: THREE.Object3D | null = null;
  chair: THREE.Object3D | null = null;
  facade: THREE.Object3D | null = null;
  body: THREE.Object3D | null = null;
  floorObj: THREE.Object3D | null = null;
  railGroup: THREE.Object3D | null = null;
  baseObj: THREE.Object3D | null = null;
  terrace = new THREE.Group();
  planters: THREE.Object3D[] = [];
  chairFitted = false;
  /** Adapte la chaise à l'animation assise mesurée : si le personnage s'assoit plus haut (tabouret de bar),
   *  la chaise est allongée en hauteur pour que l'assise tombe pile sous ses cuisses. */
  fitChair(cfg: { cuisses_z: number; chaise_ok?: boolean } | null) {
    this.chairFitted = false;
    if (!this.chair) return;
    this.chair.scale.set(1, 1, 1); this.chair.updateMatrixWorld(true);
    if (!cfg || cfg.chaise_ok !== false) return;
    const voulu = cfg.cuisses_z - .08;                     // hauteur d'assise attendue par l'animation
    const base = this.seatPoint().y - FL;                  // hauteur d'assise de la chaise d'origine
    if (base > .2 && voulu > .55 && voulu < 1.0) {
      this.chair.scale.set(1, voulu / base, 1); this.chair.updateMatrixWorld(true);
      this.chairFitted = true;
    }
  }
  /** Des petits cœurs qui montent : l'amour qu'on met dans le plat. */
  hearts(at: THREE.Vector3, ms: number) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d')!; cx.font = '52px serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('❤️', 32, 36);
    const tex = new THREE.CanvasTexture(cv);
    const g = new THREE.Group(); this.scene.add(g);
    const t0 = performance.now(); const items: { s: THREE.Sprite; t: number; dx: number }[] = [];
    const step = () => {
      const now = performance.now();
      if (now - t0 < ms && (!items.length || now - items[items.length - 1].t > 180)) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        sp.scale.setScalar(.14); sp.position.copy(at); g.add(sp); items.push({ s: sp, t: now, dx: (Math.random() - .5) * .5 });
      }
      for (const it of items) { const k = (now - it.t) / 1600; it.s.position.set(at.x + it.dx * k, at.y + k * .9, at.z + Math.sin(k * 6) * .05); (it.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k); it.s.scale.setScalar(.14 + k * .08); }
      if (now - t0 < ms + 1700) requestAnimationFrame(step); else { this.scene.remove(g); tex.dispose(); }
    };
    requestAnimationFrame(step);
  }
  /** Une goutte d'eau qui part du bec de l'arrosoir et tombe en arc sur le pot. */
  private texGoutte: THREE.Texture | null = null;
  private nbGouttes = 0;
  gouttes(de: THREE.Vector3, vers: THREE.Vector3) {
    if (this.nbGouttes > 40) return;
    if (!this.texGoutte) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d')!;
      const g = c.createRadialGradient(13, 12, 1, 16, 16, 14); g.addColorStop(0, '#ffffff'); g.addColorStop(.35, '#bfe6ff'); g.addColorStop(1, 'rgba(90,170,230,0)');
      c.fillStyle = g; c.beginPath(); c.arc(16, 16, 14, 0, Math.PI * 2); c.fill();
      this.texGoutte = new THREE.CanvasTexture(cv);
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texGoutte, transparent: true, depthWrite: false }));
    sp.scale.setScalar(.03 + Math.random() * .015); this.scene.add(sp); this.nbGouttes++;
    const fin = vers.clone().add(new THREE.Vector3((Math.random() - .5) * .08, 0, (Math.random() - .5) * .08));
    const t0 = performance.now(), dur = 380 + Math.random() * 160;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      sp.position.lerpVectors(de, fin, k); sp.position.y += Math.sin(k * Math.PI) * .05 - k * k * .02;
      if (k < 1) requestAnimationFrame(step); else { this.scene.remove(sp); (sp.material as THREE.SpriteMaterial).dispose(); this.nbGouttes--; }
    };
    requestAnimationFrame(step);
  }
  /** Des cœurs dessinés (roses et rouges) qui s'envolent comme la vapeur, depuis un point qui bouge (la main). */
  private coeurPas = 110;
  coeurs(depuis: () => THREE.Vector3, ms: number, pas = 110) {
    this.coeurPas = pas;
    const tex = (col1: string, col2: string) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d')!;
      const g = c.createLinearGradient(0, 8, 0, 60); g.addColorStop(0, col1); g.addColorStop(1, col2); c.fillStyle = g;
      c.beginPath(); c.moveTo(32, 56); c.bezierCurveTo(4, 38, 4, 12, 20, 10); c.bezierCurveTo(28, 9, 32, 16, 32, 20);
      c.bezierCurveTo(32, 16, 36, 9, 44, 10); c.bezierCurveTo(60, 12, 60, 38, 32, 56); c.fill();
      c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(21, 20, 5, 3, -.6, 0, Math.PI * 2); c.fill();
      return new THREE.CanvasTexture(cv);
    };
    const textures = [tex('#ff8fab', '#e0335f'), tex('#ffb3c6', '#f06088'), tex('#ff6b6b', '#c9184a')];
    const g = new THREE.Group(); this.scene.add(g);
    const t0 = performance.now(); const items: { s: THREE.Sprite; t: number; o: THREE.Vector3; dx: number; dz: number; sp: number }[] = [];
    const step = () => {
      const now = performance.now();
      if (now - t0 < ms && (!items.length || now - items[items.length - 1].t > this.coeurPas)) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures[items.length % 3], transparent: true, depthWrite: false, depthTest: false }));
        sp.renderOrder = 20;
        const o = depuis().clone(); sp.position.copy(o); sp.scale.setScalar(.1); g.add(sp);
        items.push({ s: sp, t: now, o, dx: (Math.random() - .5) * .35, dz: (Math.random() - .5) * .2, sp: .7 + Math.random() * .5 });
      }
      for (const it of items) {
        const k = (now - it.t) / 2200;                                   // comme la vapeur : monte, ondule, grossit, s'efface
        it.s.position.set(it.o.x + it.dx * k + Math.sin(k * 7 + it.dx * 9) * .03, it.o.y + k * it.sp, it.o.z + it.dz * k);
        it.s.scale.setScalar(.1 + k * .14);
        (it.s.material as THREE.SpriteMaterial).opacity = Math.max(0, k < .15 ? k / .15 : 1 - (k - .15) / .85);
      }
      if (now - t0 < ms + 2300) requestAnimationFrame(step); else { this.scene.remove(g); textures.forEach(x => x.dispose()); }
    };
    requestAnimationFrame(step);
  }
  /** Un peu de vapeur au-dessus de la casserole pendant la cuisine. */
  steam(at: THREE.Vector3, ms: number) {
    const g = new THREE.Group(); this.scene.add(g);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, depthWrite: false });
    const puffs: { m: THREE.Mesh; t0: number }[] = [];
    const t0 = performance.now();
    const step = () => {
      const now = performance.now();
      if (now - t0 < ms && (puffs.length === 0 || now - puffs[puffs.length - 1].t0 > 220)) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), mat.clone()); m.position.copy(at).add(new THREE.Vector3((Math.random() - .5) * .2, 0, (Math.random() - .5) * .2)); g.add(m); puffs.push({ m, t0: now });
      }
      for (const p of puffs) { const k = (now - p.t0) / 1800; p.m.position.y += .012; p.m.scale.setScalar(1 + k * 2.5); (p.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, .55 * (1 - k)); }
      if (now - t0 < ms + 1800) requestAnimationFrame(step); else this.scene.remove(g);
    };
    requestAnimationFrame(step);
  }
  /** Un objet s'envole vers la rue (l'assiette offerte au voisin). */
  flyAway(from: THREE.Vector3, name: string | THREE.Object3D) {
    const o = typeof name !== 'string' ? name : this.assets.has(name) ? this.assets.get(name) : new THREE.Mesh(new THREE.CylinderGeometry(.16, .14, .03, 18), new THREE.MeshStandardMaterial({ color: 0xfaf6ee }));
    o.scale.setScalar(1); o.rotation.set(0, 0, 0); o.position.copy(from); this.scene.add(o);
    const end = from.clone().add(new THREE.Vector3((Math.random() - .5) * 3, 2.2, 3.5));
    const t0 = performance.now(), dur = 1400;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      o.position.lerpVectors(from, end, k); o.position.y += Math.sin(k * Math.PI) * .8; o.rotation.y += .1;
      o.scale.setScalar(1 - k * .7);
      if (k < 1) requestAnimationFrame(step); else this.scene.remove(o);
    };
    requestAnimationFrame(step);
  }
  /** Point du monde où doit se poser le bassin quand on s'assoit. */
  seatPoint(): THREE.Vector3 {
    const s = this.chair ? Assets.socket(this.chair, 'seat') : null;
    const p = new THREE.Vector3();
    if (s) { this.chair!.updateWorldMatrix(true, true); s.getWorldPosition(p); } else p.copy(CHAIR_SPOT.pos).add(new THREE.Vector3(0, .49, 0));
    return p;
  }

  constructor(public canvas: HTMLCanvasElement, public assets: Assets) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.5 : 1.75));   // assez net, beaucoup moins lourd
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = !this.isMobile;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(38, 1, .1, 1200);
    this.scene.add(this.root, this.potGroup, this.decoGroup, this.roofGroup);

    // ciel : un grand dégradé derrière tout
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color('#9cc4e0') }, bottom: { value: new THREE.Color('#e9eef0') } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec2 vUv; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(0.25, 0.95, vUv.y)), 1.0); }',
      depthWrite: false, fog: false,
    });
    // un dôme : jamais de bord, quel que soit l'angle
    this.skyMat.side = THREE.BackSide;
    this.skyMat.vertexShader = 'varying float vY; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vY = wp.y; gl_Position = projectionMatrix * viewMatrix * wp; }';
    this.skyMat.fragmentShader = 'uniform vec3 top; uniform vec3 bottom; varying float vY; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-40.0, 260.0, vY)), 1.0); }';
    const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), this.skyMat);
    sky.position.set(0, FL, 0);
    this.scene.add(sky);
    this.scene.background = new THREE.Color('#dfe9ef');

    this.hemi = new THREE.HemisphereLight(0xf6f9ff, 0x8d9b7c, .9);
    this.sun = new THREE.DirectionalLight(0xfff1d8, 1.6);
    this.sun.position.set(5, 9, 6);
    this.sun.castShadow = !this.isMobile;
    this.sun.shadow.mapSize.set(1536, 1536);
    const sc = this.sun.shadow.camera;
    sc.left = -5; sc.right = 5; sc.top = 8; sc.bottom = -2; sc.near = 1; sc.far = 30;
    this.sun.shadow.bias = -.0004;
    this.sun.shadow.radius = 3;
    this.scene.add(this.hemi, this.sun);
    this.lampLight = new THREE.PointLight(0xffc36a, 0, 4, 2);
    this.scene.add(this.lampLight);
    this.wallLight = new THREE.PointLight(0xffd39a, 0, 5.5, 1.8);
    this.wallLight.position.set(0, FL + 2.35, FACADE_FRONT + .25);
    this.scene.add(this.wallLight);
    const sconce = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, .16, 10), new THREE.MeshStandardMaterial({ name: 'mat_glass_warm_sconce', color: 0xffe0a0, emissive: 0xffb340, emissiveIntensity: .3 }));
    sconce.position.set(0, FL + 2.45, FACADE_FRONT + .1); this.scene.add(sconce); this.sconce = sconce;
    this.scene.fog = new THREE.Fog(0xdbe7ee, 30, 140);
    this.buildStreet();
    this.sky = new SkyLife(this.scene, FL + 3.2);
    // reflets doux pour les verres et les métaux
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    this.scene.environmentIntensity = .35;
    pmrem.dispose();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.setupPointer();
  }

  /** Sous le balcon : deux étages de l'immeuble, pour que le balcon tienne à quelque chose. Tout le reste, ce sont tes fonds. */
  private buildStreet() {
    const plaster = new THREE.MeshStandardMaterial({ color: 0xece2cc, roughness: .95, flatShading: true });
    const plasterDark = new THREE.MeshStandardMaterial({ color: 0xd3c3a6, roughness: .95, flatShading: true });
    this.themed.plaster.push(plaster); this.themed.plasterDark.push(plasterDark);
    const glass = new THREE.MeshStandardMaterial({ color: 0x2c3e4c, roughness: .3, metalness: .15 });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; this.scene.add(b); return b; };
    const ourW = 4.0 * W, ourD = 1.6 * DEPTH, ourZ = -.3 * DEPTH, BOTTOM = -9.0;
    this.lowerBox = box(ourW, -BOTTOM, ourD, 0, BOTTOM / 2, ourZ, plaster);
    this.lowerLedge = box(ourW + .1, .12, ourD + .1, 0, 0, ourZ, plasterDark);
    this.lowerWins = [];
    for (const yy of [-2.9, -6.1]) for (const x of [-1.1 * W, 1.1 * W]) {
      this.lowerWins.push(box(1.0, 1.9, .06, x, yy, ourZ + ourD / 2 + .01, glass));
      this.lowerWins.push(box(1.12, .08, .12, x, yy - 1.0, ourZ + ourD / 2 + .02, plasterDark));
    }
  }
  lowerBox: THREE.Mesh | null = null; lowerLedge: THREE.Mesh | null = null; lowerWins: THREE.Mesh[] = [];
  /** Sous un décor assemblé : l'immeuble du dessous s'aligne sur la façade (le balcon dépasse en console) et prend sa largeur. */
  private fitLowerFloors(width: number, frontZ: number, backZ: number, topY = 0) {
    const ourD = 1.6 * DEPTH, BOTTOM = -9.0, H = -BOTTOM;
    const depth = Math.max(.5, frontZ - backZ), cz = (frontZ + backZ) / 2;
    if (this.lowerBox) {                                   // l'immeuble monte jusque sous le sol de l'appartement
      this.lowerBox.scale.set(width / (4.0 * W), (topY - BOTTOM) / H, depth / ourD);
      this.lowerBox.position.set(0, (BOTTOM + topY) / 2, cz);
    }
    if (this.lowerLedge) { this.lowerLedge.scale.set(width / (4.0 * W), 1, depth / ourD); this.lowerLedge.position.set(0, topY - .06, cz); }
    for (const w of this.lowerWins) { if (w.userData.z0 === undefined) w.userData.z0 = w.position.z; w.position.z = frontZ + .01 + (w.userData.z0 - (-.3 * DEPTH + ourD / 2 + .01)); }
  }

  // ---------- fonds
  async setView(view: ViewDef) {
    let [fd, fn, nd, nn] = await Promise.all([view.farDay, view.farNight, view.nearDay, view.nearNight].map(u => this.assets.texture(u).catch(() => null)));
    // un calque proche doit être transparent au-dessus des toits ; s'il est opaque, il boucherait le ciel : on l'ignore
    if (nd && !hasTransparentTop(nd)) { console.warn('calque toits jour opaque : ignoré (à régénérer sur fond vert)'); nd = null; }
    if (nn && !hasTransparentTop(nn)) { console.warn('calque toits nuit opaque : ignoré'); nn = null; }
    if (this.layers) for (const m of Object.values(this.layers)) this.scene.remove(m);
    for (const [name, tex] of [['far jour', fd], ['far nuit', fn], ['toits jour', nd], ['toits nuit', nn]] as const) if (!tex) console.warn('fond non chargé :', name);
    // le fond est un morceau de cylindre centré sur la scène : à distance constante, il n'a ni bord ni déformation
    const plane = (tex: THREE.Texture | null, z: number, h: number, y: number, night: boolean) => {
      const img = tex ? (tex.image as { width: number; height: number }) : null;
      const aspect = img && img.width ? img.width / img.height : 2.6;
      const mat = new THREE.MeshBasicMaterial({ color: tex ? 0xffffff : 0xcfd9e0, transparent: true, opacity: night || !tex ? 0 : 1, fog: false, depthWrite: false, side: THREE.BackSide });
      if (tex) { tex.wrapS = THREE.ClampToEdgeWrapping; tex.repeat.x = -1; tex.offset.x = 1; mat.map = tex; }
      const R = -z, theta = Math.min(Math.PI * 1.6, aspect * h / R);
      const geo = new THREE.CylinderGeometry(R, R, h, 96, 1, true, Math.PI - theta / 2, theta);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(0, y, 0);
      m.renderOrder = (z < -60 ? -20 : -10) + (night ? 1 : 0);      // la version nuit se dessine par-dessus la version jour et se fond dedans
      this.scene.add(m);
      if (tex) console.info('fond', tex.image?.width, '×', tex.image?.height, 'rayon', R, 'ouverture', Math.round(theta * 180 / Math.PI) + '°');
      return m;
    };
    // horizon de l'image (40 % du haut) posé à la hauteur de l'horizon de la caméra
    if (!USE_NEAR_LAYER) { nd = null; nn = null; }
    const horizon = FL + 3.0, hf = 220, hn = 60;
    this.layers = {
      farDay: plane(fd, -150, hf, horizon - hf * .1, false), farNight: plane(fn, -150.5, hf, horizon - hf * .1, true),
      nearDay: plane(nd, -40, hn, horizon + hn * .17, false), nearNight: plane(nn, -40.5, hn, horizon + hn * .17, true),
    };
    (this.layers.nearDay.material as THREE.MeshBasicMaterial).color.set(0xeef2f5);   // légère brume sur les toits proches
    (this.layers.farDay.material as THREE.MeshBasicMaterial).color.set(0xf2f5f7);    // à peine voilé
    this.layers.nearDay.userData.has = !!nd; this.layers.nearNight.userData.has = !!nn; this.layers.farDay.userData.has = !!fd; this.layers.farNight.userData.has = !!fn;
  }

  // ---------- le balcon
  buildBalcony() {
    const A = this.assets;
    const put = (name: string, x: number, y: number, z: number, ry = 0, s = 1, group: THREE.Group = this.root) => {
      const o = A.get(name);
      o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s);
      group.add(o);
      return o;
    };
    const themePick = (n: string): keyof World['themed'] | null => n.startsWith('mat_plaster_dark') ? 'plasterDark' : n.startsWith('mat_plaster') ? 'plaster' : n.startsWith('mat_tile_light') ? 'tileA' : n.startsWith('mat_tile_dark') ? 'tileB' : null;
    const base = put('decor_building_below', 0, 0, 0); base.scale.set(W, 1, DEPTH); this.ownMaterials(base, themePick); this.baseObj = base;
    const floor = put('decor_floor_tiles', 0, 1.25, 0); floor.scale.set(W, 1, DEPTH); this.ownMaterials(floor, themePick); this.floorObj = floor;
    const facade = put('decor_facade_window', 0, FL, -0.6 * DEPTH); facade.scale.x = W; this.ownMaterials(facade, themePick);
    this.facade = facade;
    // les vitres laissent voir la pièce derrière
    facade.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const mats = Array.isArray(m.material) ? m.material : [m.material]; for (const mat of mats) { const st = mat as THREE.MeshStandardMaterial; if (st.isMeshStandardMaterial && st.name.startsWith('mat_glass_dark')) { const c = st.clone(); c.transparent = true; c.opacity = .18; c.color.set(0xbfd6e6); c.roughness = .1; c.metalness = .05; c.depthWrite = false; m.material = c; } } });
    this.buildRoom();
    // le corps de l'immeuble derrière la façade : le toit repose sur quelque chose, les côtés existent
    const bodyD = 2.4, bodyMat = new THREE.MeshStandardMaterial({ color: 0xece2cc, roughness: .95, flatShading: true });
    this.themed.plaster.push(bodyMat);
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.0 * W, 3.2, bodyD), bodyMat);
    body.position.set(0, FL + 1.6, -0.6 * DEPTH - .15 - bodyD / 2); body.castShadow = true; body.receiveShadow = true; this.root.add(body);
    this.body = body;
    this.buildTerrace();
    const halfW = 1.9 * W, zf = .72 * DEPTH, zb = -0.6 * DEPTH + .15;
    this.buildRailing(halfW, zf, zb);
    this.chair = put('furniture_chair_bistro', CHAIR_SPOT.pos.x, FL, CHAIR_SPOT.pos.z, CHAIR_SPOT.face);
    this.basket = put('furniture_basket', BASKET_SPOT.x, FL, BASKET_SPOT.z, .4, .7, this.decoGroup); this.basket.userData.item = 'basket';
    // le toit, visible et verrouillé
    const roof = put('decor_roof_zinc', 0, ROOF_Y, -.6 * DEPTH - .85, 0, 1, this.roofGroup); roof.scale.x = W;
    const sd = Assets.socket(roof, 'dormer'), sh = Assets.socket(roof, 'hatch');
    if (sd) { const d = A.get('decor_dormer'); sd.add(d); d.rotation.x = -ROOF_SLOPE; d.position.set(0, 0, 0); }
    if (sh) {
      this.hatch.closed = A.get('decor_hatch_closed'); this.hatch.open = A.get('decor_hatch_open');
      sh.add(this.hatch.closed, this.hatch.open);
      this.hatch.open.visible = false;
    }
    const chim = put('decor_chimney', -1.45 * W, ROOF_Y + .9, -.6 * DEPTH - 2.4, 0, .8, this.roofGroup);
    chim.rotation.y = 0;
    this.ladder = put('decor_ladder', -1.75, FL, -.25, 0, 1, this.roofGroup);
    this.ladder.scale.y = 1.62; this.ladder.rotation.x = -.13; this.ladder.visible = false;
  }

  private themed: { plaster: THREE.MeshStandardMaterial[]; plasterDark: THREE.MeshStandardMaterial[]; tileA: THREE.MeshStandardMaterial[]; tileB: THREE.MeshStandardMaterial[]; rail: THREE.MeshStandardMaterial[]; brass: THREE.MeshStandardMaterial[] } = { plaster: [], plasterDark: [], tileA: [], tileB: [], rail: [], brass: [] };
  /** Chaque personnage a son balcon : mêmes objets, autres couleurs, avec ou sans toit. */
  applyTheme(theme?: { plaster: string; plasterDark: string; tileA: string; tileB: string; rail: string; brass: string; roof: boolean; terrace?: boolean }) {
    if (!theme) return;
    const paint = (list: THREE.MeshStandardMaterial[], hex: string) => list.forEach(m => m.color.set(hex));
    paint(this.themed.plaster, theme.plaster); paint(this.themed.plasterDark, theme.plasterDark);
    paint(this.themed.tileA, theme.tileA); paint(this.themed.tileB, theme.tileB);
    paint(this.themed.rail, theme.rail); paint(this.themed.brass, theme.brass);
    if (this.envActive) return;                       // décor assemblé chargé : il décide de ce qui est visible
    this.roofGroup.visible = theme.roof && !theme.terrace;
    if (this.facade) this.facade.visible = !theme.terrace;
    if (this.body) this.body.visible = !theme.terrace;
    this.terrace.visible = !!theme.terrace;
  }
  envActive = false;
  /** Rend les matériaux d'un objet propres à lui (copie), pour pouvoir les recolorer sans toucher aux autres. */
  private ownMaterials(o: THREE.Object3D, pick: (name: string) => keyof World['themed'] | null) {
    o.traverse(m => {
      const mesh = m as THREE.Mesh; if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const out = mats.map(mat => {
        const key = pick(mat.name);
        if (!key) return mat;
        const c = (mat as THREE.MeshStandardMaterial).clone(); this.themed[key].push(c); return c;
      });
      mesh.material = Array.isArray(mesh.material) ? out : out[0];
    });
  }

  room = new THREE.Group();
  bedSpot = new THREE.Vector3();
  /** La pièce derrière la porte-fenêtre : parquet, murs clairs, un lit, un tapis, une lampe. C'est là qu'on dort. */
  private buildRoom() {
    const g = this.room; this.root.add(g);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf3ede2, roughness: .95, flatShading: true });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xb98b5c, roughness: .8, flatShading: true });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: .8, flatShading: true });
    const sheetMat = new THREE.MeshStandardMaterial({ color: 0xf7f2ea, roughness: .95, flatShading: true });
    const blanketMat = new THREE.MeshStandardMaterial({ color: 0x8fb3a8, roughness: .95, flatShading: true });
    const rugMat = new THREE.MeshStandardMaterial({ color: 0xc9714b, roughness: 1, flatShading: true });
    const RW = 3.2, RD = 2.6, RH = 2.7, z0 = -0.6 * DEPTH - .15;      // z0 : face arrière du mur de façade
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.receiveShadow = true; mesh.castShadow = true; g.add(mesh); return mesh; };
    add(new THREE.BoxGeometry(RW, .1, RD), floorMat, 0, FL - .05, z0 - RD / 2);
    add(new THREE.BoxGeometry(RW, RH, .1), wallMat, 0, FL + RH / 2, z0 - RD);
    add(new THREE.BoxGeometry(.1, RH, RD), wallMat, -RW / 2, FL + RH / 2, z0 - RD / 2);
    add(new THREE.BoxGeometry(.1, RH, RD), wallMat, RW / 2, FL + RH / 2, z0 - RD / 2);
    add(new THREE.BoxGeometry(RW, .1, RD), wallMat, 0, FL + RH, z0 - RD / 2);
    add(new THREE.BoxGeometry(1.2, .02, 1.8), rugMat, 0, FL + .01, z0 - 1.2);
    // le lit, dans l'axe de la fenêtre, tête au fond
    const bx = .55, bz = z0 - RD / 2 - .2;
    add(new THREE.BoxGeometry(1.0, .3, 2.0), woodMat, bx, FL + .15, bz);
    add(new THREE.BoxGeometry(.96, .18, 1.94), sheetMat, bx, FL + .39, bz);
    add(new THREE.BoxGeometry(.96, .08, 1.2), blanketMat, bx, FL + .5, bz + .35);
    add(new THREE.BoxGeometry(.6, .12, .35), sheetMat, bx, FL + .53, bz - .75);
    add(new THREE.BoxGeometry(1.0, .7, .08), woodMat, bx, FL + .55, bz - 1.0);
    this.bedSpot.set(bx, FL + .48, bz);
    // lampe de chevet, chaude la nuit
    const lampMat = new THREE.MeshStandardMaterial({ name: 'mat_glass_warm_room', color: 0xffe08a, emissive: 0xffb340, emissiveIntensity: .3 });
    add(new THREE.BoxGeometry(.4, .5, .4), woodMat, -1.0, FL + .25, z0 - RD + .35);
    add(new THREE.CylinderGeometry(.14, .18, .22, 10), lampMat, -1.0, FL + .68, z0 - RD + .35);
    const lamp = new THREE.PointLight(0xffc36a, 0, 4, 2); lamp.position.set(-1.0, FL + .9, z0 - RD + .5); g.add(lamp); this.roomLamp = lamp;
    // une affiche au mur
    add(new THREE.BoxGeometry(.7, .95, .02), new THREE.MeshStandardMaterial({ color: 0x5fa35a, roughness: .9 }), -.9, FL + 1.7, z0 - RD + .06);
  }
  roomLamp: THREE.PointLight | null = null;

  envGroup = new THREE.Group();
  doors: { o: THREE.Object3D; open: number }[] = [];
  private doorsOpen = 0; private doorsTarget = 0;
  doorSpot = new THREE.Vector3(0, FL, -.4);
  insideSpot = new THREE.Vector3(0, FL, -1.8);
  kitchenSpot: THREE.Vector3 | null = null; kitchenLook = new THREE.Vector3(); kitchenTop = 0;
  hasRoom = true;
  danseSpot: THREE.Vector3 | null = null;
  tableauSpot: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  /** Les fenêtres de la maison : où se tenir (dans la pièce) et la direction de dehors. */
  fenetres: { pos: THREE.Vector3; dehors: number; largeur: number; axe: THREE.Vector3; h: number }[] = [];
  /** Les vrais sièges de la maison, mesurés dans Blender : assise (centre et hauteur), direction du regard. */
  sieges: { nom: string; genre: string; pos: THREE.Vector3; face: number; h: number; dedans: boolean }[] = [];
  canapeSpot: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  bedSide = new THREE.Vector3(0, FL, -1.8);
  armchairSpot: { pos: THREE.Vector3; face: number } | null = null;
  openDoors(open: boolean) { this.doorsTarget = open ? 1 : 0; }
  /** Décor assemblé venu de test-gemini.blend : l'appartement (façade + pièce) et le balcon du personnage remplacent
   *  le mur, le sol et la barrière faits par le code. Tout est calé à partir des vrais objets : sol de la pièce à FL,
   *  face avant de la façade sur la ligne du mur, dalle du balcon à FL et collée à la façade. */
  /** Repère de l'assemblage Blender → jeu : X = x, Y = z + FL, Z = -y + ligne de façade. */
  private fromLayout(v: number[]): THREE.Vector3 { return new THREE.Vector3(v[0], v[2] + FL, -v[1] + FACADE_FRONT); }
  /** Trajets dans la pièce / sur le toit-terrasse, autour du mobilier chargé. */
  cheminMeubles(a: THREE.Vector3, cible: THREE.Vector3): THREE.Vector3[] {
    if (![a.x, a.z, cible.x, cible.z].every(Number.isFinite)) throw new TrajetImpossible('Position de marche invalide');
    if (a.z >= LAYOUT.backZ && a.z <= LAYOUT.frontZ) {
      const sortie = degagementBalcon(a, 'chair');
      if (sortie) return [sortie, ...this.cheminMeubles(sortie, cible)];
    }
    this.envGroup.updateMatrixWorld(true);
    const boites: THREE.Box3[] = [], sol = new THREE.Box3();
    this.envGroup.traverse(o => { if ((o as THREE.Mesh).isMesh && /floor|wood_deck/i.test(o.name)) sol.union(new THREE.Box3().setFromObject(o)); });
    const dansLaPiece = (p: THREE.Vector3) => (sol.isEmpty() || (p.x > sol.min.x + .3 && p.x < sol.max.x - .3 && p.z > sol.min.z + .3)) && p.z < FACADE_FRONT - .1;
    this.envGroup.traverse(o => {
      if (!/^(asm_furniture_armchair|asm_rooftop_furniture_sofa|asm_furniture_bed|asm_rooftop_furniture_outdoor_kitchen|(?:asm_)?kitchen_counter)/i.test(o.name)) return;
      let parent = o.parent; while (parent && parent !== this.envGroup) { if (/^(asm_furniture_armchair|asm_rooftop_furniture_sofa|asm_furniture_bed|asm_rooftop_furniture_outdoor_kitchen|(?:asm_)?kitchen_counter)/i.test(parent.name)) return; parent = parent.parent; }
      const b = new THREE.Box3().setFromObject(o).expandByScalar(.20);
      if (b.max.y > FL + .3) boites.push(b);
    });
    const dedans = (p: THREE.Vector3, b: THREE.Box3) => p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z;
    const pots = obstacles('chair').filter(o => o.id.startsWith('pot') || o.id === 'basket');
    const libre = (p: THREE.Vector3) => !boites.some(b => dedans(p, b)) && !pots.some(o => Math.hypot(p.x - o.x, p.z - o.z) < o.r - .04);
    const b = cible.z >= LAYOUT.backZ && cible.z <= LAYOUT.frontZ ? freePoint(cible, 'chair') : cible.clone();
    for (const o of boites) if (dedans(b, o)) {
      const sorties = [new THREE.Vector3(o.min.x - .01, b.y, b.z), new THREE.Vector3(o.max.x + .01, b.y, b.z), new THREE.Vector3(b.x, b.y, o.min.z - .01), new THREE.Vector3(b.x, b.y, o.max.z + .01)].filter(libre);
      sorties.sort((p, q) => p.distanceTo(b) - q.distanceTo(b)); if (sorties[0]) b.copy(sorties[0]);
    }
    if (!libre(b)) throw new TrajetImpossible('Arrivée occupée près du mobilier');
    const bloquePots = (p: THREE.Vector3, q: THREE.Vector3) => pots.some(o => {
      const dx = q.x - p.x, dz = q.z - p.z, l2 = dx * dx + dz * dz;
      const t = l2 < 1e-8 ? 0 : THREE.MathUtils.clamp(((o.x - p.x) * dx + (o.z - p.z) * dz) / l2, 0, 1);
      return Math.hypot(p.x + dx * t - o.x, p.z + dz * t - o.z) < o.r - .04;
    });
    const bloque = (p: THREE.Vector3, q: THREE.Vector3) => bloquePots(p, q) || boites.some(o => {
      // Un personnage qui vient de se lever sort d'abord de son propre siège.
      if (dedans(p, o) && p.distanceTo(a) < .001) return false;
      let lo = 0, hi = 1;
      for (const axe of ['x', 'z'] as const) {
        const d = q[axe] - p[axe];
        if (Math.abs(d) < 1e-8) { if (p[axe] <= o.min[axe] || p[axe] >= o.max[axe]) return false; }
        else { const t1 = (o.min[axe] - p[axe]) / d, t2 = (o.max[axe] - p[axe]) / d; lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2)); }
      }
      return lo < hi && hi > 0 && lo < 1;
    });
    if (!bloque(a, b)) return [b];
    const points = [a.clone(), b];
    for (const o of pots) for (let i = 0; i < 32; i++) {
      const angle = i * Math.PI / 16, p = new THREE.Vector3(o.x + Math.cos(angle) * (o.r + .055), a.y, o.z + Math.sin(angle) * (o.r + .055));
      if (libre(p) && p.x >= -LAYOUT.halfW + .2 && p.x <= LAYOUT.halfW - .2 && p.z >= LAYOUT.backZ && p.z <= LAYOUT.frontZ) points.push(p);
    }
    for (const o of boites) for (const x of [o.min.x - .01, o.max.x + .01]) for (const z of [o.min.z - .01, o.max.z + .01]) {
      const p = new THREE.Vector3(x, a.y, z);
      if (libre(p) && dansLaPiece(p)) points.push(p);
    }
    const d = points.map(() => Infinity), avant = points.map(() => -1), vus = new Set<number>(); d[0] = 0;
    for (;;) {
      let u = -1; for (let i = 0; i < points.length; i++) if (!vus.has(i) && (u < 0 || d[i] < d[u])) u = i;
      if (u < 0 || !Number.isFinite(d[u])) throw new TrajetImpossible('Aucun trajet libre autour des meubles');
      if (u === 1) break; vus.add(u);
      for (let v = 1; v < points.length; v++) if (!vus.has(v) && !bloque(points[u], points[v])) {
        const nd = d[u] + points[u].distanceTo(points[v]); if (nd < d[v]) { d[v] = nd; avant[v] = u; }
      }
    }
    const chemin: THREE.Vector3[] = []; for (let v = 1; v !== 0; v = avant[v]) chemin.unshift(points[v]); return chemin;
  }
  /** Réserver le volume des danses et exercices : enveloppe mesurée sur les
   * trois corps (X < 95,1 cm, Z < 97,5 cm), plus 7 cm de marge. */
  pointActivite(cible: THREE.Vector3): THREE.Vector3 {
    const rx = 1.02, rz = 1.05, meubles: THREE.Box3[] = [], sol = new THREE.Box3();
    this.envGroup.updateMatrixWorld(true);
    this.envGroup.traverse(o => {
      if ((o as THREE.Mesh).isMesh && /floor|wood_deck/i.test(o.name)) sol.union(new THREE.Box3().setFromObject(o));
      if (/^(asm_furniture_armchair|asm_rooftop_furniture_sofa|asm_furniture_bed|asm_rooftop_furniture_outdoor_kitchen|(?:asm_)?kitchen_counter)/i.test(o.name)) meubles.push(new THREE.Box3().setFromObject(o));
    });
    if (sol.isEmpty()) return cible.clone();
    const libre = (p: THREE.Vector3) => p.x - rx > sol.min.x && p.x + rx < sol.max.x && p.z - rz > sol.min.z && p.z + rz < sol.max.z && !meubles.some(b => p.x + rx > b.min.x && p.x - rx < b.max.x && p.z + rz > b.min.z && p.z - rz < b.max.z);
    const choix: THREE.Vector3[] = [];
    for (let x = sol.min.x + rx + .01; x < sol.max.x - rx; x += .1) for (let z = sol.min.z + rz + .01; z < sol.max.z - rz; z += .1) { const p = new THREE.Vector3(x, FL, z); if (libre(p)) choix.push(p); }
    choix.sort((a, b) => a.distanceToSquared(cible) - b.distanceToSquared(cible));
    if (!choix.length) throw new Error('Pas de surface libre pour la danse ou le sport');
    return choix[0];
  }
  /** Applique un layout_<perso>.json écrit par jdp_assemblage.py : tout est posé là où tu l'as mis dans Blender. */
  applyLayout(L: Layout) {
    this.perso = L.character ?? ''; this.decaleMarcel = false;
    const A = this.assets;
    const boxOf = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);
    let aptBox: THREE.Box3 | null = null; let balW = 0;
    for (const [name, g] of Object.entries(L.groups)) {
      if (!A.has(name)) { console.warn('layout : objet absent des glb :', name); continue; }
      const o = A.get(name); o.rotation.y = (g.rz || 0) * Math.PI / 180; this.envGroup.add(o);
      // pièces déplacées dans Blender à l'intérieur de ce décor : même décalage ici (Blender x,y,z → jeu x, z, -y)
      const parts = L.parts?.[name];
      if (parts) o.traverse(c => { const d = parts[c.name]; if (d) { c.position.x += d.dloc[0]; c.position.y += d.dloc[2]; c.position.z += -d.dloc[1]; c.rotation.y += (d.drz || 0) * Math.PI / 180; } });
      o.updateMatrixWorld(true);
      const b = boxOf(o), t = this.fromLayout(g.loc);
      o.position.x += t.x - (b.min.x + b.max.x) / 2; o.position.y += t.y - b.min.y; o.position.z += t.z - (b.min.z + b.max.z) / 2;
      o.updateMatrixWorld(true);
      if (/^apartment_/.test(name)) {
        this.doors = [];
        o.traverse(c => { if (/door_left_hinge/i.test(c.name)) this.doors.push({ o: c, open: (L.doors?.left?.open_deg ?? 90) * Math.PI / 180 }); else if (/door_right_hinge/i.test(c.name)) this.doors.push({ o: c, open: (L.doors?.right?.open_deg ?? -90) * Math.PI / 180 }); });
        for (const d of this.doors) d.o.rotation.y = 0;
      }
      if (/^balcony_/.test(name)) { const bb = boxOf(o); LAYOUT.halfW = (bb.max.x - bb.min.x) / 2 - .1; balW = bb.max.x - bb.min.x; LAYOUT.frontZ = bb.max.z - .30; LAYOUT.backZ = FACADE_FRONT + .22; }
      if (/^apartment_/.test(name)) aptBox = boxOf(o);
    }
    // l'immeuble sous l'appartement : largeur du balcon, 3,2 m de profondeur derrière la façade, jusque sous le sol du jeu
    void aptBox;
    this.fitLowerFloors((balW || 4.0 * W) + .3, FACADE_FRONT, FACADE_FRONT - 3.2, FL - .02);
    const sp = (k: string) => L.spots[k] ? this.fromLayout(L.spots[k].loc) : null;
    const corridor = sp('spot_corridor'); if (corridor) LAYOUT.corridorZ = corridor.z;
    for (const sl of L.slots) {
      const S = SLOTS[sl.id]; if (!S) continue;
      const pos = this.fromLayout(sl.loc); S.pos.copy(pos);
      S.stand.set(pos.x, FL, LAYOUT.corridorZ); S.face = pos.z < LAYOUT.corridorZ ? Math.PI : 0;
    }
    const door = sp('spot_door'); if (door) this.doorSpot.copy(door);
    const inside = sp('spot_inside'); if (inside) this.insideSpot.copy(inside);
    const ks = sp('spot_kitchen'), kl = sp('spot_kitchen_look');
    this.kitchenSpot = ks; if (kl) this.kitchenLook.copy(kl);
    this.kitchenTop = FL + ((L as any).cuisine_haut ?? .9);
    this.sieges = ((L as any).sieges ?? []).map((q: any) => ({ nom: q.nom, genre: q.genre, h: q.h, dedans: q.dedans, pos: this.fromLayout([q.loc[0], q.loc[1], q.h]), face: Math.atan2(q.face[0], -q.face[1]) }));
    this.fenetres = ((L as any).fenetres ?? []).map((f: any) => ({ pos: this.fromLayout([f.loc[0], f.loc[1], 0]), dehors: Math.atan2(f.dehors[0], -f.dehors[1]), largeur: f.largeur ?? .6, axe: new THREE.Vector3(f.axe?.[0] ?? 1, 0, -(f.axe?.[1] ?? 0)), h: f.h ?? 1.6 }));
    this.danseSpot = sp('spot_danse') ?? (this.hasRoom ? this.insideSpot.clone().add(new THREE.Vector3(0, 0, -.7)) : new THREE.Vector3(0, FL, LAYOUT.corridorZ));
    const ts = sp('spot_tableau'), tl = sp('spot_tableau_look'); this.tableauSpot = ts && tl ? { pos: ts, look: tl } : null;
    const cadres = ((L as any).cadres ?? []) as { h: number; taille: number[] }[];
    if (this.tableauSpot && cadres.length) { const c = cadres.reduce((a, b) => a.taille[0] * a.taille[1] > b.taille[0] * b.taille[1] ? a : b); this.tableauSpot.look.y = FL + c.h; }
    const cs = sp('spot_canape'), cl = sp('spot_canape_look'); this.canapeSpot = cs && cl ? { pos: cs, look: cl } : null;
    const bed = sp('spot_bed'); if (bed) this.bedSpot.copy(bed);
    const lit = ((L as any).lits ?? [])[0]; if (lit) this.bedSpot.copy(this.fromLayout([lit.loc[0], lit.loc[1], lit.h + .02]));   // le dessus du matelas, mesuré
    const bedSide = sp('spot_bed_side'); if (bedSide) this.bedSide.copy(bedSide);
    const arm = sp('spot_armchair'); if (arm) this.armchairSpot = { pos: arm.setY(FL), face: (L.spots.spot_armchair.rz || 0) * Math.PI / 180 };
    // Les anciens repères du layout précèdent les déplacements du mobilier.
    // Reprendre les surfaces du décor chargé ; la profondeur des assises doit
    // laisser les mollets devant le coussin, sans changer les personnages.
    const nom = (s: string) => THREE.PropertyBinding.sanitizeNodeName(s);
    this.sieges = this.sieges.flatMap(q => {
      let meuble: THREE.Object3D | null = null;
      this.envGroup.traverse(o => { if (nom(o.name) === nom(q.nom)) meuble = o; });
      if (!meuble || q.h <= 0) return [];
      const surface = new THREE.Box3();
      (meuble as THREE.Object3D).traverse(o => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        if (/seat|cushion|sofa_base/i.test(m.name + ' ' + mats.map(a => a.name).join(' '))) surface.union(boxOf(m));
      });
      if (surface.isEmpty()) return [];
      const centre = surface.getCenter(new THREE.Vector3());
      const facteur = this.perso === 'marcel' ? .50 : this.perso === 'lea' ? .60 : q.genre === 'canape' ? .85 : 1;
      const objet = meuble as THREE.Object3D;
      if (facteur !== 1 && objet.parent) {
        const parent = objet.parent, pivot = new THREE.Group(); pivot.name = 'assise_adaptee';
        pivot.position.copy(parent.worldToLocal(centre.clone()));
        pivot.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), q.face)));
        parent.add(pivot); pivot.attach(objet); pivot.scale.z = facteur;
        pivot.updateMatrixWorld(true);
        if (this.perso === 'marcel') objet.traverse(o => {
          const m = o as THREE.Mesh; if (!m.isMesh || !/back/i.test(m.name) || !m.parent) return;
          const p = m.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(-Math.sin(q.face) * .10, 0, -Math.cos(q.face) * .10));
          m.position.copy(m.parent.worldToLocal(p)); m.updateMatrixWorld(true);
        });
      }
      return [{ ...q, h: surface.max.y - FL, pos: centre.setY(surface.max.y) }];
    });
    const fauteuil = this.sieges.find(q => q.genre !== 'canape');
    this.armchairSpot = fauteuil ? { pos: fauteuil.pos.clone().setY(FL), face: fauteuil.face } : null;
    const canape = this.sieges.find(q => q.genre === 'canape');
    this.canapeSpot = canape ? { pos: canape.pos.clone().setY(FL), look: canape.pos.clone().add(new THREE.Vector3(Math.sin(canape.face), 0, Math.cos(canape.face))) } : null;
    const matelas = new THREE.Box3(), couverture = new THREE.Box3();
    this.envGroup.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material], label = m.name + ' ' + mats.map(a => a.name).join(' ');
      if (/mattress|matelas/i.test(label)) matelas.union(boxOf(m));
      if (/blanket|couverture/i.test(label)) couverture.union(boxOf(m));
      if (/kitchen_counter/i.test(label)) this.kitchenTop = Math.max(this.kitchenTop, boxOf(m).max.y);
    });
    if (!matelas.isEmpty()) {
      this.bedSpot.copy(matelas.getCenter(new THREE.Vector3()));
      this.bedSpot.y = Math.max(matelas.max.y, couverture.isEmpty() ? -Infinity : couverture.max.y) + .001;
      this.bedSide.set(matelas.min.x - .35, FL, this.bedSpot.z);
    }
    if (this.kitchenSpot) this.kitchenSpot.addScaledVector(this.kitchenLook.clone().sub(this.kitchenSpot).setY(0).normalize(), .23);
    const chair = sp('spot_chair'); if (chair) { CHAIR_SPOT.pos.copy(chair.setY(FL)); CHAIR_SPOT.face = (L.spots.spot_chair.rz || 0) * Math.PI / 180; }
    this.chaiseDansLaZone();
    const basket = sp('spot_basket'); if (basket) BASKET_SPOT.copy(basket.setY(FL));
    this.panierDansLaZone();
    const start = sp('spot_start'); if (start) START_SPOT.copy(start.setY(FL));
    LADDER_SPOT.set(-LAYOUT.halfW + .55, FL, LAYOUT.corridorZ);
    for (const [i, v] of this.views.entries()) v.position.copy(SLOTS[i].pos);
    if (L.camera) { TUNE.camPitch = L.camera.pitch; TUNE.camDist = L.camera.dist; TUNE.lookY = FL + L.camera.look_z; this.lookAt.x = L.camera.x ?? 0; this.baseX = this.lookAt.x; this.fovPaysage = L.camera.fov ?? 42; this.applyTune(); }
    this.roofGroup.visible = false;                       // avec un décor assemblé, le toit vient du décor
    styliserInterieur(this.envGroup, this.perso);
  }
  setEnvironment(env?: { apartment?: string; balcony?: string; extra?: string; roof?: boolean; room?: boolean }, layout?: Layout | null) {
    this.hasRoom = env?.room !== false;
    for (const c of [...this.envGroup.children]) this.envGroup.remove(c);
    if (!this.envGroup.parent) this.root.add(this.envGroup);
    const A = this.assets;
    const hasEnv = !!(env && env.apartment && A.has(env.apartment) && env.balcony && A.has(env.balcony));
    this.envActive = hasEnv;
    if (this.sconce) this.sconce.visible = !hasEnv;          // tes maisons ont leur propre décor : la petite applique du jeu disparaît (la lumière reste)
    // décor code visible seulement sans décor assemblé
    const codeParts = [this.facade, this.body, this.floorObj, this.railGroup, this.room];
    for (const o of codeParts) if (o) o.visible = !hasEnv;
    if (hasEnv) this.terrace.visible = false;
    LAYOUT.halfW = 1.9 * W; LAYOUT.corridorZ = 0;
    this.layoutSlots(FACADE_FRONT + .34, .56, 0, 1);
    if (this.baseObj) this.baseObj.visible = !hasEnv;
    if (hasEnv && layout) { this.applyLayout(layout); return; }
    if (!hasEnv) { this.fitLowerFloors(4.0 * W, -.3 * DEPTH + .8 * DEPTH, -.3 * DEPTH - .8 * DEPTH); this.roofGroup.position.set(0, 0, 0); this.roofGroup.scale.x = 1; return; }
    const boxOf = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);
    const childTop = (root: THREE.Object3D, re: RegExp): number | null => { let top: number | null = null; root.traverse(o => { if (re.test(o.name) && (o as THREE.Mesh).isMesh) { const b = boxOf(o); top = top === null ? b.max.y : Math.max(top, b.max.y); } }); return top; };
    // l'appartement
    const place = (o: THREE.Object3D, dx: number, dy: number, dz: number) => { o.position.x += dx; o.position.y += dy; o.position.z += dz; o.updateMatrixWorld(true); };
    const childBox = (root: THREE.Object3D, re: RegExp): THREE.Box3 | null => { let box: THREE.Box3 | null = null; root.traverse(o => { if (re.test(o.name) && (o as THREE.Mesh).isMesh) { const b = boxOf(o); box = box ? box.union(b) : b; } }); return box; };
    const apt = A.get(env!.apartment!); this.envGroup.add(apt); apt.updateMatrixWorld(true);
    let ab = boxOf(apt);
    const fb = childBox(apt, /floor/i);
    const floorTop = fb ? fb.max.y : ab.min.y;
    const facadeZ = fb ? fb.max.z : ab.max.z - .25;                                   // la ligne du mur = l'avant du sol de la pièce
    place(apt, -(ab.min.x + ab.max.x) / 2, FL - floorTop, FACADE_FRONT - facadeZ);
    ab = boxOf(apt);
    const aptFloor = childBox(apt, /floor/i) ?? ab;
    // le balcon : sa dalle à hauteur du sol, collée au mur
    const bal = A.get(env!.balcony!); this.envGroup.add(bal); bal.updateMatrixWorld(true);
    let bb = boxOf(bal);
    const sb = childBox(bal, /slab|dalle|floor/i);
    const slabTop = sb ? sb.max.y : bb.min.y + .2, slabBack = sb ? sb.min.z : bb.min.z;
    place(bal, -(bb.min.x + bb.max.x) / 2, FL - slabTop, FACADE_FRONT - slabBack + .01);
    bb = boxOf(bal);
    const depth = bb.max.z - FACADE_FRONT, halfW = (bb.max.x - bb.min.x) / 2 - .1;
    // les portes sur leurs charnières
    this.doors = [];
    apt.traverse(o => { if (/door_left_hinge/i.test(o.name)) this.doors.push({ o, open: Math.PI / 2 * .98 }); else if (/door_right_hinge/i.test(o.name)) this.doors.push({ o, open: -Math.PI / 2 * .98 }); });
    for (const d of this.doors) { d.o.rotation.y = 0; }
    // points de passage à l'intérieur
    this.doorSpot.set(0, FL, FACADE_FRONT + .45);
    this.insideSpot.set(0, FL, aptFloor.min.z + (aptFloor.max.z - aptFloor.min.z) * .55);
    if (this.baseObj) this.baseObj.visible = false;
    this.fitLowerFloors(ab.max.x - ab.min.x, FACADE_FRONT, ab.min.z, FL - .02);
    LAYOUT.halfW = halfW;
    const backZ = FACADE_FRONT + .36, frontZ = FACADE_FRONT + depth - .40, corridor = (backZ + frontZ) / 2 + .02;
    LAYOUT.corridorZ = corridor;
    this.layoutSlots(backZ, frontZ, corridor, Math.min(1, (halfW - .3) / (1.9 * W)));
    // la pièce meublée : chaque meuble est posé au sol, dans les limites de la pièce, à partir de sa propre boîte
    const roomL = ab.min.x + .25, roomR = ab.max.x - .25, roomBack = ab.min.z + .2, roomFront = FACADE_FRONT - .35;
    const furnish = (name: string, cx: number, cz: number, ry = 0, anchor: 'center' | 'back' | 'left' | 'right' = 'center') => {
      if (!A.has(name)) return null;
      const o = A.get(name); o.rotation.y = ry; this.envGroup.add(o); o.updateMatrixWorld(true);
      const b = boxOf(o);
      let dx = cx - (b.min.x + b.max.x) / 2, dz = cz - (b.min.z + b.max.z) / 2;
      if (anchor === 'back') dz = cz - b.min.z; if (anchor === 'left') dx = cx - b.min.x; if (anchor === 'right') dx = cx - b.max.x;
      place(o, dx, FL - b.min.y, dz);
      return { o, b: boxOf(o) };
    };
    const bed = furnish('furniture_bed', roomR - .05, roomBack, 0, 'right');
    if (bed) { const top = childTop(bed.o, /mattress|matelas/i) ?? bed.b.max.y - .2; this.bedSpot.set((bed.b.min.x + bed.b.max.x) / 2, top + .02, (bed.b.min.z + bed.b.max.z) / 2); this.bedSide.set(bed.b.min.x - .35, FL, (bed.b.min.z + bed.b.max.z) / 2); }
    else { this.bedSpot.set(.6, FL + .5, (roomBack + roomFront) / 2); this.bedSide.set(0, FL, (roomBack + roomFront) / 2); }
    const midZ = (roomBack + roomFront) / 2;
    furnish('furniture_bookshelf', roomL + .05, roomBack, 0, 'left');
    furnish('furniture_floor_lamp', roomL + .3, roomBack + .9);
    furnish('furniture_rug', 0, midZ + .15);
    const chair = furnish('furniture_armchair', roomL + .75, midZ + .55, Math.PI * .72);
    void chair;                                                          // pas de siège deviné : seuls les sièges mesurés comptent
    furnish('furniture_coffee_table', roomL + 1.35, midZ - .25);
    if (env!.extra && A.has(env!.extra)) {
      const ex = A.get(env!.extra); this.envGroup.add(ex); ex.updateMatrixWorld(true);
      const eb = boxOf(ex);
      place(ex, -(eb.min.x + eb.max.x) / 2, FL - eb.min.y - .02, FACADE_FRONT - eb.max.z);
    }
    this.roofGroup.visible = env!.roof !== false;
    this.roofGroup.position.y = ab.max.y - ROOF_Y;
    this.roofGroup.position.z = (ab.max.z - .05) - (-0.6 * DEPTH + .15);        // gouttière sur la corniche de l'appartement
    this.roofGroup.scale.x = (ab.max.x - ab.min.x) / (4.0 * W) * 1.05;
  }
  /** Replace les emplacements de pots, le couloir, la chaise et le panier selon la profondeur et la largeur du balcon. */
  layoutSlots(backZ: number, frontZ: number, corridor: number, xScale: number) {
    [-0.9, 0, 0.9].forEach((x, i) => { SLOTS[i].pos.set(x * W * xScale, FL, backZ); SLOTS[i].stand.set(x * W * xScale, FL, corridor); });
    [-1.36, -0.68, 0, 0.68, 1.36].forEach((x, i) => { SLOTS[3 + i].pos.set(x * W * xScale, FL, frontZ); SLOTS[3 + i].stand.set(x * W * xScale, FL, corridor); });
    CHAIR_SPOT.pos.set(LAYOUT.halfW - .32, FL, backZ + .1);
    BASKET_SPOT.set(-LAYOUT.halfW + .3, FL, backZ + .15);
    LADDER_SPOT.set(-LAYOUT.halfW + .55, FL, corridor);
    START_SPOT.set(.3, FL, corridor);
    if (this.chair) this.chair.position.copy(CHAIR_SPOT.pos);
    if (this.basket) this.basket.position.copy(BASKET_SPOT);
    for (const [i, v] of this.views.entries()) { v.position.copy(SLOTS[i].pos); }
  }
  views = new Map<number, THREE.Object3D>();      // groupes de pots posés, pour les replacer quand le décor change

  /** Toit-terrasse (Jimy) : pas de façade, un pan de zinc derrière, deux souches de cheminée et la cabane d'accès au toit. */
  private buildTerrace() {
    const g = this.terrace; g.visible = false; this.root.add(g);
    const zinc = new THREE.MeshStandardMaterial({ color: 0x8e979e, roughness: .55, metalness: .5, flatShading: true });
    const plaster = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: .95, flatShading: true });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.0 * W + 1.2, .08, 4.2), zinc); deck.position.set(0, FL - .02, -0.6 * DEPTH - 1.9); deck.receiveShadow = true; g.add(deck);
    for (let i = 0; i < 6; i++) { const seam = new THREE.Mesh(new THREE.BoxGeometry(.03, .03, 4.2), zinc); seam.position.set(-2.5 * W + i * W, FL + .03, -0.6 * DEPTH - 1.9); g.add(seam); }
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.3, 1.6), plaster); cabin.position.set(-1.35 * W, FL + 1.15, -0.6 * DEPTH - 1.6); cabin.castShadow = true; cabin.receiveShadow = true; g.add(cabin);
    const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(1.9, .1, 1.8), zinc); cabinRoof.position.set(-1.35 * W, FL + 2.34, -0.6 * DEPTH - 1.6); g.add(cabinRoof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.9, .06), new THREE.MeshStandardMaterial({ color: 0x2e5d3a, roughness: .7 })); door.position.set(-1.35 * W, FL + .95, -0.6 * DEPTH - .78); g.add(door);
    for (const [x, z] of [[1.3 * W, -0.6 * DEPTH - 2.6], [.2 * W, -0.6 * DEPTH - 3.3]]) { const ch = this.assets.get('decor_chimney'); ch.position.set(x, FL - .02, z); ch.scale.setScalar(.8); g.add(ch); }
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4.0 * W + 1.2, .5, .25), plaster); wall.position.set(0, FL + .25, -0.6 * DEPTH - 4.0); g.add(wall);
  }

  /** Garde-corps léger : main courante ronde, barreaux espacés, petits anneaux ; les pots restent visibles à travers. */
  private buildRailing(halfW: number, zf: number, zb: number) {
    const h = .62 * TUNE.railScale / .78;
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: .5, metalness: .55, flatShading: true });
    const brass = new THREE.MeshStandardMaterial({ color: 0xcaa24b, roughness: .3, metalness: .85 });
    this.themed.rail.push(iron); this.themed.brass.push(brass);
    const g = new THREE.Group(); g.position.y = FL; this.root.add(g); this.railGroup = g;
    const bar = (x1: number, z1: number, x2: number, z2: number, r: number, y: number) => {
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), iron);
      m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); m.rotation.z = Math.PI / 2; m.rotation.y = -Math.atan2(dz, dx); m.castShadow = true; g.add(m);
    };
    const post = (x: number, z: number, r: number, hh: number) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hh, 8), iron); m.position.set(x, hh / 2, z); m.castShadow = true; g.add(m); };
    const runs: [number, number, number, number][] = [[-halfW, zf, halfW, zf], [-halfW, zb, -halfW, zf], [halfW, zb, halfW, zf]];
    for (const [x1, z1, x2, z2] of runs) {
      bar(x1, z1, x2, z2, .028, h); bar(x1, z1, x2, z2, .016, .12);
      const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(2, Math.round(len / .38));
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
        post(x, z, .012, h);
      }
    }
    for (const [x, z] of [[-halfW, zf], [halfW, zf], [-halfW, zb], [halfW, zb]]) { post(x, z, .026, h + .03); const b = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), brass); b.position.set(x, h + .07, z); g.add(b); }
  }

  /** Pots posés dans les emplacements ; les plantes sont gérées par le jeu via le socket. */
  placePot(slot: Slot, style: string): THREE.Object3D {
    const name = slot.roof ? `pot_roof_planter_wet` : `pot_${style}_wet`;
    const o = this.assets.get(name);
    o.position.copy(slot.pos); o.scale.setScalar(slot.roof ? .7 : POT_SCALE);
    o.userData.slot = slot.id;
    this.potGroup.add(o);
    return o;
  }
  registerSlotView(id: number, group: THREE.Object3D) { this.views.set(id, group); }

  unlockRoof(animated = true) {
    if (this.hatch.closed) this.hatch.closed.visible = false;
    if (this.hatch.open) this.hatch.open.visible = true;
    if (this.ladder) this.ladder.visible = true;
    if (animated) { this.zoomTarget = 1.18; this.lookAt.y = FL + 1.6; this.pitch = TUNE.camPitch + .05; }
  }

  addDeco(object: string, id: string): THREE.Object3D | null {
    if (!this.assets.has(object)) return null;
    const o = this.assets.get(object);
    o.userData.item = id;
    switch (id) {
      case 'awning': o.position.set(0, FL + 2.75, -.44 * DEPTH); o.scale.x = W; break;
      case 'garland': o.position.set(0, FL + 2.38, .3); o.scale.x = W; break;
      case 'table': o.position.set(1.7 * W + .1, FL, .25); o.scale.setScalar(.7); break;
      case 'lantern': {
        const table = this.decoGroup.children.find(c => c.userData.item === 'table');
        const s = table ? Assets.socket(table, 'lantern') : null;
        if (s) { s.add(o); o.position.set(0, 0, 0); return o; }
        o.position.set(1.7 * W + .1, FL, .25); break;
      }
      case 'can_green': o.position.set(-1.7 * W, FL, -.5); o.rotation.y = .6; o.scale.setScalar(.8); break;
      default: o.position.set(0, FL, 0);
    }
    this.decoGroup.add(o);
    return o;
  }

  // ---------- jour / nuit
  setNight(n: number) { this.targetNight = n; }
  private applyNight() {
    const n = this.night;
    this.skyMat.uniforms.top.value.set('#9cc4e0').lerp(new THREE.Color('#1f2c48'), n);
    this.skyMat.uniforms.bottom.value.set('#eef1f3').lerp(new THREE.Color('#34456b'), n);
    this.hemi.intensity = .95 - .6 * n;
    this.hemi.color.set('#f6f9ff').lerp(new THREE.Color('#4a5f8f'), n);
    this.sun.intensity = 1.6 - 1.35 * n;
    this.sun.color.set('#fff1d8').lerp(new THREE.Color('#7f9cd8'), n);
    (this.scene.fog as THREE.Fog).color.set('#dbe7ee').lerp(new THREE.Color('#1e2934'), n);
    this.lampLight.intensity = 1.6 * n;
    if (this.roomLamp) this.roomLamp.intensity = 1.2 * n;
    this.wallLight.intensity = 2.2 * n;                                 // l'applique au-dessus de la porte : le balcon n'est jamais noir
    this.hemi.intensity = Math.max(this.hemi.intensity, .45 * n);
    if (this.layers) {
      const L = this.layers, op = (m: THREE.Mesh, v: number) => { (m.material as THREE.MeshBasicMaterial).opacity = m.userData.has ? v : 0; };
      op(L.farDay, 1); op(L.farNight, n); op(L.nearDay, 1); op(L.nearNight, n);
    }
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const s = mat as THREE.MeshStandardMaterial;
        if (s.isMeshStandardMaterial && s.name.startsWith('mat_glass_warm')) s.emissiveIntensity = .25 + 2.6 * n;
      }
    });
  }
  setLampPosition(p: THREE.Vector3) { this.lampLight.position.copy(p).add(new THREE.Vector3(0, .2, 0)); }

  // ---------- caméra
  fovPaysage = 42; baseX = 0;
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const a = w / h;
    this.camera.aspect = a;
    if (a >= 1) {                                          // ordinateur, tablette couchée : le cadrage réglé dans Blender (16:9)
      this.camera.fov = this.fovPaysage;
      this.dist = TUNE.camDist * Math.max(1, 1.5 / a);     // un écran presque carré recule un peu
      this.lookAt.y = TUNE.lookY;
    } else {
      // téléphone debout : la largeur est ce qui manque. On règle la distance pour que le balcon (et un peu d'air) remplisse
      // la largeur de l'écran, puis on remonte le point visé : le sol du balcon descend aux 3/5 de l'écran,
      // le ciel de Paris prend le haut (là où sont les boutons), et on voit beaucoup moins l'immeuble dessous.
      // Tout le balcon en largeur sur un téléphone, c'est 9 m de recul : trop loin. Comme les jeux mobiles, on cadre
      // environ 2,6 m autour du personnage (on le voit bien), la caméra le suit de côté, et glisser le doigt déplace la vue.
      const vfov = 54; this.camera.fov = vfov;
      const largeur = Math.min(2 * LAYOUT.halfW + .6, 3.4);
      const hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(vfov) / 2) * a);
      this.dist = (largeur / 2) / Math.tan(hf);
      this.lookAt.y = TUNE.lookY + this.dist * Math.tan(THREE.MathUtils.degToRad(vfov) / 2) * .2;
    }
    this.camera.updateProjectionMatrix();
  }
  private setupPointer() {
    const el = this.canvas;
    let drag: { x: number; y: number; id: number } | null = null; let moved = 0;
    const pts = new Map<number, { x: number; y: number }>(); let pinch = 0;
    el.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 1) { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; moved = 0; } });
    el.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 1 && drag) {
        const dx = e.clientX - drag.x; moved += Math.abs(dx) + Math.abs(e.clientY - drag.y);
        if (this.enHauteur()) { this.panCible -= dx * this.dist * .0016; this.panMain = performance.now(); }
        else this.yawTarget = THREE.MathUtils.clamp(this.yawTarget - dx * .0035, -.32, .32);
        drag.x = e.clientX; drag.y = e.clientY;
      }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * (pinch / d), .75, this.enHauteur() ? 2.4 : 1.35); pinch = d; }
    });
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (drag && drag.id === e.pointerId) { el.dispatchEvent(new CustomEvent('tapend', { detail: { moved, x: e.clientX, y: e.clientY } })); drag = null; } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * (1 + e.deltaY * .001), .75, 1.35); }, { passive: false });
  }
  applyTune() { this.pitch = TUNE.camPitch; this.lookAt.y = TUNE.lookY; this.resize(); }
  private tmpV = new THREE.Vector3();
  panierDansLaZone() {
    if (this.basket) this.basket.position.copy(BASKET_SPOT);
    return;                                                              // le panier reste exactement au repère de Blender
  }
  /** Où faire passer un dessin DERRIÈRE la fenêtre du fond : 7 m dehors, à hauteur de fenêtre, en travers. */
  fenetreCiel(): { centre: THREE.Vector3; dehors: THREE.Vector3; travers: THREE.Vector3; largeur: number } | null {
    const f = this.fenetres[0]; if (!f || !this.hasRoom) return null;
    const dehors = new THREE.Vector3(Math.sin(f.dehors), 0, Math.cos(f.dehors));
    const centre = f.pos.clone().addScaledVector(dehors, 1.05).setY(FL + f.h);
    return { centre, dehors, travers: f.axe.clone().normalize(), largeur: f.largeur };
  }
  /** La chaise du balcon toujours posée sur le balcon : si son repère tombe dans un mur ou sur la rambarde, on la ramène dedans. */
  perso = ''; private decaleMarcel = false;
  chaiseDansLaZone() {
    if (this.chair) { this.chair.position.copy(CHAIR_SPOT.pos); this.chair.rotation.y = CHAIR_SPOT.face; }
    return;                                                              // la chaise reste exactement au repère de Blender
  }
  /** Le vrai sol sous les pieds : on lance quelques rayons vers le bas sur la ligne du balcon et dans la pièce, et on garde
   *  la surface la plus haute proche de la dalle (terrasse en bois, tapis…). Le jeu pose le personnage dessus. */
  solBalcon = 0; solPiece = 0;
  solAuPoint(p: THREE.Vector3): number {
    const ray = new THREE.Raycaster(new THREE.Vector3(p.x, FL + .35, p.z), new THREE.Vector3(0, -1, 0), 0, .6);
    const sols: THREE.Mesh[] = [];
    this.envGroup.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && /floor|parquet|deck|rug|tapis/i.test(m.name)) sols.push(m); });
    const contact = ray.intersectObjects(sols, false)[0];
    return contact?.point.y ?? FL + (p.z < FACADE_FRONT - .1 ? this.solPiece : this.solBalcon);
  }
  mesurerSol() {
    const ray = new THREE.Raycaster(); const bas = new THREE.Vector3(0, -1, 0);
    this.envGroup.updateMatrixWorld(true);
    const hauteur = (x: number, z: number) => {
      ray.set(new THREE.Vector3(x, FL + 1.2, z), bas); ray.far = 1.6;
      const h = ray.intersectObject(this.envGroup, true).filter(i => i.point.y > FL - .12 && i.point.y < FL + .25 && (!i.face || i.face.normal.clone().transformDirection(i.object.matrixWorld).y > .6));
      return h.length ? h[0].point.y - FL : null;
    };
    const mediane = (v: number[]) => { const t = v.sort((a, b) => a - b); return t.length ? t[t.length >> 1] : 0; };
    const bal: number[] = [], pie: number[] = [];
    for (let i = 0; i < 9; i++) {
      const x = (i / 8 - .5) * 2 * LAYOUT.halfW * .8;
      const hb = hauteur(x, LAYOUT.corridorZ); if (hb !== null) bal.push(hb);
      const hp = hauteur(x, this.insideSpot.z); if (hp !== null) pie.push(hp);
    }
    this.solBalcon = THREE.MathUtils.clamp(mediane(bal), -.08, .2);
    this.solPiece = THREE.MathUtils.clamp(mediane(pie), -.08, .2);
    // LES MURS DE CÔTÉ DU BALCON : on lance des rayons vers la gauche et la droite ; un mur arrête les rayons à toutes les
    // hauteurs (un meuble bas, seulement en bas). La zone de marche, la chaise et le panier restent entre ces murs.
    const cote = (sx: number) => {
      let d = Infinity;
      for (const z of [LAYOUT.corridorZ, (LAYOUT.corridorZ + LAYOUT.frontZ) / 2, (LAYOUT.corridorZ + LAYOUT.backZ) / 2, LAYOUT.frontZ - .25]) {
        let loin = 0;
        for (const hy of [.7, 1.3, 1.9]) {
          ray.set(new THREE.Vector3(0, FL + hy, z), new THREE.Vector3(sx, 0, 0)); ray.far = LAYOUT.halfW + 1;
          const h = ray.intersectObject(this.envGroup, true)[0];
          loin = Math.max(loin, h ? h.distance : LAYOUT.halfW + 1);
        }
        d = Math.min(d, loin);
      }
      return d;
    };
    // la chaise et le panier : un rayon depuis le milieu du balcon, à LEUR profondeur, vers leur côté ; s'ils sont dans le mur
    // (ou le pilier), on les ramène juste devant
    const recaler = (p: THREE.Vector3, r: number, nom: string) => {
      // Rayons depuis le milieu du balcon vers le côté de l'objet, à hauteur d'homme (1,3 à 1,9 m : au-dessus des barreaux
      // de la rambarde, mais en plein dans un mur ou un pilier), contre TOUT ce qui est solide dans la scène (sauf la chaise,
      // le panier et les pots eux-mêmes). Si un mur est plus près que le bord de l'objet, on le ramène devant.
      const sx = Math.sign(p.x) || 1, d: number[] = [];
      const exclus = new Set<THREE.Object3D>([this.chair, this.basket].filter(Boolean) as THREE.Object3D[]);
      // Le personnage et les volumes de clic ne sont pas des murs. Le rayon
      // précédent frappait notamment Marcel à 58 cm et ramenait sa chaise
      // de 2,78 m à 20 cm du centre du balcon.
      const cibles = [this.envGroup];
      ray.camera = this.camera;
      for (const hy of [1.3, 1.6, 1.9]) {
        ray.set(new THREE.Vector3(0, FL + hy, p.z), new THREE.Vector3(sx, 0, 0)); ray.far = Math.abs(p.x) + 1.5;
        let touches: THREE.Intersection[] = [];
        try { touches = ray.intersectObjects(cibles, true); } catch (e) { console.warn('[murs] rayon impossible', e); }
        const h = touches.find(i => { let o: THREE.Object3D | null = i.object; while (o) { if (!o.visible || exclus.has(o) || o.userData?.pot) return false; o = o.parent; } return (i.object as THREE.Mesh).isMesh && !(i.object as THREE.SkinnedMesh).isSkinnedMesh; });
        d.push(h ? h.distance : Infinity);
      }
      d.sort((a, b) => a - b); const mur = d[1];                         // la médiane des trois : un mur arrête les trois rayons
      console.info(`[${nom}] à ${Math.abs(p.x).toFixed(2)} m du milieu, mur à ${isFinite(mur) ? mur.toFixed(2) + ' m' : 'aucun'}`);
      if (mur < Math.abs(p.x) + r) { const avant = p.x; p.x = sx * Math.max(0, mur - r - .05); console.info(`[${nom}] sortie du mur : ${(Math.abs(avant - p.x) * 100).toFixed(0)} cm`); return true; }
      return false;
    };
    if (recaler(CHAIR_SPOT.pos, .32, 'chaise') && this.chair) this.chair.position.copy(CHAIR_SPOT.pos);
    if (recaler(BASKET_SPOT, .28, 'panier') && this.basket) this.basket.position.copy(BASKET_SPOT);
    const g = cote(-1), dr = cote(1), mur = Math.min(g, dr) - .18;
    if (mur < LAYOUT.halfW - .02 && mur > .8) {
      console.info(`[murs] balcon : ${(g).toFixed(2)} m à gauche, ${(dr).toFixed(2)} m à droite → zone de marche ramenée à ±${mur.toFixed(2)} m`);
      LAYOUT.halfW = mur;
      this.chaiseDansLaZone(); this.panierDansLaZone();
    }
    console.info(`[sol] balcon ${(this.solBalcon * 100).toFixed(1)} cm, pièce ${(this.solPiece * 100).toFixed(1)} cm au-dessus de la dalle`);
  }
  /** Sur téléphone seulement : la caméra se place pour VOIR le personnage. Si un mur le cache (dans le fauteuil, au fond de
   *  la pièce…), on cherche, en glissant la vue de côté, la position la plus proche d'où l'on voit sa tête par l'ouverture. */
  private panVisible: number | null = null;
  private derniereVue = 0;
  voirLaTete(tete: THREE.Vector3) {
    if (!this.enHauteur() || this.suivreX === null) { this.panVisible = null; return; }
    const now = performance.now(); if (now - this.derniereVue < 200) return; this.derniereVue = now;
    const voulu = THREE.MathUtils.clamp(this.suivreX - this.baseX, -this.panMax, this.panMax);
    const ray = new THREE.Raycaster(); ray.camera = this.camera;
    const libre = (pan: number) => {
      const cam = this.camera.position.clone().add(new THREE.Vector3(pan - this.panX, 0, 0));
      const d = tete.clone().sub(cam), L = d.length(); d.normalize();
      ray.set(cam, d); ray.near = .1; ray.far = L - .3;
      try { return !ray.intersectObject(this.envGroup, true).some(h => (h.object as THREE.Mesh).isMesh); } catch { return true; }
    };
    if (libre(voulu)) { this.panVisible = voulu; return; }
    for (let k = 1; k <= 10; k++) {                                       // de 25 en 25 cm, d'un côté puis de l'autre
      for (const sgn of [1, -1]) {
        const c = voulu + sgn * k * .25;
        if (Math.abs(c) > this.panMax + .01) continue;
        if (libre(c)) { this.panVisible = c; return; }
      }
    }
    this.panVisible = voulu;                                              // rien de dégagé : on reste sur lui
  }
  /** Sur un écran en hauteur : où regarder de côté (suivi du personnage, ou glissé au doigt). */
  enHauteur() { return this.camera.aspect < 1; }
  suivreX: number | null = null;          // la position du personnage, donnée par le jeu
  private panX = 0; private panCible = 0; private panMain = 0;
  private get panMax() { return Math.max(0, LAYOUT.halfW + .2 - 1.3); }
  ciel: Ciel | null = null;
  update(dt: number) {
    this.world_dt = dt;
    (this.ciel ??= new Ciel(this.scene, () => this.night, this.camera, () => this.fenetreCiel())).update();
    if (this.enHauteur()) {
      if (this.suivreX !== null && performance.now() - this.panMain > 4000) this.panCible = this.panVisible ?? (this.suivreX - this.baseX);   // on suit le personnage, là où on le voit
      this.panCible = THREE.MathUtils.clamp(this.panCible, -this.panMax, this.panMax);
      this.panX += (this.panCible - this.panX) * Math.min(1, dt * 3);
      this.lookAt.x = this.baseX + this.panX;
    } else if (this.panX !== 0) { this.panX = 0; this.lookAt.x = this.baseX; }
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 6);
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 3);
    this.night += (this.targetNight - this.night) * Math.min(1, dt * 1.2);
    this.applyNight();
    const d = this.dist * this.zoom;
    this.camera.position.set(this.lookAt.x + d * Math.sin(this.yaw) * Math.cos(this.pitch), this.lookAt.y + d * Math.sin(this.pitch), this.lookAt.z + d * Math.cos(this.yaw) * Math.cos(this.pitch));
    this.camera.lookAt(this.lookAt);
    if (this.layers) { // parallaxe : le proche bouge plus que le lointain
      this.layers.nearDay.rotation.y = this.layers.nearNight.rotation.y = -this.yaw * .35;
      this.layers.farDay.rotation.y = this.layers.farNight.rotation.y = -this.yaw * .18;
    }
    if (this.doorsOpen !== this.doorsTarget) {
      this.doorsOpen += (this.doorsTarget - this.doorsOpen) * Math.min(1, dt * 3.5);
      if (Math.abs(this.doorsOpen - this.doorsTarget) < .01) this.doorsOpen = this.doorsTarget;
      for (const d of this.doors) d.o.rotation.y = d.open * this.doorsOpen;
    }
    if (this.sky) { this.sky.update(dt, this.night); this.sky.group.position.x = -this.yaw * 2.5;
    }
  }
  // ---------- petite vie sur le balcon : deux papillons, une abeille
  critters: { s: THREE.Sprite; t: number; cx: number; cz: number; r: number; speed: number; h: number }[] = [];
  addCritters() {
    const tex = (draw: (c: CanvasRenderingContext2D) => void) => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; draw(cv.getContext('2d')!); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const butterfly = (col: string) => tex(c => { c.fillStyle = col; c.beginPath(); c.ellipse(20, 30, 14, 20, -.5, 0, 6.29); c.fill(); c.beginPath(); c.ellipse(44, 30, 14, 20, .5, 0, 6.29); c.fill(); c.fillStyle = '#2b2b2b'; c.fillRect(30, 14, 4, 34); });
    const bee = tex(c => { c.fillStyle = '#f2c23a'; c.beginPath(); c.ellipse(32, 36, 16, 11, 0, 0, 6.29); c.fill(); c.fillStyle = '#2b2b2b'; c.fillRect(24, 26, 4, 20); c.fillRect(34, 26, 4, 20); c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(28, 20, 9, 6, -.4, 0, 6.29); c.fill(); c.beginPath(); c.ellipse(40, 20, 9, 6, .4, 0, 6.29); c.fill(); });
    const mk = (t: THREE.Texture, size: number, cx: number, cz: number, r: number, speed: number, h: number) => { const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }); const sp = new THREE.Sprite(m); sp.scale.set(size, size, 1); this.scene.add(sp); this.critters.push({ s: sp, t: Math.random() * 10, cx, cz, r, speed, h }); };
    mk(butterfly('#f0b52e'), .16, -1.0, .3, .9, .7, FL + .7); mk(butterfly('#8e9be0'), .14, 1.0, .1, 1.1, .55, FL + .8); mk(bee, .1, 0, -.3, .6, 1.6, FL + .55);
  }
  private updateCritters(dt: number) {
    for (const c of this.critters) {
      c.t += dt * c.speed;
      c.s.position.set(c.cx + Math.cos(c.t) * c.r + Math.sin(c.t * 3.1) * .12, c.h + Math.sin(c.t * 2.3) * .18 + Math.sin(c.t * 7) * .03, c.cz + Math.sin(c.t * .8) * c.r * .6);
      (c.s.material as THREE.SpriteMaterial).opacity = 1 - this.night * .8;
    }
  }
  render() { this.updateCritters(this.world_dt); this.renderer.render(this.scene, this.camera); }
  private world_dt = 0;

  /** Quel pot est sous le doigt ? */
  private ray = new THREE.Raycaster();
  pick(x: number, y: number): { slot: number } | { deco: string } | null {
    const v = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const hits = this.ray.intersectObjects([...this.potGroup.children, ...this.decoGroup.children], true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o.userData.slot !== undefined) return { slot: o.userData.slot as number };
        if (o.userData.item !== undefined) return { deco: o.userData.item as string };
        o = o.parent;
      }
    }
    return null;
  }
  /** Position écran d'un point 3D (pour les bulles). */
  toScreen(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    this.tmpV.copy(p).project(this.camera);
    return { x: (this.tmpV.x + 1) / 2 * window.innerWidth, y: (1 - this.tmpV.y) / 2 * window.innerHeight, visible: this.tmpV.z < 1 };
  }
}

// ------------------------------------------------------------------ objets en main et panneau de réglage (?tune=1)

export interface HandOffsets { pos: [number, number, number]; rot: [number, number, number]; scale: number }
export const HAND: Record<'can' | 'seeds', HandOffsets> = {
  can:   { pos: [0.0, -0.03, 0.03], rot: [0.0, 0.0, 0.0], scale: 0.5 },
  seeds: { pos: [0.0, 0.0, 0.03], rot: [1.57, 0.0, 0.0], scale: 0.9 },
};

export function mountTunePanel(hooks: { applyCamera(): void; applyHand(): void; holdCan(): void; sit(): void }) {
  const box = document.createElement('div');
  box.id = 'tune';
  box.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:50;background:rgba(255,255,255,.92);border:1px solid #ccc;border-radius:12px;padding:8px 10px;font:12px/1.3 system-ui;max-height:70vh;overflow:auto;width:260px;box-shadow:0 8px 24px rgba(0,0,0,.2)';
  const row = (label: string, get: () => number, set: (v: number) => void, min: number, max: number, step = .01) => {
    const r = document.createElement('div'); r.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0';
    const l = document.createElement('span'); l.textContent = label; l.style.width = '78px';
    const i = document.createElement('input'); i.type = 'range'; i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(get()); i.style.flex = '1';
    const v = document.createElement('span'); v.textContent = get().toFixed(2); v.style.width = '40px';
    i.oninput = () => { set(parseFloat(i.value)); v.textContent = parseFloat(i.value).toFixed(2); };
    r.append(l, i, v); box.appendChild(r);
  };
  const title = (s: string) => { const h = document.createElement('div'); h.textContent = s; h.style.cssText = 'font-weight:700;margin:6px 0 2px'; box.appendChild(h); };
  title('Caméra');
  row('inclinaison', () => TUNE.camPitch, v => { TUNE.camPitch = v; hooks.applyCamera(); }, .1, 1.1);
  row('distance', () => TUNE.camDist, v => { TUNE.camDist = v; hooks.applyCamera(); }, 3.5, 10, .1);
  row('hauteur visée', () => TUNE.lookY, v => { TUNE.lookY = v; hooks.applyCamera(); }, .5, 5, .05);
  title('Assise');
  row('recul', () => TUNE.sitForward, v => { TUNE.sitForward = v; }, -.2, .7);
  row('hauteur', () => TUNE.sitDown, v => { TUNE.sitDown = v; }, -.3, .3);
  const sitBtn = document.createElement('button'); sitBtn.textContent = 'Asseoir maintenant'; sitBtn.onclick = () => hooks.sit(); box.appendChild(sitBtn);
  for (const kind of ['can', 'seeds'] as const) {
    title(kind === 'can' ? 'Arrosoir en main' : 'Paquet de graines en main');
    const h = HAND[kind];
    (['x', 'y', 'z'] as const).forEach((a, i) => row('pos ' + a, () => h.pos[i], v => { h.pos[i] = v; hooks.applyHand(); }, -.4, .4));
    (['x', 'y', 'z'] as const).forEach((a, i) => row('rot ' + a, () => h.rot[i], v => { h.rot[i] = v; hooks.applyHand(); }, -3.15, 3.15));
    row('échelle', () => h.scale, v => { h.scale = v; hooks.applyHand(); }, .1, 1.5);
  }
  const holdBtn = document.createElement('button'); holdBtn.textContent = 'Tenir l\'arrosoir (test)'; holdBtn.onclick = () => hooks.holdCan(); box.appendChild(holdBtn);
  const copy = document.createElement('button'); copy.textContent = 'Copier les valeurs'; copy.style.marginLeft = '6px';
  copy.onclick = () => { const txt = JSON.stringify({ TUNE, HAND }, null, 1); navigator.clipboard?.writeText(txt); copy.textContent = 'Copié !'; setTimeout(() => copy.textContent = 'Copier les valeurs', 1500); };
  box.appendChild(copy);
  document.body.appendChild(box);
}
