import * as THREE from 'three';

// Tout est dessiné à la volée (canvas), aucun fichier. Les sprites vivent loin derrière le décor.
function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!; draw(c, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function sprite(tex: THREE.Texture, w: number, h: number, opacity = 1): THREE.Sprite {
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity, depthWrite: false, fog: false });
  const s = new THREE.Sprite(m); s.scale.set(w, h, 1); s.renderOrder = -5; return s;
}
const cloudTex = canvas(256, 128, (c, w, h) => {
  const puffs = [[70, 78, 46], [120, 60, 58], [170, 76, 48], [100, 90, 40], [145, 92, 42], [60, 92, 30], [190, 94, 30]];
  for (const [x, y, r] of puffs) { const g = c.createRadialGradient(x, y, r * .1, x, y, r); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.75, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
});
const discTex = (color: string, glow: string) => canvas(128, 128, (c, w) => { const g = c.createRadialGradient(64, 64, 20, 64, 64, 64); g.addColorStop(0, color); g.addColorStop(.45, color); g.addColorStop(.5, glow); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); });
const moonTex = canvas(128, 128, (c) => { c.fillStyle = '#fbf5dc'; c.beginPath(); c.arc(64, 64, 34, 0, 6.29); c.fill(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(80, 54, 30, 0, 6.29); c.fill(); });
const birdFrames = [0, 1, 2].map(k => canvas(64, 32, (c) => {
  c.strokeStyle = '#2b333a'; c.lineWidth = 3; c.lineCap = 'round';
  const dy = [-8, 0, 8][k];
  c.beginPath(); c.moveTo(6, 16 + dy); c.quadraticCurveTo(20, 10, 32, 18); c.quadraticCurveTo(44, 10, 58, 16 + dy); c.stroke();
}));
const planeTex = canvas(128, 40, (c) => {
  c.fillStyle = '#f4f6f8'; c.strokeStyle = '#7d8790'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(20, 20); c.lineTo(100, 20); c.lineTo(112, 16); c.lineTo(100, 12); c.lineTo(20, 12); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(50, 16); c.lineTo(70, 2); c.lineTo(80, 2); c.lineTo(64, 16); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(50, 16); c.lineTo(70, 30); c.lineTo(80, 30); c.lineTo(64, 16); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(22, 16); c.lineTo(14, 4); c.lineTo(26, 4); c.lineTo(32, 16); c.closePath(); c.fill(); c.stroke();
});
const trailTex = canvas(512, 16, (c, w) => { const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.6, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,.75)'); c.fillStyle = g; c.fillRect(0, 4, w, 8); });
const balloonTex = canvas(96, 160, (c) => {
  c.fillStyle = '#f4f2ec'; c.beginPath(); c.arc(48, 48, 40, 0, 6.29); c.fill();
  c.fillStyle = '#7fbf6a'; c.beginPath(); c.arc(48, 48, 40, .6, 2.5); c.lineTo(48, 48); c.fill();
  c.strokeStyle = '#6b7178'; c.lineWidth = 2; c.beginPath(); c.moveTo(30, 84); c.lineTo(40, 128); c.moveTo(66, 84); c.lineTo(56, 128); c.stroke();
  c.fillStyle = '#5a4a3a'; c.fillRect(36, 126, 24, 14);
});
const gagTex = canvas(384, 96, (c) => {                          // le chat sur son traîneau tiré par des poules, en silhouette
  c.font = '64px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; c.textBaseline = 'middle';
  c.filter = 'grayscale(1) brightness(.25)';
  c.fillText('🐔', 8, 48); c.fillText('🐔', 80, 44); c.fillText('🐔', 152, 48); c.fillText('🛷', 236, 56); c.fillText('🐈', 300, 40);
});

class Flyer {
  s: THREE.Sprite; active = false; t = 0; dur = 1; from = new THREE.Vector3(); to = new THREE.Vector3();
  constructor(public parent: THREE.Object3D, tex: THREE.Texture, w: number, h: number) { this.s = sprite(tex, w, h); this.s.visible = false; parent.add(this.s); }
  start(from: THREE.Vector3, to: THREE.Vector3, dur: number) { this.from.copy(from); this.to.copy(to); this.dur = dur; this.t = 0; this.active = true; this.s.visible = true; }
  update(dt: number, wobble = 0) {
    if (!this.active) return; this.t += dt / this.dur;
    if (this.t >= 1) { this.active = false; this.s.visible = false; return; }
    this.s.position.lerpVectors(this.from, this.to, this.t);
    this.s.position.y += Math.sin(this.t * Math.PI * 6) * wobble;
  }
}

export class SkyLife {
  group = new THREE.Group();
  private clouds: { s: THREE.Sprite; speed: number; w: number }[] = [];
  private sun: THREE.Sprite; private moon: THREE.Sprite; private stars: THREE.Points;
  private birds: Flyer[] = []; private birdTimer = 6; private frame = 0;
  private plane: Flyer; private trail: THREE.Sprite; private planeTimer = 18;
  private balloon: THREE.Sprite; private balloonT = 0;
  private gag: Flyer; private gagTimer = 40;
  private rng = () => Math.random();

  constructor(scene: THREE.Scene, private horizonY: number) {
    scene.add(this.group);
    for (let i = 0; i < 8; i++) {
      const w = 16 + this.rng() * 18;
      const s = sprite(cloudTex, w, w * .5, .85);
      s.position.set(-90 + this.rng() * 180, horizonY + 10 + this.rng() * 26, -70 - this.rng() * 30);
      this.clouds.push({ s, speed: .25 + this.rng() * .35, w }); this.group.add(s);
    }
    this.sun = sprite(discTex('#fff4cf', 'rgba(255,240,200,.35)'), 14, 14); this.sun.position.set(38, horizonY + 24, -100); this.group.add(this.sun);
    this.moon = sprite(moonTex, 7, 7); this.moon.position.set(-30, horizonY + 26, -100); this.group.add(this.moon);
    const n = 160, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = -120 + this.rng() * 240; pos[i * 3 + 1] = horizonY + 6 + this.rng() * 50; pos[i * 3 + 2] = -120 + this.rng() * 10; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff6dc, size: .35, transparent: true, opacity: 0, depthWrite: false, fog: false })); this.group.add(this.stars);
    for (let i = 0; i < 7; i++) this.birds.push(new Flyer(this.group, birdFrames[0], 1.6, .8));
    this.plane = new Flyer(this.group, planeTex, 6, 1.9); this.trail = sprite(trailTex, 40, 1.2, .7); this.trail.visible = false; this.group.add(this.trail);
    this.balloon = sprite(balloonTex, 4.2, 7); this.balloon.position.set(52, horizonY + 14, -95); this.group.add(this.balloon);
    this.gag = new Flyer(this.group, gagTex, 7, 1.75);
    this.loadGagImage();
  }

  /** Si tu déposes ui/gag_chat_traineau.png (fond vert), elle remplace la silhouette en emojis. */
  private async loadGagImage() {
    try {
      const r = await fetch('ui/gag_chat_traineau.png'); if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image')) return;
      const bmp = await createImageBitmap(await r.blob());
      const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; const c = cv.getContext('2d')!; c.drawImage(bmp, 0, 0);
      const im = c.getImageData(0, 0, cv.width, cv.height), d = im.data;
      for (let i = 0; i < d.length; i += 4) { const R = d[i], G = d[i + 1], B = d[i + 2]; if (G > 140 && R < 120 && B < 120 && G - Math.max(R, B) > 40) d[i + 3] = 0; }
      c.putImageData(im, 0, 0);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      (this.gag.s.material as THREE.SpriteMaterial).map = t; (this.gag.s.material as THREE.SpriteMaterial).needsUpdate = true;
      this.gag.s.scale.set(8 * (bmp.width / bmp.height) / 4, 8 / 4 * 1, 1); this.gag.s.scale.set(2.2 * bmp.width / bmp.height, 2.2, 1);
    } catch { /* pas d'image : emojis */ }
  }
  update(dt: number, night: number) {
    for (const c of this.clouds) { c.s.position.x += c.speed * dt; if (c.s.position.x > 110) c.s.position.x = -110; const m = c.s.material as THREE.SpriteMaterial; m.opacity = .85 - .45 * night; m.color.setRGB(1 - .72 * night, 1 - .68 * night, 1 - .55 * night); }
    (this.sun.material as THREE.SpriteMaterial).opacity = 1 - night;
    (this.moon.material as THREE.SpriteMaterial).opacity = night;
    (this.stars.material as THREE.PointsMaterial).opacity = night * .9;
    this.balloonT += dt * .15; this.balloon.position.y = this.horizonY + 14 + Math.sin(this.balloonT) * 1.5; this.balloon.position.x = 52 + Math.cos(this.balloonT * .4) * 3;
    (this.balloon.material as THREE.SpriteMaterial).opacity = 1 - .7 * night;
    // oiseaux : un vol toutes les 25 à 45 s
    this.birdTimer -= dt;
    if (this.birdTimer <= 0 && night < .5) {
      this.birdTimer = 14 + this.rng() * 12;
      const dir = this.rng() < .5 ? 1 : -1, y = this.horizonY + 6 + this.rng() * 10, z = -45 - this.rng() * 25;
      this.birds.forEach((b, i) => { const off = i * 1.3; b.start(new THREE.Vector3(-dir * 70 - off * dir, y + Math.sin(i) * 1.2, z), new THREE.Vector3(dir * 70 - off * dir, y + 2 + Math.sin(i) * 1.2, z), 22 + this.rng() * 4); });
    }
    this.frame += dt * 9;
    const f = birdFrames[Math.floor(this.frame) % 3];
    for (const b of this.birds) { b.update(dt, .02); (b.s.material as THREE.SpriteMaterial).map = f; }
    // avion : toutes les 70 à 120 s, avec sa traînée
    this.planeTimer -= dt;
    if (this.planeTimer <= 0) { this.planeTimer = 45 + this.rng() * 40; const y = this.horizonY + 30 + this.rng() * 8; this.plane.start(new THREE.Vector3(-110, y, -105), new THREE.Vector3(110, y + 4, -105), 55); }
    this.plane.update(dt);
    this.trail.visible = this.plane.active;
    if (this.plane.active) { this.trail.position.copy(this.plane.s.position); this.trail.position.x -= 21; this.trail.position.y -= .1; (this.trail.material as THREE.SpriteMaterial).opacity = .55 * (1 - night); }
    (this.plane.s.material as THREE.SpriteMaterial).opacity = 1 - .6 * night;
    // le gag : très rarement, une silhouette qui glisse le long des toits lointains
    this.gagTimer -= dt;
    if (this.gagTimer <= 0 && night < .5) { this.gagTimer = 70 + this.rng() * 60; const y = this.horizonY + 1.2; this.gag.start(new THREE.Vector3(60, y, -58), new THREE.Vector3(-60, y, -58), 40); }
    this.gag.update(dt, .06);
  }
}
