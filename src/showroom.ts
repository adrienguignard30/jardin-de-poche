import { tx } from './i18n';
import * as THREE from 'three';
import { Assets } from './assets';
import { Character } from './character';
import { CATALOG, type CharacterDef } from './state';

// L'accueil n'est pas une image : c'est la vraie scène, avec les vrais personnages, devant ta vue de Paris.
export class Showroom {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, .1, 200);
  chars: { def: CharacterDef; char: Character; base: THREE.Vector3 }[] = [];
  selected = '';
  private ray = new THREE.Raycaster();
  private t = 0;
  private backdrop: THREE.Mesh | null = null;
  private ready = false;

  constructor(private assets: Assets) {
    this.scene.background = new THREE.Color('#dfe9ef');
    this.scene.add(new THREE.HemisphereLight(0xf6f9ff, 0x9aa89a, 1.0));
    const sun = new THREE.DirectionalLight(0xfff1d8, 1.4); sun.position.set(3, 6, 5); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -4; sun.shadow.camera.right = 4; sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -2; sun.shadow.bias = -.0005;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xcfe0ff, .5); fill.position.set(-4, 2, 3); this.scene.add(fill);
    // sol : un disque doux qui reçoit les ombres, et fond dans le décor
    const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshStandardMaterial({ color: 0xd8d5cc, roughness: 1, transparent: true, opacity: .55 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);
    this.scene.fog = new THREE.Fog(0xdfe9ef, 30, 80);
    // le halo au sol sous le personnage choisi : on voit qu'il est sélectionné sans un mot
    this.halo = new THREE.Mesh(new THREE.RingGeometry(.42, .55, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .0, depthWrite: false }));
    this.halo.rotation.x = -Math.PI / 2; this.halo.position.y = .01; this.scene.add(this.halo);
    // Le jeu cesse d'actualiser le showroom après hideStart : annuler aussi hors update().
    const accueil = document.getElementById('start');
    if (accueil) new MutationObserver(() => {
      if (accueil.classList.contains('hidden')) this.arreterAccueil();
    }).observe(accueil, { attributes: true, attributeFilter: ['class'] });
  }
  halo: THREE.Mesh;
  focused = '';
  /** Personnaliser : seul le personnage choisi reste, en pied, décalé pour laisser la place au panneau. */
  focus(id: string) {
    const sel = this.chars.find(c => c.def.id === id); if (!sel) return;
    this.focused = id; this.selected = id; this.dancing = '';
    this.routeEpoch++; this.route = []; this.demande = null;
    for (const c of this.chars) c.char.annulerMarche();
    for (const c of this.chars) { c.char.obj.visible = c === sel; }
    sel.char.play('idle', .3);
    sel.char.teleport(new THREE.Vector3(this.portrait ? 0 : -.9, 0, 1.2), 0);
    this.frameBody();
  }
  /** La partie du corps qu'on colore : la caméra s'en approche (cheveux = la tête, chaussures = les pieds…).
   *  Sur téléphone, le panneau couvre le bas de l'écran : la partie est placée dans le haut, bien visible. */
  zone = '';
  private camCible = new THREE.Vector3(); private visCible = new THREE.Vector3(); private camPrete = false;
  focusZone(zone: string) { this.zone = zone; this.frameBody(); }
  private frameBody() {
    const sel = this.chars.find(c => c.def.id === this.focused); if (!sel) return;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const Z: Record<string, { y: number; h: number }> = { cheveux: { y: 1.58, h: .62 }, peau: { y: 1.5, h: .8 }, haut: { y: 1.18, h: .95 }, bas: { y: .62, h: 1.05 }, chaussures: { y: .14, h: .6 } };
    const z = Z[this.zone];
    const h = z ? z.h : 1.95, cy = z ? z.y : .95;
    const dist = (h / 2) / Math.tan(fov / 2) * (this.portrait ? (z ? 1.25 : 1.35) : 1.12);
    const demi = dist * Math.tan(fov / 2);
    // téléphone : le panneau occupe ~55 % du bas ; on met la partie vers 25 % du haut de l'écran
    const viseY = this.portrait ? cy - (z ? .5 : .32) * demi : (z ? cy : .9);
    const p = sel.char.obj.position;
    this.camCible.set(p.x, Math.max(.35, cy + (z ? .05 : 0)), p.z + dist);
    this.visCible.set(p.x, viseY, p.z);
    if (!this.camPrete) { this.camera.position.copy(this.camCible); this.camera.lookAt(this.visCible); this.camPrete = true; }
  }
  /** En personnalisation, la caméra glisse doucement vers sa cible. */
  private suivreCamera(dt: number) {
    const k = Math.min(1, dt * 5);
    this.camera.position.lerp(this.camCible, k);
    const vis = (this.camera.userData.vis ??= this.visCible.clone()) as THREE.Vector3;
    vis.lerp(this.visCible, k); this.camera.lookAt(vis);
  }
  unfocus() {
    this.zone = ''; this.camPrete = false; delete this.camera.userData.vis;
    if (!this.focused) return;
    this.focused = ''; this.selected = '';
    for (const c of this.chars) { c.char.obj.visible = true; c.char.teleport(new THREE.Vector3(c.base.x, 0, 0), 0); }
    this.resize(this.camera.aspect);
  }

  async load(onProgress: (label: string) => void) {
    if (this.ready) return;
    const view = CATALOG.views[CATALOG.characters[0].view];
    try {
      const tex = await this.assets.texture(view.farDay);
      const img = tex.image as { width: number; height: number };
      const h = 40, w = h * (img.width / img.height);
      this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false }));
      this.backdrop.position.set(0, 1.4 - h * .1 + 2, -40);   // horizon (40 % du haut) à peu près à hauteur d'yeux
      this.scene.add(this.backdrop);
    } catch { /* pas de fond : le ciel uni reste */ }
    const n = CATALOG.characters.length;
    for (let i = 0; i < n; i++) {
      const def = CATALOG.characters[i];
      onProgress(tx(def.name));
      try {
        const asset = await this.assets.loadCharacter(def.id, def.file);
        const c = new Character(this.assets, asset);
        const x = (i - (n - 1) / 2) * 1.55;
        c.teleport(new THREE.Vector3(x, 0, 0), 0);
        if (def.id === 'marcel' || def.id === 'jimy') {
          c.play('idle', 0); c.update(0);
          const os: { bone: THREE.Object3D; repos: THREE.Quaternion }[] = [];
          for (const cote of ['Left', 'Right']) for (const nom of ['Arm', 'ForeArm', 'Hand']) {
            const bone = c.bone(cote + nom); if (bone) os.push({ bone, repos: bone.quaternion.clone() });
          }
          this.brasDanse.set(c, { os, poids: 0, amplitude: def.id === 'marcel' ? .75 : .25 });
        }
        c.obj.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
        this.scene.add(c.obj);
        this.chars.push({ def, char: c, base: new THREE.Vector3(x, 0, 0) });
      } catch (e) { console.warn('personnage indisponible', def.id, e); }
    }
    this.ready = true;
  }

  pan = 0; private panNow = 0; private lookYNow = 1.0;   // décalages de caméra quand la fiche est ouverte
  private portrait = false;
  resize(aspect: number) {
    this.camera.aspect = aspect;
    const portrait = aspect < 1; this.portrait = portrait;
    this.camera.fov = portrait ? 46 : 34;
    this.camera.position.set(this.panNow, 1.35, portrait ? 7.4 : 5.6);
    this.camera.lookAt(this.panNow, 1.0, 0);
    this.camera.updateProjectionMatrix();
    this.chars.forEach((c, i) => { const x = (i - (this.chars.length - 1) / 2) * (portrait ? 1.15 : 1.55); c.base.x = x; if (!this.focused && !this.selected && !this.enRoute) c.char.teleport(new THREE.Vector3(x, 0, 0), 0); });
    if (this.focused) { const sel = this.chars.find(c => c.def.id === this.focused); if (sel) sel.char.obj.position.x = portrait ? 0 : -.9; this.frameBody(); }
  }

  /** Le fond (la vue) couvre toujours tout l'ecran, comme une image en "cover" : sur un telephone en hauteur, la camera
   *  voit plus bas que le bas de l'image (bande grise). On l'agrandit juste ce qu'il faut ; l'horizon (40 % du haut) reste a 3,4. */
  private couvrirFond() {
    const b = this.backdrop; if (!b) return;
    const g = b.geometry as THREE.PlaneGeometry, w = g.parameters.width, h = g.parameters.height, yH = 3.4;
    const cam = this.camera; cam.updateMatrixWorld();
    let s = 1;
    for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const d = new THREE.Vector3(nx, ny, .5).unproject(cam).sub(cam.position);
      if (d.z > -1e-6) continue;                                    // ce coin ne regarde pas vers le fond
      const t = (b.position.z - cam.position.z) / d.z, X = cam.position.x + d.x * t, Y = cam.position.y + d.y * t;
      s = Math.max(s, (Math.abs(X) + 1.6) / (w / 2), Y < yH ? (yH - Y) / (.6 * h) : (Y - yH) / (.4 * h));   // + le balancement du fond (1,5)
    }
    if (s > 1) s *= 1.02;
    b.scale.set(s, s, 1); b.position.y = yH - .1 * h * s;
  }
  /** Touche un personnage : il danse, les autres regardent. Renvoie l'id ou null. */
  pick(x: number, y: number): string | null {
    const v = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    for (const c of this.chars) {
      const hits = this.ray.intersectObject(c.char.obj, true);
      if (hits.length) return c.def.id;
    }
    return null;
  }
  private dancing = '';
  private demande: string | null = null;
  private enRoute = false;
  private routeEpoch = 0;
  private route: THREE.Vector3[][] = [];
  private danseTimer: ReturnType<typeof setTimeout> | undefined;
  select(id: string) {
    if (!this.chars.some(c => c.def.id === id)) return;
    this.selected = id; this.demande = id; this.dancing = '';
    clearTimeout(this.danseTimer);
    void this.trajets();
  }
  /** Fiche fermée : chacun retourne à sa place. */
  deselect() {
    this.selected = ''; this.dancing = '';
    this.demande = ''; clearTimeout(this.danseTimer); void this.trajets();
  }
  private mouvements = new Map<Character, { cible: THREE.Vector3; vitesse: THREE.Vector3; epoch: number }>();
  private danseRestante = 0;
  private brasDanse = new Map<Character, { os: { bone: THREE.Object3D; repos: THREE.Quaternion }[]; poids: number; amplitude: number }>();
  private adoucirBrasDanse(char: Character, active: boolean, dt: number) {
    const r = this.brasDanse.get(char); if (!r) return;
    // L'entrée du clip est déjà fondue depuis idle ; limiter les bras dès la première image.
    r.poids = active ? 1 : Math.max(0, r.poids - dt / .85);
    if (!r.poids) return;
    for (const { bone, repos } of r.os) bone.quaternion.slerp(repos, r.amplitude * r.poids);
    char.obj.updateMatrixWorld(true);
  }
  private arreterAccueil() {
    this.routeEpoch++; this.mouvements.clear(); this.enRoute = false;
    this.demande = null; this.dancing = ''; this.danseRestante = 0;
    clearTimeout(this.danseTimer);
    for (const c of this.chars) { c.char.annulerMarche(); c.char.play('idle', .85); }
  }
  private trajets() {
    if (this.focused) return;
    const epoch = ++this.routeEpoch, id = this.demande;
    this.demande = null; this.route = []; this.danseRestante = 0;
    // Conserver la vitesse courante si une sélection arrive pendant un déplacement.
    for (const c of this.chars) {
      const vitesse = this.mouvements.get(c.char)?.vitesse.clone() ?? new THREE.Vector3();
      c.char.annulerMarche(); c.char.play('idle', .85);
      this.mouvements.set(c.char, { cible: new THREE.Vector3(c.base.x, 0, c.def.id === id ? .4 : 0), vitesse, epoch });
    }
    this.enRoute = true;
  }
  sheetOpen = false;
  private orienter(c: { char: Character }, angle: number, dt: number) {
    const dy = Math.atan2(Math.sin(angle - c.char.obj.rotation.y), Math.cos(angle - c.char.obj.rotation.y));
    c.char.obj.rotation.y += dy * (1 - Math.exp(-4 * dt));
  }
  private lookAt(c: { char: Character }, target: THREE.Vector3, dt: number) {
    const d = target.clone().sub(c.char.obj.position);
    if (d.lengthSq() > 1e-8) this.orienter(c, Math.atan2(d.x, d.z), dt);
  }
  private avancerAccueil(dt: number) {
    for (const [char, m] of this.mouvements) {
      if (m.epoch !== this.routeEpoch) { this.mouvements.delete(char); continue; }
      // Ressort amorti exact : départ/arrêt doux, sans coupure à chaque clic ni dépendance au FPS.
      const ecart = char.obj.position.clone().sub(m.cible), omega = 9;
      const j = m.vitesse.clone().addScaledVector(ecart, omega), e = Math.exp(-omega * dt);
      char.obj.position.copy(m.cible).add(ecart.addScaledVector(j, dt).multiplyScalar(e));
      m.vitesse.addScaledVector(j, -omega * dt).multiplyScalar(e);
      const vitesse = m.vitesse.length();
      if (char.obj.position.distanceToSquared(m.cible) < .000025 && vitesse < .04) {
        char.obj.position.copy(m.cible); char.play('idle', .35); this.mouvements.delete(char);
      } else {
        const recul = m.cible.z < char.obj.position.z;
        const clip = recul && char.has('walk_back') ? 'walk_back' : 'walk';
        char.play(clip, .18, 1); // cadence normale : play() ne réactualise pas la vitesse d’un clip déjà lancé
      }
    }
    if (this.enRoute && !this.mouvements.size) {
      this.enRoute = false;
      const c = this.chars.find(x => x.def.id === this.selected);
      if (c) {
        const danses = c.char.variantes('dance').sort();
        const index = Math.max(0, ['lea', 'marcel', 'jimy'].indexOf(c.def.id));
        const prefere = c.def.id === 'marcel' ? 'dance_9' : c.def.id === 'jimy' ? 'dance' : undefined;
        const clip = prefere ? (c.char.has(prefere) ? prefere : undefined) : danses[index % Math.max(1, danses.length)];
        if (clip) { c.char.play(clip, .25, 1); this.dancing = c.def.id; this.danseRestante = 6; }
      }
    }
    if (this.dancing && (this.danseRestante -= dt) <= 0) {
      this.chars.find(c => c.def.id === this.dancing)?.char.play('idle', .85); this.dancing = '';
    }
  }
  /** Positions écran des têtes, pour les étiquettes HTML. */
  labels(): { id: string; x: number; y: number; visible: boolean }[] {
    const v = new THREE.Vector3();
    return this.chars.map(c => {
      v.set(c.char.obj.position.x, 1.95, c.char.obj.position.z).project(this.camera);
      return { id: c.def.id, x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight, visible: v.z < 1 };
    });
  }
  update(dt: number) {
    dt = Math.max(0, Math.min(dt, .05));
    this.t += dt;
    const selH = this.chars.find(c => c.def.id === this.selected);
    const hm = this.halo.material as THREE.MeshBasicMaterial;
    hm.opacity += ((selH ? .7 : 0) - hm.opacity) * Math.min(1, dt * 5);
    if (selH) { this.halo.position.x = selH.char.obj.position.x; this.halo.position.z = selH.char.obj.position.z; this.halo.scale.setScalar(1 + Math.sin(this.t * 2) * .04); }
    if (this.focused) { for (const r of this.brasDanse.values()) r.poids = 0; this.mouvements.clear(); this.enRoute = false; this.danseRestante = 0; for (const c of this.chars) c.char.update(dt); this.suivreCamera(dt); return; }
    const want = this.portrait ? 0 : this.pan;
    const lookY = this.portrait && this.sheetOpen ? -.45 : 1.0;       // fiche ouverte sur téléphone : le personnage monte au-dessus du panneau
    if (Math.abs(want - this.panNow) > .001 || Math.abs(lookY - this.lookYNow) > .001) {
      this.panNow += (want - this.panNow) * Math.min(1, dt * 4); this.lookYNow += (lookY - this.lookYNow) * Math.min(1, dt * 4);
      this.camera.position.x = this.panNow; this.camera.lookAt(this.panNow, this.lookYNow, 0);
    }
    this.avancerAccueil(dt);
    const sel = this.chars.find(c => c.def.id === this.selected);
    for (const c of this.chars) {
      c.char.update(dt);
      this.adoucirBrasDanse(c.char, this.dancing === c.def.id, dt);
      if (sel && c !== sel) this.lookAt(c, sel.char.obj.position, dt);
      else if (c === sel) this.orienter(c, 0, dt);
      else this.orienter(c, c.base.x < 0 ? .3 : c.base.x > 0 ? -.3 : 0, dt);
    }
    if (this.backdrop) this.backdrop.position.x = Math.sin(this.t * .05) * 1.5;
    this.couvrirFond();
  }
}
