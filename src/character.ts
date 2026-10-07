import * as THREE from 'three';
import { Assets, type CharacterAsset } from './assets';
import { BIBLIO } from './bibliotheque';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

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
  private actionEpoch = 0;
  currentName = '';
  speed = 1.15;
  walkScale = 1;
  /** Réglages mesurés dans Blender (jdp_mesures.py) : gestes, assise, couchage. */
  gestures: Record<string, { anim: string; debut: number; fin: number; effet: number; distance: number; cote?: number }> = {};
  sitCfg: { anim: string; installe_a: number; cuisses_z: number; chaise_ok?: boolean } | null = null;
  sleepCfg: { anim: string; installe_a: number; dos_z: number } | null = null;
  applyMesures(r: Reglages | undefined) {
    if (!r) return;
    if (r.vitesse && !this.deLaBibliotheque) this.speed = r.vitesse;
    if (r.walk_timescale && !this.deLaBibliotheque) this.walkScale = r.walk_timescale;
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
  private trajetsHanches = new Map<string, { temps: number[]; valeurs: number[] }>();
  private pinInPlace(name: string) {
    const a = this.actions.get(name); if (!a) return;
    const clip = a.getClip();
    if (PINNED.has(clip)) return;
    if (/^(sit_down|stand_up)$/.test(name)) {
      const t = clip.tracks.find(t => /hips\.position$/i.test(t.name));
      if (t) this.trajetsHanches.set(name, { temps: Array.from(t.times), valeurs: Array.from(t.values) });
    }
    for (const t of clip.tracks) {
      if (!/hips\.position$/i.test(t.name)) continue;
      const v = t.values, n = v.length / 3;
      const up = this.axeHaut();                               // l'axe vertical, lu une fois pour toutes sur la respiration au repos
      for (const k of [0, 1, 2]) { if (k === up) continue; const v0 = v[k]; for (let i = 0; i < n; i++) v[i * 3 + k] = v0; }
    }
    // Les jambes du repos déplacent encore les pieds de 9 cm, même bassin fixe.
    if (/^idle(?:_\d+)?$/.test(name)) for (const t of clip.tracks) {
      if (/hips\.position$/i.test(t.name)) {
        const p = Array.from(t.values.slice(0, 3));
        for (let i = 0; i < t.values.length; i += 3) t.values.set(p, i);
      } else if (/(?:hips|(?:left|right)(?:upleg|leg|foot|toebase))\.quaternion$/i.test(t.name)) {
        const q = Array.from(t.values.slice(0, 4));
        for (let i = 0; i < t.values.length; i += 4) t.values.set(q, i);
      } else if (/(?:left|right)(?:shoulder|arm|forearm|hand)\.quaternion$/i.test(t.name)) {
        // Le repos garde un léger mouvement, sans haussement d'épaules ni balancier des bras.
        const repos = new THREE.Quaternion().fromArray(t.values).normalize(), q = new THREE.Quaternion();
        const amplitude = /shoulder\.quaternion$/i.test(t.name) ? .08 : .12;
        for (let i = 0; i < t.values.length; i += 4) q.fromArray(t.values, i).normalize().slerp(repos, 1 - amplitude).toArray(t.values, i);
      } else if (/(?:spine\d*|neck|head)\.quaternion$/i.test(t.name)) {
        const repos = new THREE.Quaternion().fromArray(t.values), q = new THREE.Quaternion();
        for (let i = 0; i < t.values.length; i += 4) q.fromArray(t.values, i).slerp(repos, .90).toArray(t.values, i);
      }
    }
    PINNED.add(clip);
  }
  /** Un geste mesuré : on joue seulement le passage utile, à vitesse normale. Renvoie quand faire l'effet et la fin. */
  geste(name: string, fallbackMax = 3.2): { effet: number; fin: Promise<void> } {
    this.annulerVirage();
    const g = this.gestures[name];
    const a = g ? (this.actions.get(g.anim) ?? this.resolve(name)) : null;
    if (!g || !a) {
      const effet = name === 'water' ? .7 : name === 'plant' ? .9 : 1.1;
      return { effet, fin: this.once(name, fallbackMax) };
    }
    const len = Math.max(.6, g.fin - g.debut);
    if (this.deLaBibliotheque && /^(plant|harvest|pickup|water)$/.test(name)) this.fixerAppuis();
    this.raccorderPose(.35);
    this.dernierGeste = name; this.appuisFin = 0;
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = 1;
    a.time = Math.min(g.debut, a.getClip().duration - .05);
    a.fadeIn(.22).play();
    if (this.current && this.current !== a) this.current.fadeOut(.22);
    this.current = a; this.currentName = name;
    const epoch = ++this.actionEpoch;
    const fin = this.attendreAnimation(len, epoch, true);
    return { effet: Math.max(0, g.effet - g.debut), fin };
  }
  busy = false;                         // en train de marcher ou de faire une action
  private virage: { debut: number; delta: number; duree: number; t: number; fin: boolean; occupeAvant: boolean; pas: number; phase: number; poseJambes: Map<string, THREE.Quaternion>; appuis: { cote: 'Right' | 'Left'; p: THREE.Vector3; q: THREE.Quaternion; localP: THREE.Vector3; localQ: THREE.Quaternion }[]; departP: THREE.Vector3; departQ: THREE.Quaternion; cibleP: THREE.Vector3; cibleQ: THREE.Quaternion } | null = null;
  private debuterVirage(face: number): boolean {
    const delta = Math.atan2(Math.sin(face - this.obj.rotation.y), Math.cos(face - this.obj.rotation.y));
    if (Math.abs(delta) < .25 || this.solAssis !== null || this.mains && this.ikBut > 0) return false;
    const occupeAvant = this.busy, debut = this.obj.rotation.y;
    this.obj.updateMatrixWorld(true);
    const racineQ = this.obj.getWorldQuaternion(new THREE.Quaternion()).invert();
    const appuis = (['Right', 'Left'] as const).map(cote => {
      const pied = this.bone(cote + 'Foot'); if (!pied) return null;
      const p = pied.getWorldPosition(new THREE.Vector3()), q = pied.getWorldQuaternion(new THREE.Quaternion());
      return { cote, p, q, localP: this.obj.worldToLocal(p.clone()), localQ: racineQ.clone().multiply(q) };
    }).filter((p): p is NonNullable<typeof p> => !!p);
    if (appuis.length !== 2) return false;
    const poseJambes = new Map<string, THREE.Quaternion>();
    const repos = this.poseSonde('idle', 0) ? this.sonde : this.obj;
    repos.traverse(b => { if ((b as THREE.Bone).isBone && /(?:Left|Right)(?:UpLeg|Leg|Foot|ToeBase)$/.test(b.name)) poseJambes.set(b.name, b.quaternion.clone()); });
    if (repos === this.sonde) for (const pied of appuis) {
      let os: THREE.Object3D | null = null; repos.traverse(b => { if ((b as THREE.Bone).isBone && b.name.endsWith(pied.cote + 'Foot')) os = b; });
      if (os) { const p = repos.worldToLocal((os as THREE.Object3D).getWorldPosition(new THREE.Vector3())); pied.localP.x = p.x; pied.localP.z = p.z; pied.localQ.copy(repos.getWorldQuaternion(new THREE.Quaternion()).invert().multiply((os as THREE.Object3D).getWorldQuaternion(new THREE.Quaternion()))); }
    }
    // Un appui au sol pendant que l'autre se replace ; dernier pas pour aligner les deux pieds.
    const pas = Math.max(2, Math.ceil(Math.abs(delta) / .42) + 1), duree = pas * .30;
    this.play('idle', .25);
    this.currentName = delta > 0 ? 'turn_left' : 'turn_right';
    this.virage = { debut, delta, duree, t: 0, fin: false, occupeAvant, pas, phase: -1, poseJambes, appuis, departP: new THREE.Vector3(), departQ: new THREE.Quaternion(), cibleP: new THREE.Vector3(), cibleQ: new THREE.Quaternion() };
    this.busy = true;
    return true;
  }
  private avancerVirage(dt: number) {
    const v = this.virage; if (!v) return;
    v.t += dt;
    const k = THREE.MathUtils.smoothstep(v.t, 0, v.duree - .30);
    this.obj.rotation.y = v.debut + v.delta * k;
    if (v.t >= v.duree && !v.fin) { v.fin = true; this.currentName = 'idle'; }
    if (v.t >= v.duree + .28) { this.virage = null; this.busy = v.occupeAvant; }
  }
  private poserPiedsDuVirage() {
    const v = this.virage; if (!v || v.fin) return;
    const phase = Math.min(v.pas - 1, Math.floor(v.t / .30));
    // En cas de frame longue, conserver les appuis de chaque pas sauté avant de poursuivre.
    while (v.phase < phase) {
      if (v.phase >= 0) { const fini = v.appuis[v.phase % 2]; fini.p.copy(v.cibleP); fini.q.copy(v.cibleQ); }
      v.phase++;
      const pied = v.appuis[v.phase % 2]; v.departP.copy(pied.p); v.departQ.copy(pied.q);
      const fin = Math.min(v.duree - .30, (v.phase + 1) * .30);
      const yaw = v.debut + v.delta * THREE.MathUtils.smoothstep(fin, 0, v.duree - .30);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      v.cibleP.copy(pied.localP).applyQuaternion(q).add(this.obj.position);
      v.cibleQ.copy(q).multiply(pied.localQ);
    }
    const t = THREE.MathUtils.clamp((v.t - phase * .30) / .30, 0, 1), k = THREE.MathUtils.smoothstep(t, 0, 1);
    for (let i = 0; i < 2; i++) {
      const pied = v.appuis[i], mobile = i === phase % 2;
      const cible = mobile ? v.departP.clone().lerp(v.cibleP, k) : pied.p.clone();
      if (mobile) cible.y += .045 * Math.sin(Math.PI * t) ** 2;
      const q = mobile ? v.departQ.clone().slerp(v.cibleQ, k) : pied.q;
      this.chaineIK(pied.cote, cible, 1, true);
      const os = this.os(pied.cote + 'Foot'); if (os?.parent) { os.quaternion.copy(os.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q)); os.updateMatrixWorld(true); }
    }
  }
  private annulerVirage() {
    if (!this.virage) return;
    if (!this.walking) this.busy = this.virage.occupeAvant;
    this.virage = null;
  }
  private walking: { target: THREE.Vector3; face?: number; arrivee?: boolean; resolve: () => void } | null = null;
  private fade = { value: 1, target: 1 };
  private meshes: THREE.Mesh[] = [];
  private sonde!: THREE.Object3D;
  private sondeMixer!: THREE.AnimationMixer;
  private correctionSol = 0;
  planSol = 0;

  constructor(assets: Assets, asset: CharacterAsset) {
    // Le placement au sol vit au-dessus des nœuds importés : le mixer peut
    // réécrire leurs positions, mais ne doit jamais effacer ce décalage.
    this.obj = new THREE.Group(); this.obj.add(assets.instantiate(asset));
    this.mixer = new THREE.AnimationMixer(this.obj);
    let clips = asset.clips.length ? asset.clips : BIBLIO.clips;     // un corps « nu » joue la bibliothèque
    this.deLaBibliotheque = !asset.clips.length;
    if (this.deLaBibliotheque && BIBLIO.hanches > 0) clips = this.retarget(clips);   // X Bot → ce corps (diagnostic Codex, 4 octobre)
    for (const clip of clips) {
      const a = this.mixer.clipAction(clip);
      a.enabled = true;
      this.actions.set(clip.name, a);
    }
    this.hanchesRepos = hauteurHanches(this.obj);                     // avant toute animation : la pose de repos
    if (this.deLaBibliotheque) for (const n of this.actions.keys()) if (/^idle/.test(n)) this.pinInPlace(n);   // Breathing Idle balance le bassin de 19 cm : fixé sur place
    this.obj.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) this.meshes.push(m); });
    this.sonde = skeletonClone(this.obj);
    this.sondeMixer = new THREE.AnimationMixer(this.sonde);
    if (this.poseSonde('idle', 0)) this.sonde.traverse(o => {
      if ((o as THREE.Bone).isBone && /(?:Spine\d*|Neck|Head)$/.test(o.name)) this.couRepos.set(o.name, o.quaternion.clone());
    });
    this.preparerVolumeTorse();
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
  /** Ce personnage joue la bibliothèque commune (corps sans animation). */
  deLaBibliotheque = false;
  /** RETARGET X Bot → ce corps. Même nom d'os ne veut pas dire même proportion ni même repère de repos :
   *  - les translations d'os restent celles du corps (sinon ses bras prennent la longueur de ceux de X Bot) ;
   *  - seule la translation du bassin est copiée, mise à l'échelle autour du repos de chaque squelette ;
   *  - chaque rotation animée est convertie entre les deux poses de repos : q_corps = A · q_source · B,
   *    A = inv(Qmonde_parent_corps) · Qmonde_parent_source, B = inv(Qmonde_os_source) · Qmonde_os_corps. */
  private retarget(clips: THREE.AnimationClip[]): THREE.AnimationClip[] {
    this.obj.updateMatrixWorld(true);
    const corps = new Map<string, { qW: THREE.Quaternion; p: THREE.Vector3; parent: string }>();
    this.obj.traverse(o => { if (o.name) corps.set(o.name, { qW: o.getWorldQuaternion(new THREE.Quaternion()), p: o.position.clone(), parent: o.parent?.name ?? '' }); });
    const hS = BIBLIO.repos.get([...BIBLIO.repos.keys()].find(k => /Hips$/.test(k)) ?? ''), hC = [...corps.entries()].find(([k]) => /Hips$/.test(k));
    const ratio = hS && hC && hS.p.y > 0 ? hC[1].p.y / hS.p.y : 1;
    const A = new Map<string, THREE.Quaternion>(), Bm = new Map<string, THREE.Quaternion>();
    for (const [nom, c] of corps) {
      const sN = BIBLIO.repos.get(nom); if (!sN) continue;
      const pc = corps.get(c.parent), ps = BIBLIO.repos.get(sN.parent);
      const qpc = pc ? pc.qW : new THREE.Quaternion(), qps = ps ? ps.qW : new THREE.Quaternion();
      A.set(nom, qpc.clone().invert().multiply(qps));
      Bm.set(nom, sN.qW.clone().invert().multiply(c.qW));
    }
    const q = new THREE.Quaternion();
    const out = clips.map(clip => {
      const pistes: THREE.KeyframeTrack[] = [];
      for (const tr0 of clip.tracks) {
        const m = tr0.name.match(/^(.*)\.(quaternion|position|scale)$/); if (!m) continue;
        const nom = m[1], prop = m[2];
        if (!corps.has(nom)) continue;
        if (prop === 'scale') continue;
        const tr = tr0.clone();
        if (prop === 'position') {
          if (!/Hips$/.test(nom)) continue;                              // les longueurs d'os restent celles du corps
          const v = tr.values, p0 = hS!.p, pc0 = hC![1].p;
          for (let i = 0; i < v.length; i += 3) { v[i] = pc0.x + ratio * (v[i] - p0.x); v[i + 1] = pc0.y + ratio * (v[i + 1] - p0.y); v[i + 2] = pc0.z + ratio * (v[i + 2] - p0.z); }
        } else {
          const a = A.get(nom)!, b = Bm.get(nom)!, v = tr.values;
          for (let i = 0; i < v.length; i += 4) { q.fromArray(v, i); q.premultiply(a).multiply(b).normalize(); q.toArray(v, i); }
        }
        pistes.push(tr);
      }
      return new THREE.AnimationClip(clip.name, clip.duration, pistes);
    });
    console.info(`[retarget] bassin ${hC ? hC[1].p.y.toFixed(3) : '?'} / ${hS ? hS.p.y.toFixed(3) : '?'} → ×${ratio.toFixed(3)}, ${corps.size} nœuds`);
    return out;
  }
  /** Où est un os (repère du personnage) à un instant d'une animation, évalué « à blanc ». */
  osDansLeGeste(name: string, t: number, os: string): THREE.Vector3 | null {
    if (!this.poseSonde(name, t)) return null;
    let b: THREE.Object3D | null = null;
    this.sonde.traverse(o => { if ((o as THREE.Bone).isBone && o.name.endsWith(os)) b = o; });
    return b ? (b as THREE.Object3D).getWorldPosition(new THREE.Vector3()) : null;
  }
  priseDansLeGeste(name: string, t: number, cote: 'Right' | 'Left') {
    if (!this.poseSonde(name, t)) return null;
    let main: THREE.Object3D | null = null;
    const doigts = new Map<string, THREE.Quaternion>();
    this.sonde.traverse(o => {
      if (o.name.endsWith(cote + 'Hand')) main = o;
      if (new RegExp(cote + 'Hand(?:Thumb|Index|Middle|Ring|Pinky)\\d+$').test(o.name)) doigts.set(o.name, o.quaternion.clone());
    });
    return main ? { orientation: (main as THREE.Object3D).getWorldQuaternion(new THREE.Quaternion()), doigts } : null;
  }
  private poseSonde(name: string, t: number): boolean {
    const a = this.actions.get(name); if (!a) return false;
    this.sondeMixer.stopAllAction();
    const p = this.sondeMixer.clipAction(a.getClip());
    p.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1).play(); p.clampWhenFinished = true;
    this.sondeMixer.setTime(THREE.MathUtils.clamp(t, 0, a.getClip().duration));
    this.sonde.updateMatrixWorld(true); return true;
  }
  /** Surface réelle du vêtement déformé, et non centre d'un os. */
  surfacePose(name: string, t: number, zone: 'chaussures' | 'assise' | 'dos' | 'couchage'): number {
    if (!this.poseSonde(name, t)) return 0;
    return this.surface(this.sonde, zone);
  }
  private surface(root: THREE.Object3D, zone: 'chaussures' | 'assise' | 'dos' | 'couchage' | 'support'): number {
    root.updateMatrixWorld(true);
    let min = Infinity; const p = new THREE.Vector3();
    root.traverse(o => {
      const m = o as THREE.SkinnedMesh; if (!m.isSkinnedMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const motif = zone === 'support' || zone === 'couchage' ? /./ : zone === 'chaussures' ? /chaussures/ : zone === 'assise' ? /_bas$/ : /_haut$/;
      if (!mats.some(mat => motif.test(mat.name))) return;
      m.skeleton.update(); const positions = m.geometry.attributes.position;
      // Zones proximales dans la pose de repos : exclure mollets, manches et col.
      const h = this.hanchesRepos;
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i), x = positions.getX(i);
        if (zone === 'assise' && (y < h - .18 || y > h + .04 || Math.abs(x) > .32)) continue;
        if (zone === 'dos' && (y < h + .10 || y > h + .40 || Math.abs(x) > .20)) continue;
        if (zone === 'couchage' && y < h - .18) continue;
        m.getVertexPosition(i, p); m.localToWorld(p); root.worldToLocal(p);
        min = Math.min(min, p.y);
      }
    });
    return Number.isFinite(min) ? min : 0;
  }
  /** Recaler les semelles au sol seulement pour le repos et la marche. Les sauts
   * et les poses sur un meuble conservent leur hauteur propre. */
  stabiliserSol(name = this.currentName) {
    if (!this.deLaBibliotheque) return;
    const meuble = /^(sit|sleep)(?:_|$)/.test(name);
    const debout = /^(idle|walk)(?:_|$)/.test(name);
    const bas = this.surface(this.obj, debout ? 'chaussures' : 'support') - this.correctionSol;
    const aerien = /^(dance|sport_jacks|sport_jogging|jacks_|joie)/.test(name) || Boolean(this.raccord?.aerien);
    const next = meuble ? 0 : aerien ? Math.max(0, this.planSol - bas) : this.planSol - bas;
    const d = next - this.correctionSol;
    for (const c of this.obj.children) c.position.y += d;
    this.correctionSol = next; this.obj.updateMatrixWorld(true);
  }
  hauteurSemelles(): number { return this.surface(this.obj, 'chaussures'); }
  hauteurSupport(): number { return this.surface(this.obj, 'support'); }
  rayonTeteDroite(): number {
    this.obj.updateMatrixWorld(true);
    const tete = this.bone('Head'); if (!tete) return .12;
    const centre = this.obj.worldToLocal(tete.getWorldPosition(new THREE.Vector3()));
    let r = 0; const p = new THREE.Vector3();
    this.obj.traverse(o => {
      const m = o as THREE.SkinnedMesh; if (!m.isSkinnedMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material]; if (!mats.some(mat => /_peau$/.test(mat.name))) return;
      const index = m.geometry.attributes.skinIndex, poids = m.geometry.attributes.skinWeight;
      if (!index || !poids) return; m.skeleton.update();
      const ids = new Set(m.skeleton.bones.map((b, i) => /Head/.test(b.name) ? i : -1));
      for (let i = 0; i < index.count; i++) {
        let w = 0; for (let k = 0; k < 4; k++) if (ids.has(index.getComponent(i, k))) w += poids.getComponent(i, k);
        if (w < .5) continue;
        m.getVertexPosition(i, p); m.localToWorld(p); this.obj.worldToLocal(p); r = Math.max(r, centre.x - p.x);
      }
    }); return THREE.MathUtils.clamp(r, .08, .25);
  }
  /** Les réglages mesurés sur les animations de la bibliothèque (à la place des mesures Blender de l'ancien corps) :
   *  - gestes : le moment « utile » = la main droite au plus bas (planter) ou au plus loin devant (récolter), 35 % pour arroser ;
   *  - assise : hauteur du bassin dans « sit » ; couchage : hauteur du bassin dans « sleep ». */
  mesurerSurLaBibliotheque() {
    if (!this.deLaBibliotheque) return;
    const paume = (name: string, t: number) => { const h = this.osDansLeGeste(name, t, 'RightHand'), m = this.osDansLeGeste(name, t, 'RightHandMiddle1'); return h && m ? h.multiplyScalar(.35).addScaledVector(m, .65) : h; };
    const chercher = (name: string, mode: 'bas' | 'loin', seuil = .35, doigt = false): number => {
      const a = this.actions.get(name); if (!a) return 0;
      const d = a.getClip().duration; let meilleur = d * .5, score = mode === 'bas' ? Infinity : -Infinity, prec: number | null = null;
      for (let t = .2; t < d - .2; t += .05) {
        const m = doigt ? this.osDansLeGeste(name, t, 'RightHandMiddle4') : paume(name, t); if (!m) continue;
        if (mode === 'bas' && prec !== null && prec > seuil && m.y <= seuil) return t;   // la paume franchit la hauteur du légume en descendant
        prec = m.y;
        const v = mode === 'bas' ? m.y : Math.hypot(m.x, m.z) - m.y * .3;
        if (mode === 'bas' ? v < score : v > score) { score = v; meilleur = t; }
      }
      return meilleur;
    };
    const g: Record<string, { anim: string; debut: number; fin: number; effet: number; distance: number; cote?: number }> = {};
    // semer et récolter : « pickup » (se pencher, main à ~33 cm du sol = la hauteur de nos pots) ; les animations à genoux
    // du kit jardinage travaillent au sol (7 cm), trop bas pour des pots à 26 cm (mesures Codex, 4 octobre)
    if (this.actions.has('pickup')) {
      const d = this.actions.get('pickup')!.getClip().duration, effet = chercher('pickup', 'bas');
      const fin = Math.min(d, effet + 1.3);                             // on ne joue pas les 9 s : la main redescend et on enchaîne
      const semis = chercher('pickup', 'bas', .26, true);
      g.plant = { anim: 'pickup', debut: 0, fin: Math.min(d, semis + 1.3), effet: semis, distance: .55, cote: 0 };
      g.harvest = { anim: 'pickup', debut: 0, fin, effet, distance: .55, cote: 0 };
      g.pickup = { anim: 'pickup', debut: 0, fin, effet, distance: .55, cote: 0 };
    }
    if (this.actions.has('water')) { const d = this.actions.get('water')!.getClip().duration; g.water = { anim: 'water', debut: 0, fin: d, effet: d * .35, distance: .55, cote: 0 }; }
    if (Object.keys(g).length) this.gestures = { ...this.gestures, ...g };
    const hanche = (name: string, t: number) => { const h = this.osDansLeGeste(name, t, 'Hips'); return h ? h.y : 0; };
    for (const n of ['sit_down', 'stand_up']) this.pinInPlace(n);
    if (this.actions.has('sit')) this.sitCfg = { anim: 'sit', installe_a: 0, cuisses_z: hanche('sit', .3), chaise_ok: true };
    if (this.actions.has('sleep')) this.sleepCfg = { anim: 'sleep', installe_a: 0, dos_z: hanche('sleep', .3) };
    if (this.actions.has('walk')) {
      const vitesses: number[] = [], dt = 1 / 30, d = this.actions.get('walk')!.getClip().duration;
      for (const os of ['LeftFoot', 'RightFoot']) {
        const poses: THREE.Vector3[] = [];
        for (let t = 0; t < d; t += dt) { const p = this.osDansLeGeste('walk', t, os); if (p) poses.push(p); }
        const bas = Math.min(...poses.map(p => p.y));
        for (let i = 1; i < poses.length; i++) { const v = -(poses[i].z - poses[i - 1].z) / dt;
          if (poses[i].y < bas + .025 && v > .2 && v < 2.5) vitesses.push(v); }
      }
      vitesses.sort((a, b) => a - b);
      if (vitesses.length) this.speed = vitesses[Math.floor(vitesses.length / 2)];
      this.walkScale = 1;
      console.info(`[marche] vitesse des appuis ${this.speed.toFixed(4)} m/s, clip ×1`);
    }
    // tout ce qui se joue sur place : danses, sport, jardinage (le kit Mixamo garde ses déplacements), gestes
    for (const n of this.actions.keys()) if (/^(dance|sport_|jardin_)|^(plant|water|harvest|pickup|idle|phone|cafe|etirer|bailler|saluer|applaudir|regard|pointer|reflechir|mains_hanches|bonjour|pouce|joie|rire|surprise|ennui|rambarde|cuisiner|yoga)/.test(n)) this.pinInPlace(n);
    console.info('[mesures] sur la bibliothèque :', Object.entries(g).map(([k, v]) => `${k} effet ${v.effet.toFixed(1)} s`).join(', '), `| assise ${this.sitCfg?.cuisses_z?.toFixed(2)} | couché ${this.sleepCfg?.dos_z?.toFixed(2)}`);
  }
  /** Remonter (ou descendre) le modèle de quelques centimètres : si les semelles s'enfoncent dans le sol, on relève. */
  private decalagePieds = 0;
  decalerPieds(m: number) { const d = m - this.decalagePieds; this.decalagePieds = m; for (const c of this.obj.children) c.position.y += d; }
  /** Où est une main (repère du personnage) à un instant donné d'une animation : sert à placer le personnage pour que
   *  la main tombe au-dessus du pot. On évalue la pose « à blanc », puis on remet le repos. */
  mainDansLeGeste(name: string, t: number, cote: 'Right' | 'Left' = 'Right'): THREE.Vector3 | null {
    return this.osDansLeGeste(name, t, cote + 'Hand');
  }
  /** Retirer des animations abîmées (elles ne seront plus jamais jouées). */
  exclure(noms: string[]) { for (const n of noms) { const a = this.actions.get(n); if (a) { a.stop(); this.actions.delete(n); } } }
  /** Le nom de toutes les animations de ce personnage (pour la revue des animations). */
  nomsAnimations(): string[] { return [...this.actions.keys()]; }
  poserAnimation(name: string, t: number) {
    const a = this.actions.get(name); if (!a) return;
    this.mixer.stopAllAction(); a.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1).play(); a.clampWhenFinished = true;
    this.current = a; this.currentName = name;
    this.mixer.setTime(THREE.MathUtils.clamp(t, 0, a.getClip().duration)); this.stabiliserSol(name); this.obj.updateMatrixWorld(true);
  }
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

  private raccord: { t: number; duree: number; aerien: boolean; pose: { os: THREE.Object3D; p: THREE.Vector3; q: THREE.Quaternion }[] } | null = null;
  private raccorderPose(duree: number) {
    if (duree <= 0 || !this.current) { this.raccord = null; return; }
    const pose: { os: THREE.Object3D; p: THREE.Vector3; q: THREE.Quaternion }[] = [];
    this.obj.traverse(os => { if ((os as THREE.Bone).isBone) pose.push({ os, p: os.position.clone(), q: os.quaternion.clone() }); });
    this.raccord = { t: 0, duree, aerien: /^(dance|sport_jacks|sport_jogging)/.test(this.currentName), pose };
  }
  private appliquerRaccord(dt: number) {
    const r = this.raccord; if (!r) return;
    r.t += dt;
    const poids = THREE.MathUtils.smoothstep(r.t, 0, r.duree);
    for (const { os, p, q } of r.pose) { os.position.lerp(p, 1 - poids); os.quaternion.slerp(q, 1 - poids); }
    this.obj.updateMatrixWorld(true);
    if (r.t >= r.duree) this.raccord = null;
  }
  /** Un exercice répété conserve son action et sa phase, sans idle entre deux cycles. */
  repeter(name: string, tours: number): Promise<void> {
    const a = this.resolve(name); if (!a) return Promise.resolve();
    this.raccorderPose(.4); this.actionEpoch++;
    a.reset().setLoop(THREE.LoopRepeat, Math.max(1, tours)); a.clampWhenFinished = true;
    a.timeScale = 1; a.setEffectiveWeight(1).fadeIn(.3).play();
    if (this.current && this.current !== a) this.current.fadeOut(.3);
    this.current = a; this.currentName = name;
    const epoch = this.actionEpoch;
    return new Promise<void>(res => {
      const fini = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== a) return;
        this.mixer.removeEventListener('finished', fini); res();
      };
      this.mixer.addEventListener('finished', fini);
      // Une annulation ne doit pas laisser la scène suspendue.
      const verifier = () => { if (epoch !== this.actionEpoch) { this.mixer.removeEventListener('finished', fini); res(); } else if (a.isRunning()) setTimeout(verifier, 250); };
      setTimeout(verifier, 250);
    });
  }

  private breathing = false;
  private breathT = 0;
  /** Joue une animation en boucle (idle, walk, sit, sleep, phone, dance). */
  play(name: string, fadeSec = .22, timeScale = 1) {
    if (!name.startsWith('turn_')) this.annulerVirage();
    if (name === 'idle' && this.appuisGeste) this.appuisFin = fadeSec;
    else if (!/^(plant|harvest|pickup|water)$/.test(name)) { this.appuisGeste = null; this.appuisFin = 0; }
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
    if (this.current === a && this.currentName === name && a.isRunning()) return;
    // Laisser redescendre les bras après un exercice ou une danse.
    if (name === 'idle' && /^(sport_|dance|jacks_)/.test(this.currentName)) fadeSec = Math.max(fadeSec, .85);
    this.raccorderPose(fadeSec);
    this.actionEpoch++;
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
  estBoucle(name: string): boolean {
    return !/(_start|_end|_down|_up|_stop)$|^(get_up|stand_up|turn_|lie_down)|^sport_/.test(name)
      && /^(idle|walk|dance|sit|sleep|phone|carry)(?:_|$)/.test(name);
  }
  private finAction: { reste: number; epoch: number; retourIdle: boolean; resolve: () => void } | null = null;
  private attendreAnimation(duree: number, epoch: number, retourIdle: boolean) {
    this.finAction?.resolve();
    return new Promise<void>(resolve => { this.finAction = { reste: duree, epoch, retourIdle, resolve }; });
  }
  once(name: string, maxSec = 4, retourIdle = true): Promise<void> {
    this.annulerVirage();
    const a = this.resolve(name); if (!a) return Promise.resolve();
    const dur = Math.min(a.getClip().duration, maxSec);
    this.raccorderPose(.35);
    a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = 1;
    a.fadeIn(.18).play();
    if (this.current && this.current !== a) this.current.fadeOut(.18);
    this.current = a; this.currentName = name;
    const epoch = ++this.actionEpoch;
    return this.attendreAnimation(dur, epoch, retourIdle);
  }

  /** Marche en ligne droite jusqu'au point, puis se tourne vers `face` (angle Y). */
  goTo(target: THREE.Vector3, face?: number): Promise<void> {
    this.appuisGeste = null; this.mouvementOrigine = null;
    this.solAssis = null;
    if (this.walking) { const w = this.walking; this.walking = null; w.resolve(); }
    const d = target.clone().sub(this.obj.position);
    d.y = 0;
    this.faceCible = null; this.virage = null;
    if (d.length() < .05) {
      if (face === undefined) return Promise.resolve();
      this.busy = true; this.play('idle');
      return new Promise(res => { this.walking = { target: this.obj.position.clone(), face, arrivee: true, resolve: res }; });
    }
    this.busy = true;
    this.play('walk');
    this.debuterVirage(Math.atan2(d.x, d.z));
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
    this.appuisGeste = null; this.mouvementOrigine = null;
    this.solAssis = null;
    this.coudePrecedent.clear(); this.coudesDebutFrame.clear();
    this.forcesBras.clear();
    this.annulerMarche(); this.faceCible = null;
    this.obj.position.copy(p);
    if (face !== undefined) this.obj.rotation.y = face;
  }
  annulerMarche() {
    this.actionEpoch++;
    this.annulerVirage();
    const w = this.walking; this.walking = null; this.virage = null;
    if (w) { this.busy = false; w.resolve(); }
  }
  setFade(target: number) { this.fade.target = target; }

  /** Les mains peuvent suivre des cibles dans le monde (remuer la poêle, saupoudrer), par-dessus l'animation en cours. */
  mains: { droite?: () => THREE.Vector3; gauche?: () => THREE.Vector3; paumes?: boolean; doigts?: boolean; orientationDroite?: () => THREE.Quaternion; priseDroite?: Map<string, THREE.Quaternion>; poseDroite?: Map<string, THREE.Quaternion>; poseCorps?: Map<string, THREE.Quaternion>; poseBassin?: THREE.Vector3 } | null = null;
  private priseDouce = false; private ikProgression = 0; private ikPoids = 0; ikBut = 0;
  private ikOs: Record<string, THREE.Object3D | null> = {};
  private torse: { mesh: THREE.SkinnedMesh; indices: number[] }[] = [];
  private torseLarge = false;
  private rayonAvantBras: Record<'Right' | 'Left', number> = { Right: .035, Left: .035 };
  private coudePrecedent = new Map<string, THREE.Vector3>();
  private coudesDebutFrame = new Map<string, THREE.Vector3>();
  private pasCoude = .08;
  private preparerVolumeTorse() {
    const box = new THREE.Box3(), p = new THREE.Vector3();
    this.obj.updateMatrixWorld(true);
    this.obj.traverse(o => {
      const m = o as THREE.SkinnedMesh; if (!m.isSkinnedMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (!mats.some(a => /_(haut|bas)$/.test(a.name))) return;
      const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
      const os = new Set(m.skeleton.bones.map((b, i) => /Hips$|Spine\d*$/.test(b.name) ? i : -1));
      const indices: number[] = []; m.skeleton.update();
      for (let i = 0; i < si.count; i++) {
        let w = 0; for (let k = 0; k < 4; k++) if (os.has(si.getComponent(i, k))) w += sw.getComponent(i, k);
        if (w < .8) continue;
        m.getVertexPosition(i, p); m.localToWorld(p); this.obj.worldToLocal(p); box.expandByPoint(p);
        if (i % 3 === 0) indices.push(i);
      }
      this.torse.push({ mesh: m, indices });
    });
    this.torseLarge = !box.isEmpty() && box.max.z - box.min.z > .36;
    if (this.torseLarge) for (const cote of ['Right', 'Left'] as const) {
      const a = this.bone(cote + 'ForeArm'), b = this.bone(cote + 'Hand'); if (!a || !b) continue;
      const ligne = new THREE.Line3(a.getWorldPosition(new THREE.Vector3()), b.getWorldPosition(new THREE.Vector3())), rayons: number[] = [];
      this.obj.traverse(o => {
        const m = o as THREE.SkinnedMesh; if (!m.isSkinnedMesh) return;
        m.skeleton.update(); const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
        for (let i = 0; i < si.count; i++) {
          let w = 0; for (let k = 0; k < 4; k++) if (m.skeleton.bones[si.getComponent(i, k)].name.endsWith(cote + 'ForeArm')) w += sw.getComponent(i, k);
          if (w < .65) continue;
          const v = m.getVertexPosition(i, new THREE.Vector3()); m.localToWorld(v);
          rayons.push(v.distanceTo(ligne.closestPointToPoint(v, false, new THREE.Vector3())));
        }
      });
      rayons.sort((a, b) => a - b);
      if (rayons.length) this.rayonAvantBras[cote] = rayons[Math.floor(rayons.length * .95)] + .003;
    }
  }
  private contourTorse: THREE.Vector3[] = [];
  private tranchesTorse = new Map<string, THREE.Box3>();
  private bornesTorse = new THREE.Box3();
  private couRepos = new Map<string, THREE.Quaternion>();
  private mesurerVolumeTorse() {
    this.contourTorse = [];
    this.tranchesTorse.clear(); this.bornesTorse.makeEmpty();
    if (!this.torse.length || !/^(idle(?:_|$)|walk(?:_|$)|run(?:_|$)|plant$|harvest$|pickup$|water$|carry(?:_|$)|phone(?:_|$)|cafe(?:_|$)|sit(?:_|$)|stand_up$|turn_)/.test(this.currentName)) return;
    this.obj.updateMatrixWorld(true);
    for (const { mesh, indices } of this.torse) {
      mesh.skeleton.update();
      for (const i of indices) {
        const p = new THREE.Vector3(); mesh.getVertexPosition(i, p); mesh.localToWorld(p); this.obj.worldToLocal(p); this.contourTorse.push(p); this.bornesTorse.expandByPoint(p);
      }
    }
  }
  private mainHorsDuTorse(cote: 'Right' | 'Left', monde: THREE.Vector3, rayon = 0) {
    if (!this.contourTorse.length) return monde;
    const p = this.obj.worldToLocal(monde.clone());
    const centre = Math.round(p.y / .02) * .02, r = Math.ceil(rayon / .005) * .005;
    const cle = centre.toFixed(2) + ':' + r.toFixed(3);
    let box = this.tranchesTorse.get(cle);
    if (!box) {
      box = new THREE.Box3();
      for (const q of this.contourTorse) if (Math.abs(q.y - centre) < .05 + r) box.expandByPoint(q);
      if (!box.isEmpty()) box.expandByScalar(r);
      this.tranchesTorse.set(cle, box);
    }
    if (box.isEmpty()) return monde;
    // Entrer progressivement dans la zone de dégagement évite un saut du poignet.
    const bas = this.bornesTorse.min.y, haut = this.bornesTorse.max.y;
    const poids = THREE.MathUtils.smoothstep(p.y, bas - .05, bas) * (1 - THREE.MathUtils.smoothstep(p.y, haut, haut + .05))
      * THREE.MathUtils.smoothstep(p.z, box.min.z - .10, box.min.z)
      * (1 - THREE.MathUtils.smoothstep(p.z, box.max.z, box.max.z + .10))
      * THREE.MathUtils.smoothstep(p.x, box.min.x - .10, box.min.x)
      * (1 - THREE.MathUtils.smoothstep(p.x, box.max.x, box.max.x + .10));
    const marge = Math.max(.005, .055 - rayon);
    const dehors = cote === 'Right' ? Math.min(p.x, box.min.x - marge) : Math.max(p.x, box.max.x + marge);
    p.x = THREE.MathUtils.lerp(p.x, dehors, poids);
    return this.obj.localToWorld(p);
  }
  private forcesBras = new Map<'Right' | 'Left', number>();
  private degagerBrasLibres(dt: number) {
    for (const cote of ['Right', 'Left'] as const) {
      if (this.mains && this.ikBut > 0 && (cote === 'Right' ? this.mains.droite : this.mains.gauche)) {
        this.forcesBras.delete(cote);
        continue;
      }
      const main = this.os(cote + 'Hand'); if (!main) continue;
      const p = main.getWorldPosition(new THREE.Vector3()), cible = this.mainHorsDuTorse(cote, p);
      const coude = this.os(cote + 'ForeArm')?.getWorldPosition(new THREE.Vector3());
      const rayon = this.rayonAvantBras[cote];
      const distanceCoude = coude ? coude.distanceTo(this.mainHorsDuTorse(cote, coude, rayon)) : 0;
      let distanceSegment = 0;
      if (coude) for (const k of [.25, .5, .75]) {
        const point = coude.clone().lerp(p, k);
        distanceSegment = Math.max(distanceSegment, point.distanceTo(this.mainHorsDuTorse(cote, point, rayon)));
      }
      if (distanceSegment > .001) {
        const exterieur = new THREE.Vector3(-Math.cos(this.obj.rotation.y), 0, Math.sin(this.obj.rotation.y)).multiplyScalar(cote === 'Right' ? 1 : -1);
        cible.addScaledVector(exterieur, Math.min(.08, distanceSegment));
      }
      const force = THREE.MathUtils.smoothstep(Math.max(p.distanceTo(cible), distanceCoude, distanceSegment), 0, .02);
      const precedent = this.forcesBras.get(cote) ?? 0;
      const poids = THREE.MathUtils.lerp(precedent, force, 1 - Math.exp(-dt * 10));
      this.forcesBras.set(cote, poids);
      if (poids > .001) this.chaineIK(cote, cible, poids);
    }
  }
  private os(n: string) { return (this.ikOs[n] ??= this.bone(n)); }
  solAssis: number | null = null;
  solSousPied: ((p: THREE.Vector3) => number) | null = null;
  piedHorsObstacle: ((pied: THREE.Vector3, pointe: THREE.Vector3) => THREE.Vector3) | null = null;
  private degagerPiedsEnMouvement() {
    if (!this.piedHorsObstacle || (!this.walking && !this.virage)) return;
    for (const cote of ['Left', 'Right'] as const) {
      const pied = this.os(cote + 'Foot'), pointe = this.os(cote + 'ToeBase');
      if (!pied?.parent || !pointe) continue;
      const q = pied.getWorldQuaternion(new THREE.Quaternion());
      for (let i = 0; i < 3; i++) {
        const p = pied.getWorldPosition(new THREE.Vector3());
        const cible = this.piedHorsObstacle(p, pointe.getWorldPosition(new THREE.Vector3()));
        if (cible.distanceToSquared(p) < 1e-8) break;
        // Garder le pas à portée de la jambe ; un léger soulèvement vaut mieux qu'une jambe étirée.
        const hanche = this.os(cote + 'UpLeg'), genou = this.os(cote + 'Leg');
        if (hanche && genou) {
          const h = hanche.getWorldPosition(new THREE.Vector3()), g = genou.getWorldPosition(new THREE.Vector3());
          const longueur = h.distanceTo(g) + g.distanceTo(p) - .002;
          const horizontal = Math.hypot(cible.x - h.x, cible.z - h.z);
          if (horizontal < longueur) cible.y = Math.max(cible.y, h.y - Math.sqrt(longueur * longueur - horizontal * horizontal));
        }
        this.chaineIK(cote, cible, 1, true);
        pied.quaternion.copy(pied.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
        pied.updateMatrixWorld(true);
      }
    }
  }
  private appuisGeste: { cote: 'Left' | 'Right'; pos: THREE.Vector3; q: THREE.Quaternion }[] | null = null;
  private appuisFin = 0;
  private dernierGeste = '';
  private empreinteRepos: { minX: number; maxX: number; minZ: number; maxZ: number }[] | null = null;
  /** Enveloppe des chaussures au repos, dans le repère de placement du corps. Mesurée une seule fois. */
  empreintePieds() {
    if (this.empreinteRepos) return this.empreinteRepos;
    if (!this.poseSonde('idle', 0)) return [];
    const boxes = [new THREE.Box3(), new THREE.Box3()];
    this.sonde.traverse(o => {
      const mesh = o as THREE.SkinnedMesh; if (!mesh.isSkinnedMesh) return;
      const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
      if (!indices || !weights) return;
      mesh.skeleton.update();
      for (let i = 0; i < indices.count; i++) {
        const sides = [0, 0];
        for (let k = 0; k < 4; k++) {
          const name = mesh.skeleton.bones[indices.getComponent(i, k)]?.name ?? '';
          if (/Left(Foot|Toe)/.test(name)) sides[0] += weights.getComponent(i, k);
          if (/Right(Foot|Toe)/.test(name)) sides[1] += weights.getComponent(i, k);
        }
        if (Math.max(...sides) < .5) continue;
        const point = mesh.getVertexPosition(i, new THREE.Vector3()); mesh.localToWorld(point);
        boxes[sides[0] > sides[1] ? 0 : 1].expandByPoint(point);
      }
    });
    this.empreinteRepos = boxes.filter(b => !b.isEmpty()).map(b => ({ minX: b.min.x - .04, maxX: b.max.x + .04, minZ: b.min.z - .04, maxZ: b.max.z + .04 }));
    return this.empreinteRepos;
  }
  private fixerAppuis() {
    const hauteur = this.surfacePose('idle', 0, 'chaussures');
    this.appuisGeste = [];
    for (const cote of ['Left', 'Right'] as const) {
      if (!this.poseSonde('idle', 0)) continue;
      let pied: THREE.Object3D | null = null;
      this.sonde.traverse(o => { if ((o as THREE.Bone).isBone && o.name.endsWith(cote + 'Foot')) pied = o; });
      if (!pied) continue;
      const os = pied as THREE.Object3D;
      const pos = os.getWorldPosition(new THREE.Vector3()); pos.y -= hauteur;
      this.obj.localToWorld(pos);
      const q = this.obj.getWorldQuaternion(new THREE.Quaternion()).multiply(os.getWorldQuaternion(new THREE.Quaternion()));
      this.appuisGeste.push({ cote, pos, q });
    }
  }
  private poserAppuisGeste() {
    if (!this.appuisGeste) return;
    for (const { cote, pos, q } of this.appuisGeste) {
      this.chaineIK(cote, pos, 1, true);
      const pied = this.os(cote + 'Foot'); if (!pied?.parent) continue;
      pied.quaternion.copy(pied.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
      pied.updateMatrixWorld(true);
    }
  }
  private poserPiedsAssis() {
    if (this.solAssis === null) return;
    const p = new THREE.Vector3();
    for (const cote of ['Left', 'Right'] as const) {
      const pied = this.os(cote + 'Foot'); if (!pied) continue;
      let min = Infinity;
      this.obj.updateMatrixWorld(true);
      this.obj.traverse(o => {
        const m = o as THREE.SkinnedMesh; if (!m.isSkinnedMesh) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material]; if (!mats.some(x => /chaussures/.test(x.name))) return;
        m.skeleton.update(); const a = m.geometry.attributes.position;
        for (let i = 0; i < a.count; i++) {
          if ((a.getX(i) > 0) !== (cote === 'Left')) continue;
          m.getVertexPosition(i, p); m.localToWorld(p); min = Math.min(min, p.y);
        }
      });
      if (!Number.isFinite(min)) continue;
      const q = pied.getWorldQuaternion(new THREE.Quaternion());
      const cible = pied.getWorldPosition(new THREE.Vector3());
      const sol = /^(sit|stand_up)/.test(this.currentName) && this.solSousPied ? this.solSousPied(cible) : this.solAssis;
      cible.y += sol - min;
      this.chaineIK(cote, cible, 1, true);
      pied.quaternion.copy(pied.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
      pied.updateMatrixWorld(true);
    }
  }
  /** IK à deux os, exacte, avec un « pôle » : le coude part vers le bas, un peu vers l'extérieur et un peu vers l'arrière,
   *  comme un vrai bras (l'ancienne méthode pouvait plier le coude à l'envers). */
  private chaineIK(cote: 'Right' | 'Left', cible: THREE.Vector3, poids: number, jambe = false) {
    const bras = this.os(cote + (jambe ? 'UpLeg' : 'Arm')), avant = this.os(cote + (jambe ? 'Leg' : 'ForeArm')), main = this.os(cote + (jambe ? 'Foot' : 'Hand'));
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
    const large = this.contourTorse.length > 0;
    const guide = this.mains && this.ikBut > 0 && (cote === 'Right' ? this.mains.droite : this.mains.gauche);
    const pole = jambe ? fw.clone().addScaledVector(droite, .12) : (this.mains?.poseDroite || guide && this.currentName === 'water') ? new THREE.Vector3(0, this.mains?.poseDroite ? -.15 : -1, 0).addScaledVector(droite, this.mains?.poseDroite ? 1.25 : .65).addScaledVector(fw, this.mains?.poseDroite ? -.40 : -.20) : guide ? E0.clone().sub(S) : new THREE.Vector3(0, -1, 0).addScaledVector(droite, large ? 1.15 : .55).addScaledVector(fw, large ? .20 : -.35);
    let pp = pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (pp.lengthSq() < 1e-8) { pp = new THREE.Vector3(0, -1, 0).addScaledVector(droite, .55); pp.addScaledVector(dir, -pp.dot(dir)); }
    pp.normalize();   // le pôle, dans le plan perpendiculaire à l'axe épaule → cible
    const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const centre = S.clone().addScaledVector(dir, a * cosA), rayon = a * Math.sqrt(1 - cosA * cosA);
    let coude = centre.clone().addScaledVector(pp, rayon);
    if (!jambe && (large || guide) && !this.mains?.poseDroite) {
      // Même cible de main, mais choisir un coude dont l'avant-bras contourne le ventre.
      const travers = new THREE.Vector3().crossVectors(dir, pp).normalize();
      let meilleur = Infinity;
      const precedent = this.coudesDebutFrame.get(cote);
      const ancien = precedent ? this.obj.localToWorld(precedent.clone()).sub(centre) : null;
      const anglePrecedent = ancien ? Math.atan2(ancien.dot(travers), ancien.dot(pp)) : 0;
      for (const angle of [anglePrecedent, 0, .4, -.4, .8, -.8, 1.2, -1.2, 1.6, -1.6, 2, -2, 2.4, -2.4, 2.8, -2.8, Math.PI]) {
        const essai = centre.clone().addScaledVector(pp, Math.cos(angle) * rayon).addScaledVector(travers, Math.sin(angle) * rayon);
        let score = precedent ? this.obj.worldToLocal(essai.clone()).distanceToSquared(precedent) * .002 : angle * angle * 1e-6;
        if (guide && this.currentName === 'water') score += angle * angle * .002;
        for (const point of [essai, ...[.25, .5, .75].map(k => essai.clone().lerp(cible, k))]) {
          score += 100 * point.distanceToSquared(this.mainHorsDuTorse(cote, point, this.rayonAvantBras[cote]));
        }
        if (score < meilleur) { meilleur = score; coude = essai; }
        if (!precedent && angle === 0 && score < 1e-8) break;
      }
      if (ancien && rayon > 1e-5) {
        const choisi = coude.clone().sub(centre);
        const angleChoisi = Math.atan2(choisi.dot(travers), choisi.dot(pp));
        const ecart = Math.atan2(Math.sin(angleChoisi - anglePrecedent), Math.cos(angleChoisi - anglePrecedent));
        const angle = anglePrecedent + THREE.MathUtils.clamp(ecart, -this.pasCoude, this.pasCoude);
        coude = centre.clone().addScaledVector(pp, Math.cos(angle) * rayon).addScaledVector(travers, Math.sin(angle) * rayon);
      }
    }
    if (!jambe && (large || guide)) this.coudePrecedent.set(cote, this.obj.worldToLocal(coude.clone()));
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
    const deltaYaw = Math.atan2(dir.x, dir.z) - Math.atan2(avant.x, avant.z);
    const yaw = Math.atan2(Math.sin(deltaYaw), Math.cos(deltaYaw));
    const yawL = THREE.MathUtils.clamp(((yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1.13, 1.13);
    const limite = /^(plant|harvest|pickup|water)$/.test(this.currentName) || this.appuisGeste ? .26 : .52;
    const pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)), -limite, limite);
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
  private mouvementOrigine: { debut: THREE.Vector3; fin: THREE.Vector3; t: number; duree: number; clip?: string } | null = null;
  deplacerOrigine(fin: THREE.Vector3, duree: number, clip?: string) { this.mouvementOrigine = { debut: this.obj.position.clone(), fin: fin.clone(), t: 0, duree, clip }; }
  private progressionOrigine(clip: string | undefined, t: number, axe: number, fallback: number) {
    const r = clip && this.trajetsHanches.get(clip); if (!r) return fallback;
    const dernier = r.temps.length - 1, debut = r.valeurs[axe], fin = r.valeurs[dernier * 3 + axe];
    if (Math.abs(fin - debut) < .01) return fallback;
    let i = 0; while (i < dernier && r.temps[i + 1] < t) i++;
    const j = Math.min(dernier, i + 1), u = j === i ? 1 : THREE.MathUtils.clamp((t - r.temps[i]) / (r.temps[j] - r.temps[i]), 0, 1);
    const valeur = THREE.MathUtils.lerp(r.valeurs[i * 3 + axe], r.valeurs[j * 3 + axe], u);
    return THREE.MathUtils.clamp((valeur - debut) / (fin - debut), 0, 1);
  }
  private faceCible: number | null = null;
  tourner(face: number) { this.annulerVirage(); this.faceCible = null; if (!this.debuterVirage(face)) this.faceCible = face; }
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
    this.avancerVirage(dt);
    if (this.faceCible !== null) {
      const d = ((this.faceCible - this.obj.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const pas = Math.sign(d) * Math.min(Math.abs(d), dt * 3.2);
      this.obj.rotation.y += pas; if (Math.abs(d) < .01) this.faceCible = null;
    }
    this.mixer.update(dt);
    if (this.mouvementOrigine) {
      const r = this.mouvementOrigine; r.t += dt;
      const lisse = THREE.MathUtils.smoothstep(r.t, 0, r.duree);
      const plan = this.progressionOrigine(r.clip, r.t, 2, lisse), haut = this.progressionOrigine(r.clip, r.t, 1, lisse);
      this.obj.position.lerpVectors(r.debut, r.fin, plan); this.obj.position.y = THREE.MathUtils.lerp(r.debut.y, r.fin.y, haut);
      if (r.t >= r.duree) this.mouvementOrigine = null;
    }
    // Le déplacement et le raccord précèdent les contraintes en coordonnées mondiales.
    if (this.walking) {
      const w = this.walking;
      if (!w.arrivee && !this.virage) {
        if (this.currentName !== 'walk') this.play('walk');
        const d = w.target.clone().sub(this.obj.position); d.y = 0;
        const len = d.length(), step = this.speed * dt;
        if (len > step) {
          const dy = Math.atan2(Math.sin(Math.atan2(d.x, d.z) - this.obj.rotation.y), Math.cos(Math.atan2(d.x, d.z) - this.obj.rotation.y));
          this.obj.rotation.y += THREE.MathUtils.clamp(dy, -dt * 3.2, dt * 3.2);
        }
        if (len <= step) {
          this.obj.position.copy(w.target); w.arrivee = true;
          this.play('idle');
        } else this.obj.position.add(d.normalize().multiplyScalar(step));
      }
      if (w.arrivee && !this.virage) {
        const dy = w.face === undefined ? 0 : Math.atan2(Math.sin(w.face - this.obj.rotation.y), Math.cos(w.face - this.obj.rotation.y));
        const pas = this.debuterVirage(this.obj.rotation.y + dy) ? 0 : Math.min(Math.abs(dy), dt * 3.2);
        this.obj.rotation.y += Math.sign(dy) * pas;
        if (!this.virage && Math.abs(dy) <= pas + 1e-6) {
          this.walking = null; this.busy = false; w.resolve();
        }
      }
    }
    this.appliquerRaccord(dt);
    // Les appuis du virage sont résolus après le placement au sol.
    if (this.currentName === 'idle' && this.appuisGeste) {
      this.appuisFin = Math.max(0, this.appuisFin - dt);
      if (!this.appuisFin && !this.raccord) this.appuisGeste = null;
    }
    const jardinage = /^(plant|harvest|pickup|water)$/.test(this.currentName) || this.currentName === 'idle' && this.appuisGeste;
    if (jardinage) {
      const eau = this.currentName === 'water' || this.currentName === 'idle' && this.dernierGeste === 'water';
      for (const nom of eau ? ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head'] : ['Neck', 'Head']) {
        const os = this.os(nom); if (!os) continue;
        const repos = this.couRepos.get(os.name); if (!repos) continue;
        if (eau) os.quaternion.slerp(repos, nom.startsWith('Spine') ? .35 : .85);
        else { const angle = repos.angleTo(os.quaternion); if (angle > .40) os.quaternion.slerp(repos, 1 - .40 / angle); }
      }
      this.obj.updateMatrixWorld(true);
    }
    if (this.mains?.poseCorps) {
      const poids = this.ikBut > 0 ? 1 : this.ikPoids;
      this.obj.traverse(o => { const q = this.mains?.poseCorps?.get(o.name); if (q) o.quaternion.slerp(q, poids); });
      const bassin = this.bone('Hips'); if (bassin && this.mains.poseBassin) bassin.position.lerp(this.mains.poseBassin, poids);
      this.obj.updateMatrixWorld(true);
    }
    // Le mixer ne réécrit pas chaque frame les pistes constantes déjà évaluées.
    // Restaurer les jambes avant l'IK pour éviter une accumulation de flexion.
    if (this.virage) { const pose = this.virage.poseJambes; this.obj.traverse(b => { const q = pose.get(b.name); if (q) b.quaternion.copy(q); }); this.obj.updateMatrixWorld(true); }
    if (!this.mouvementOrigine && this.solAssis === null) this.stabiliserSol();
    this.poserPiedsAssis();
    this.poserAppuisGeste();
    this.poserPiedsDuVirage();
    this.degagerPiedsEnMouvement();
    this.abaisserBras();
    this.mesurerVolumeTorse();
    this.coudesDebutFrame = new Map([...this.coudePrecedent].map(([n, p]) => [n, p.clone()]));
    this.pasCoude = Math.min(.2, dt * 5);
    this.degagerBrasLibres(dt);
    // Le téléphone monte et descend sans impulsion au début du guidage.
    if (this.mains && this.ikBut > 0) this.priseDouce = /^phone(?:_|$)/.test(this.currentName);
    if (this.priseDouce) {
      const ciblePrise = THREE.MathUtils.clamp(this.ikBut, 0, 1);
      this.ikProgression += THREE.MathUtils.clamp(ciblePrise - this.ikProgression, -dt / .55, dt / .55);
      this.ikPoids = THREE.MathUtils.smoothstep(this.ikProgression, 0, 1);
    } else {
      this.ikPoids += (this.ikBut - this.ikPoids) * Math.min(1, dt * 5);
      this.ikProgression = this.ikPoids;
    }
    if (this.mains && this.ikPoids > .01) {
      this.obj.updateMatrixWorld(true);
      for (const [cote, fn] of [['Right', this.mains.droite], ['Left', this.mains.gauche]] as const) {
        if (!fn) continue;
        if (cote === 'Right' && this.mains.priseDroite) this.obj.traverse(o => { const q = this.mains?.priseDroite?.get(o.name); if (q) o.quaternion.slerp(q, this.ikPoids); });
        this.obj.updateMatrixWorld(true);
        const but = fn(); // Les cibles des objets suivent leur trajectoire continue ; seul le coude est dégagé.
        const orientation = cote === 'Right' ? this.mains.orientationDroite?.() : undefined;
        const iterations = this.mains.paumes ? 12 : 1;
        // Résoudre la prise, puis interpoler la chaîne UNE fois vers l'animation.
        if (cote === 'Right' && this.mains.poseDroite) this.obj.traverse(o => { const q = this.mains?.poseDroite?.get(o.name); if (q) o.quaternion.slerp(q, this.ikBut > 0 ? 1 : this.ikPoids); });
        this.obj.updateMatrixWorld(true);
        const poseAvant = ['Shoulder', 'Arm', 'ForeArm', 'Hand'].map(n => this.os(cote + n)).filter((o): o is THREE.Object3D => !!o).map(os => ({ os, q: os.quaternion.clone() }));
        const orienter = () => {
          const main = this.os(cote + 'Hand'); if (!orientation || !main?.parent) return;
          main.quaternion.copy(main.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(orientation));
          main.updateMatrixWorld(true);
        };
        for (let i = 0; i < iterations; i++) {
          orienter();
          const cible = but.clone(), main = this.os(cote + 'Hand'), doigt = this.os(cote + (this.mains.doigts ? 'HandMiddle4' : 'HandMiddle1'));
          if (this.mains.paumes && main && doigt) cible.sub(doigt.getWorldPosition(new THREE.Vector3()).sub(main.getWorldPosition(new THREE.Vector3())).multiplyScalar(this.mains.doigts ? 1 : .65));
          this.chaineIK(cote, cible, 1);
        }
        orienter();
        for (const { os, q } of poseAvant) os.quaternion.copy(q.slerp(os.quaternion, this.ikPoids));
        this.obj.updateMatrixWorld(true);
      }
      this.obj.updateMatrixWorld(true);
    } else if (this.ikBut === 0 && this.ikPoids <= .01) this.mains = null;
    if (!jardinage) this.tournerTete(dt);
    if (this.breathing) { this.breathT += dt; const k = 1 + Math.sin(this.breathT * 1.6) * .006; this.obj.scale.set(this.obj.scale.x, this.obj.scale.x * k, this.obj.scale.x); }
    else if (this.obj.scale.y !== this.obj.scale.x) this.obj.scale.y = this.obj.scale.x;
    if (this.finAction) {
      const fin = this.finAction; fin.reste -= dt;
      if (fin.epoch !== this.actionEpoch || fin.reste <= 1e-6) {
        this.finAction = null;
        if (fin.epoch === this.actionEpoch && fin.retourIdle) this.play('idle', .4);
        fin.resolve();
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
