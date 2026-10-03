import * as THREE from 'three';
import { Assets, type CharacterAsset } from './assets';

export interface Reglages {
  vitesse?: number; walk_timescale?: number;
  gestes?: Record<string, { anim: string; debut: number; fin: number; effet: number; distance: number; cote?: number }>;
  assis?: { anim: string; installe_a: number; cuisses_z: number; chaise_ok?: boolean };
  sur_place?: string[];
  couche?: { anim: string; installe_a: number; dos_z: number };
}

// Si une animation manque dans le .glb, on prend la suivante de la liste.
const FALLBACK: Record<string, string[]> = {
  idle: ['idle'],
  walk: ['walk', 'walk_stop', 'run'],
  plant: ['plant', 'pickup', 'harvest'],
  water: ['water', 'harvest', 'plant'],
  harvest: ['harvest', 'pickup', 'plant'],
  phone: ['phone', 'phone_walk', 'idle'],
  sit: ['sit', 'idle'],
  sleep: ['sleep', 'sleep_2', 'sit', 'idle'],
  dance: ['dance', 'wave', 'idle'],
  pickup: ['pickup', 'harvest', 'plant'],
};

const PINNED = new WeakSet<THREE.AnimationClip>();

export class Character {
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  currentName = '';
  speed = 1.15;
  walkScale = 1;
  /** Réglages mesurés dans Blender (jdp_mesures.py) : gestes, assise, couchage. */
  gestures: Record<string, { anim: string; debut: number; fin: number; effet: number; distance: number; cote?: number }> = {};
  sitCfg: { anim: string; installe_a: number; cuisses_z: number; chaise_ok?: boolean } | null = null;
  sleepCfg: { anim: string; installe_a: number; dos_z: number } | null = null;
  applyMesures(r: Reglages | undefined) {
    if (!r) return;
    if (r.vitesse) this.speed = r.vitesse;
    if (r.walk_timescale) this.walkScale = r.walk_timescale;
    if (r.gestes) this.gestures = r.gestes;
    if (r.assis) this.sitCfg = r.assis;
    if (r.couche) this.sleepCfg = r.couche;
    console.info(`[anims] ${this.obj.name} : ${[...this.actions.keys()].join(", ")}`);
    const danses = [...this.actions.keys()].filter(k => /^(dance|sport_)(_?\w+)?$/.test(k) || k.startsWith('sport_') || k.startsWith('regard_epaule'));
    for (const n of new Set([...(r.sur_place ?? []), ...danses, 'dance'])) this.pinInPlace(n);   // toutes les danses sur place, pour tous
  }
  /** L'axe vertical du bassin. On le lit sur l'animation de repos (idle) : là, le bassin ne voyage pas, l'axe le plus
   *  éloigné de 0 est forcément la hauteur. Avant, on le devinait sur chaque danse : une danse qui voyage beaucoup
   *  (breakdance, swing) trompait le calcul, on « bloquait » la hauteur au lieu du déplacement… et Jimy glissait. */
  private _axeHaut = -1;
  private axeHaut(): number {
    if (this._axeHaut >= 0) return this._axeHaut;
    return (this._axeHaut = axeVerticalDuBassin(this.obj));
  }
  /** Garde une animation sur place : on retire l'avancée horizontale du bassin (danse qui dérive, téléphone en marchant). */
  private pinInPlace(name: string) {
    const a = this.actions.get(name); if (!a) return;
    const clip = a.getClip();
    if (PINNED.has(clip)) return;
    for (const t of clip.tracks) {
      if (!/hips\.position$/i.test(t.name)) continue;
      const v = t.values, n = v.length / 3;
      const up = this.axeHaut();                               // l'axe vertical, lu une fois pour toutes sur la respiration au repos
      for (const k of [0, 1, 2]) { if (k === up) continue; const v0 = v[k]; for (let i = 0; i < n; i++) v[i * 3 + k] = v0; }
    }
    PINNED.add(clip);
  }
  /** Un geste mesuré : on joue seulement le passage utile, à vitesse normale. Renvoie quand faire l'effet et la fin. */
  geste(name: string, fallbackMax = 3.2): { effet: number; fin: Promise<void> } {
    const g = this.gestures[name];
    const a = g ? (this.actions.get(g.anim) ?? this.resolve(name)) : null;
    if (!g || !a) {
      const effet = name === 'water' ? .7 : name === 'plant' ? .9 : 1.1;
      return { effet, fin: this.once(name, fallbackMax) };
    }
    const len = Math.max(.6, g.fin - g.debut);
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = 1;
    a.time = Math.min(g.debut, a.getClip().duration - .05);
    a.fadeIn(.22).play();
    if (this.current && this.current !== a) this.current.fadeOut(.22);
    this.current = a; this.currentName = name;
    const fin = new Promise<void>(res => setTimeout(() => { this.play('idle', .3); res(); }, len * 1000));
    return { effet: Math.max(0, g.effet - g.debut), fin };
  }
  busy = false;                         // en train de marcher ou de faire une action
  private walking: { target: THREE.Vector3; face?: number; resolve: () => void } | null = null;
  private fade = { value: 1, target: 1 };
  private meshes: THREE.Mesh[] = [];

  constructor(assets: Assets, asset: CharacterAsset) {
    this.obj = assets.instantiate(asset);
    this.mixer = new THREE.AnimationMixer(this.obj);
    for (const clip of asset.clips) {
      const a = this.mixer.clipAction(clip);
      a.enabled = true;
      this.actions.set(clip.name, a);
    }
    this.hanchesRepos = hauteurHanches(this.obj);                     // avant toute animation : la pose de repos
    this.obj.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) this.meshes.push(m); });
    this.play('idle');
  }

  has(name: string) { return this.actions.has(name); }
  /** Emprunter des animations à un autre personnage (même squelette Mixamo). Le déplacement du bassin est mis à
   *  l'échelle de ce personnage : sans ça, une animation venue d'un plus grand lui enfonce les pieds dans le sol. */
  private hanchesRepos = 0;
  preter(source: CharacterAsset, noms: string[], remplacer = false): string[] {
    const axeMoi = this.axeHaut(), axeLui = axeVerticalDuBassin(source.scene);
    const hMoi = hauteurBassinIdle([...this.actions.values()].map(a => a.getClip()), axeMoi), hLui = hauteurBassinIdle(source.clips, axeLui);
    const ratio = hMoi > 0 && hLui > 0 ? hMoi / hLui : 1;
    console.info(`[anims] emprunt : bassin ${hMoi.toFixed(2)} (moi) / ${hLui.toFixed(2)} (lui) → ×${ratio.toFixed(3)}, axes ${axeMoi}/${axeLui}`);
    const faits: string[] = [];
    for (const n of noms) {
      const clip = source.clips.find(c => c.name === n); if (!clip) continue;
      if (this.actions.has(n) && !remplacer) continue;
      const c2 = clip.clone();
      for (const tr of c2.tracks) if (/hips\.position$/i.test(tr.name)) {
        const v = tr.values, n = v.length / 3;
        for (let i = 0; i < n; i++) { const t = [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]].map(x => x * ratio); const out = [0, 0, 0]; out[axeMoi] = t[axeLui]; const autres = [0, 1, 2].filter(k => k !== axeMoi), src = [0, 1, 2].filter(k => k !== axeLui); out[autres[0]] = t[src[0]]; out[autres[1]] = t[src[1]]; v[i * 3] = out[0]; v[i * 3 + 1] = out[1]; v[i * 3 + 2] = out[2]; }
      }
      const ancien = this.actions.get(n);
      if (ancien) { ancien.stop(); this.mixer.uncacheAction(ancien.getClip()); }
      const a = this.mixer.clipAction(c2); a.enabled = true; this.actions.set(n, a);
      if (/^(dance|sport_)|regard_epaule/.test(n)) this.pinInPlace(n);
      faits.push(n);
    }
    return faits;
  }
  /** Retirer des animations abîmées (elles ne seront plus jamais jouées). */
  exclure(noms: string[]) { for (const n of noms) { const a = this.actions.get(n); if (a) { a.stop(); this.actions.delete(n); } } }
  /** Le nom de toutes les animations de ce personnage (pour la revue des animations). */
  nomsAnimations(): string[] { return [...this.actions.keys()]; }
  /** Toutes les variantes d'une animation : dance, dance_2, dance_3… (téléchargées en plus sur Mixamo). */
  variantes(base: string): string[] { return [...this.actions.keys()].filter(k => k === base || new RegExp(`^${base}_[a-z0-9_]+$`).test(k)); }
  /** Un os du squelette par la fin de son nom (Hips, Head, RightHand…). */
  bone(suffix: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    this.obj.traverse(o => { if (!found && (o as THREE.Bone).isBone && o.name.endsWith(suffix)) found = o; });
    return found;
  }
  private resolve(name: string): THREE.AnimationAction | null {
    for (const n of FALLBACK[name] ?? [name]) { const a = this.actions.get(n); if (a) return a; }
    if (name === 'dance') { const v = this.variantes('dance')[0]; if (v) return this.actions.get(v)!; }   // sa danse retirée : une autre
    return this.actions.values().next().value ?? null;
  }

  private breathing = false;
  private breathT = 0;
  /** Joue une animation en boucle (idle, walk, sit, sleep, phone, dance). */
  play(name: string, fadeSec = .22, timeScale = 1) {
    this.breathing = false;
    if (name === 'walk') timeScale *= this.walkScale;
    if (name === 'sit' && this.sitCfg && this.actions.has(this.sitCfg.anim)) name = this.sitCfg.anim;
    if (name === 'sleep' && this.sleepCfg && this.actions.has(this.sleepCfg.anim)) name = this.sleepCfg.anim;
    if (name === 'idle' && !this.actions.has('idle')) {
      // pas d'idle dans le .glb : on fige la marche sur son premier pas (pose debout) et on fait respirer le personnage
      const w = this.actions.get('walk') ?? this.actions.get('walk_stop');
      if (w) { w.reset().setLoop(THREE.LoopRepeat, Infinity); w.timeScale = 0; w.time = 0; w.fadeIn(fadeSec).play(); if (this.current && this.current !== w) this.current.fadeOut(fadeSec); this.current = w; this.currentName = 'idle'; this.breathing = true; }
      return;
    }
    const a = this.resolve(name);
    if (!a) return;
    if (this.current === a && this.currentName === name) return;
    a.reset().setLoop(THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = false;
    a.timeScale = timeScale;
    a.fadeIn(fadeSec).play();
    if (this.current && this.current !== a) this.current.fadeOut(fadeSec);
    this.current = a; this.currentName = name;
  }

  /** Joue une action une fois (plant, water, harvest, pickup) et rend la main à la fin. */
  /** La durée d'une animation (en secondes), 0 si elle n'existe pas. */
  clipDuree(name: string): number { const a = this.resolve(name); return a ? a.getClip().duration : 0; }
  once(name: string, maxSec = 4): Promise<void> {
    const a = this.resolve(name);
    if (!a) return Promise.resolve();
    return new Promise(res => {
      const dur = Math.min(a.getClip().duration, maxSec);
      a.reset().setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.timeScale = a.getClip().duration > maxSec ? a.getClip().duration / maxSec : 1;
      a.fadeIn(.18).play();
      if (this.current && this.current !== a) this.current.fadeOut(.18);
      this.current = a; this.currentName = name;
      const done = () => { this.play('idle', .25); res(); };
      setTimeout(done, dur * 1000 + 80);
    });
  }

  /** Marche en ligne droite jusqu'au point, puis se tourne vers `face` (angle Y). */
  goTo(target: THREE.Vector3, face?: number): Promise<void> {
    const d = target.clone().sub(this.obj.position);
    d.y = 0;
    if (d.length() < .05) {
      if (face !== undefined) this.obj.rotation.y = face;
      return Promise.resolve();
    }
    this.busy = true;
    this.play('walk');
    if (this.walking) { const w = this.walking; this.walking = null; w.resolve(); }   // nouvelle destination : on libère l'ancienne promesse
    return new Promise(res => { this.walking = { target: target.clone(), face, resolve: res }; });
  }

  /** Va quelque part, fait une action, revient en idle. */
  async act(target: THREE.Vector3, face: number, action: string, maxSec = 3.5) {
    await this.goTo(target, face);
    this.busy = true;
    await this.once(action, maxSec);
    this.busy = false;
  }

  teleport(p: THREE.Vector3, face?: number) {
    this.obj.position.copy(p);
    if (face !== undefined) this.obj.rotation.y = face;
  }
  setFade(target: number) { this.fade.target = target; }

  /** Les mains peuvent suivre des cibles dans le monde (remuer la poêle, saupoudrer), par-dessus l'animation en cours. */
  mains: { droite?: () => THREE.Vector3; gauche?: () => THREE.Vector3 } | null = null;
  private ikPoids = 0; ikBut = 0;
  private ikOs: Record<string, THREE.Object3D | null> = {};
  private os(n: string) { return (this.ikOs[n] ??= this.bone(n)); }
  /** IK à deux os, exacte, avec un « pôle » : le coude part vers le bas, un peu vers l'extérieur et un peu vers l'arrière,
   *  comme un vrai bras (l'ancienne méthode pouvait plier le coude à l'envers). */
  private chaineIK(cote: 'Right' | 'Left', cible: THREE.Vector3, poids: number) {
    const bras = this.os(cote + 'Arm'), avant = this.os(cote + 'ForeArm'), main = this.os(cote + 'Hand');
    if (!bras || !avant || !main) return;
    const S = new THREE.Vector3(), E0 = new THREE.Vector3(), W0 = new THREE.Vector3();
    bras.getWorldPosition(S); avant.getWorldPosition(E0); main.getWorldPosition(W0);
    const a = S.distanceTo(E0), b = E0.distanceTo(W0);
    if (a < 1e-4 || b < 1e-4) return;
    const ST = cible.clone().sub(S); const d = THREE.MathUtils.clamp(ST.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
    const dir = ST.normalize();
    // le pôle : bas + extérieur + arrière, dans le repère du personnage
    const fw = new THREE.Vector3(Math.sin(this.obj.rotation.y), 0, Math.cos(this.obj.rotation.y));
    const droite = new THREE.Vector3(-fw.z, 0, fw.x).multiplyScalar(cote === 'Right' ? 1 : -1);
    const pole = new THREE.Vector3(0, -1, 0).addScaledVector(droite, .55).addScaledVector(fw, -.35);
    const pp = pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();   // le pôle, dans le plan perpendiculaire à l'axe épaule → cible
    const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const coude = S.clone().addScaledVector(dir, a * cosA).addScaledVector(pp, a * Math.sqrt(1 - cosA * cosA));
    const tourner = (os: THREE.Object3D, de: THREE.Vector3, vers: THREE.Vector3) => {
      const q = new THREE.Quaternion().setFromUnitVectors(de.normalize(), vers.normalize());
      const bq = new THREE.Quaternion(), pq = new THREE.Quaternion();
      os.getWorldQuaternion(bq); os.parent!.getWorldQuaternion(pq);
      os.quaternion.slerp(pq.invert().multiply(q.multiply(bq)), poids);
      os.updateMatrixWorld(true);
    };
    tourner(bras, E0.clone().sub(S), coude.clone().sub(S));                         // le bras : l'épaule vise le coude voulu
    avant.getWorldPosition(E0); main.getWorldPosition(W0);
    tourner(avant, W0.clone().sub(E0), cible.clone().sub(E0));                      // l'avant-bras : le coude vise la cible
  }
  /** Le regard : la tête (et un peu le cou) se tournent doucement vers un point du monde, dans des limites naturelles. */
  regard: THREE.Vector3 | null = null;
  private regardPoids = 0;
  private dernierRegard = new THREE.Vector3();
  private tournerTete(dt: number) {
    const but = this.regard ? 1 : 0;
    this.regardPoids += (but - this.regardPoids) * Math.min(1, dt * 2.5);         // entrée et sortie en douceur
    if (this.regardPoids < .01) return;
    if (this.regard) this.dernierRegard.lerp(this.regard, Math.min(1, dt * 4));      // la cible glisse, la tête ne saute pas
    const tete = this.os('Head'), cou = this.os('Neck');
    if (!tete) return;
    this.obj.updateMatrixWorld(true);
    const tp = new THREE.Vector3(); tete.getWorldPosition(tp);
    const avant = new THREE.Vector3(Math.sin(this.obj.rotation.y), 0, Math.cos(this.obj.rotation.y));
    let dir = this.dernierRegard.clone().sub(tp); if (dir.lengthSq() < 1e-4) return; dir.normalize();
    // limites : 65° de côté, 30° en haut ou en bas
    const yaw = THREE.MathUtils.clamp(Math.atan2(dir.x, dir.z) - Math.atan2(avant.x, avant.z), -Math.PI, Math.PI);
    const yawL = THREE.MathUtils.clamp(((yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1.13, 1.13);
    const pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)), -.52, .52);
    const r0 = Math.atan2(avant.x, avant.z) + yawL;
    dir = new THREE.Vector3(Math.sin(r0) * Math.cos(pitch), Math.sin(pitch), Math.cos(r0) * Math.cos(pitch));
    const q = new THREE.Quaternion().setFromUnitVectors(avant, dir);
    for (const [b, part] of [[cou, .35], [tete, .65]] as [THREE.Object3D | null, number][]) {
      if (!b) continue;
      const bq = new THREE.Quaternion(), pq = new THREE.Quaternion();
      b.getWorldQuaternion(bq); b.parent!.getWorldQuaternion(pq);
      const qPart = new THREE.Quaternion().slerp(q, part);
      const local = pq.invert().multiply(qPart.multiply(bq));
      b.quaternion.slerp(local, this.regardPoids);
      b.updateMatrixWorld(true);
    }
  }
  /** Se tourner en douceur, sur place, vers une direction (au lieu de pivoter d'un coup). */
  private faceCible: number | null = null;
  tourner(face: number) { this.faceCible = face; }
  /** Correction des bras : si le squelette venu de Mixamo tient les bras trop hauts dans toutes les animations, on abaisse
   *  les deux bras d'un angle fixe (en degrés) à chaque image, après l'animation. ?bras=35 dans l'adresse pour essayer. */
  brasOffset = 0;
  private abaisserBras() {
    const deg = this.brasOffset; if (!deg) return;
    this.obj.updateMatrixWorld(true);
    const f = new THREE.Vector3(Math.sin(this.obj.rotation.y), 0, Math.cos(this.obj.rotation.y));
    for (const [cote, signe] of [['Left', -1], ['Right', 1]] as [string, number][]) {
      const b = this.os(cote + 'Arm'); if (!b) continue;
      const q = new THREE.Quaternion().setFromAxisAngle(f, signe * THREE.MathUtils.degToRad(deg));
      const bq = new THREE.Quaternion(), pq = new THREE.Quaternion();
      b.getWorldQuaternion(bq); b.parent!.getWorldQuaternion(pq);
      b.quaternion.copy(pq.invert().multiply(q.multiply(bq)));
      b.updateMatrixWorld(true);
    }
  }
  update(dt: number) {
    if (this.faceCible !== null) {
      const d = ((this.faceCible - this.obj.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const pas = Math.sign(d) * Math.min(Math.abs(d), dt * 3.2);
      this.obj.rotation.y += pas; if (Math.abs(d) < .01) this.faceCible = null;
    }
    this.mixer.update(dt);
    this.abaisserBras();
    this.ikPoids += (this.ikBut - this.ikPoids) * Math.min(1, dt * 5);
    if (this.mains && this.ikPoids > .01) {
      this.obj.updateMatrixWorld(true);
      if (this.mains.droite) this.chaineIK('Right', this.mains.droite(), this.ikPoids);
      if (this.mains.gauche) this.chaineIK('Left', this.mains.gauche(), this.ikPoids);
    } else if (this.ikBut === 0 && this.ikPoids <= .01) this.mains = null;
    this.tournerTete(dt);
    if (this.breathing) { this.breathT += dt; const k = 1 + Math.sin(this.breathT * 1.6) * .006; this.obj.scale.set(this.obj.scale.x, this.obj.scale.x * k, this.obj.scale.x); }
    else if (this.obj.scale.y !== this.obj.scale.x) this.obj.scale.y = this.obj.scale.x;
    if (this.walking) {
      const w = this.walking;
      const d = w.target.clone().sub(this.obj.position); d.y = 0;
      const len = d.length();
      const step = this.speed * dt;
      const yawTarget = Math.atan2(d.x, d.z);
      let dy = yawTarget - this.obj.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.obj.rotation.y += dy * Math.min(1, dt * 10);
      if (len <= step) {
        this.obj.position.x = w.target.x; this.obj.position.z = w.target.z; this.obj.position.y = w.target.y;
        if (w.face !== undefined) this.obj.rotation.y = w.face;
        this.walking = null;
        this.busy = false;
        this.play('idle');
        w.resolve();
      } else {
        d.normalize().multiplyScalar(step);
        this.obj.position.add(d);
      }
    }
    if (this.fade.value !== this.fade.target) {
      this.fade.value += (this.fade.target - this.fade.value) * Math.min(1, dt * 8);
      if (Math.abs(this.fade.value - this.fade.target) < .01) this.fade.value = this.fade.target;
      this.obj.scale.setScalar(this.obj.scale.x || 1);
      for (const m of this.meshes) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) { mat.transparent = this.fade.value < 1; mat.opacity = this.fade.value; }
      }
    }
  }
}

/** La hauteur du bassin (os « Hips ») dans la pose de repos, dans le repère du squelette. */
function hauteurHanches(racine: THREE.Object3D): number {
  let h = 0;
  racine.traverse(o => { if (!h && (o as THREE.Bone).isBone && /Hips$/.test(o.name)) h = Math.abs(o.position.y) || o.position.length(); });
  return h;
}
/** Quel axe local du bassin pointe vers le haut : on transforme le « haut » du monde dans le repère du parent du bassin. */
function axeVerticalDuBassin(racine: THREE.Object3D): number {
  let hips: THREE.Object3D | null = null;
  racine.traverse(o => { if (!hips && (o as THREE.Bone).isBone && /Hips$/.test(o.name)) hips = o; });
  const parent = (hips as THREE.Object3D | null)?.parent; if (!parent) return 1;
  parent.updateWorldMatrix(true, false);
  const q = new THREE.Quaternion(); parent.getWorldQuaternion(q);
  const haut = new THREE.Vector3(0, 1, 0).applyQuaternion(q.invert());
  const c = [Math.abs(haut.x), Math.abs(haut.y), Math.abs(haut.z)];
  return c.indexOf(Math.max(...c));
}
/** La hauteur du bassin au repos, lue sur la première image de « idle » (dans les unités des animations). */
function hauteurBassinIdle(clips: THREE.AnimationClip[], axe: number): number {
  const c = clips.find(x => x.name === 'idle') ?? clips.find(x => /hips\.position$/i.test(x.tracks[0]?.name ?? '')) ?? clips[0];
  const t = c?.tracks.find(tr => /hips\.position$/i.test(tr.name)); if (!t) return 0;
  return Math.abs(t.values[axe]);
}
