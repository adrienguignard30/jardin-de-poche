// =============================================================================================
//  Le ciel : de temps en temps, quelque chose de drôle passe au loin derrière les toits (un chat en traîneau tiré par des
//  pigeons, une montgolfière-tomate…). Les dessins viennent d'une seule planche : public/ciel/planche-ciel.png,
//  PNG transparent, 5 colonnes × 4 lignes, un dessin par case, tourné vers la droite.
//  Rare exprès : une apparition toutes les 1,5 à 4 minutes, jamais deux fois la même d'affilée.
// =============================================================================================
import * as THREE from 'three';


interface Volant { tex: THREE.Texture; ratio: number; index: number; nuit: boolean; nom: string; gauche?: boolean; echelle?: number }

/** Trouve chaque dessin d'une planche : taches de pixels visibles (sur une copie réduite), puis découpe à pleine résolution. */
function decouper(img: HTMLImageElement, lueur = false): { tex: THREE.Texture; ratio: number; echelle: number }[] { const W0 = img.width, H0 = img.height, f = Math.max(1, Math.ceil(Math.max(W0, H0) / 500)); const w = Math.ceil(W0 / f), h = Math.ceil(H0 / f); const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const cx = cv.getContext("2d", { willReadFrequently: true })!; cx.drawImage(img, 0, 0, w, h); const d = cx.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 24 ? 1 : 0; const lab = new Int32Array(w * h).fill(-1), boites: { x0: number; y0: number; x1: number; y1: number; n: number; id: number; membres: number[] }[] = []; for (let s0 = 0; s0 < w * h; s0++) { if (!m[s0] || lab[s0] >= 0) continue; const id = boites.length, b = { x0: w, y0: h, x1: 0, y1: 0, n: 0, id, membres: [id] }; boites.push(b); const pile = [s0]; lab[s0] = id; while (pile.length) { const p = pile.pop()!, x = p % w, y = (p / w) | 0; b.n++; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const q = ny * w + nx; if (m[q] && lab[q] < 0) { lab[q] = id; pile.push(q); } } } } const grands = boites.filter(b => b.n > w * h * .002); for (const b of boites) { if (grands.includes(b) || b.n < 2) continue; const g = grands.find(G => { const mx = (G.x1 - G.x0) * .15, my = (G.y1 - G.y0) * .15; return b.x0 >= G.x0 - mx && b.x1 <= G.x1 + mx && b.y0 >= G.y0 - my && b.y1 <= G.y1 + my; }); if (g) { g.x0 = Math.min(g.x0, b.x0); g.y0 = Math.min(g.y0, b.y0); g.x1 = Math.max(g.x1, b.x1); g.y1 = Math.max(g.y1, b.y1); g.membres.push(b.id); } } return grands.map(b => { const X0 = Math.max(0, b.x0 * f - f), Y0 = Math.max(0, b.y0 * f - f), X1 = Math.min(W0, (b.x1 + 2) * f), Y1 = Math.min(H0, (b.y1 + 2) * f); const k = Math.min(1, 384 / Math.max(X1 - X0, Y1 - Y0)); const ow = Math.max(1, Math.round((X1 - X0) * k)), oh = Math.max(1, Math.round((Y1 - Y0) * k)); const mx0 = Math.floor(X0 / f), my0 = Math.floor(Y0 / f), mx1 = Math.min(w, Math.ceil(X1 / f)), my1 = Math.min(h, Math.ceil(Y1 / f)); const mw = Math.max(1, mx1 - mx0), mh = Math.max(1, my1 - my0), siens = new Set(b.membres); const mc = document.createElement("canvas"); mc.width = mw; mc.height = mh; const mctx = mc.getContext("2d")!, md = mctx.createImageData(mw, mh); for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { let dedans = false; for (let dy = -1; dy <= 1 && !dedans; dy++) for (let dx = -1; dx <= 1 && !dedans; dx++) { const X = mx0 + x + dx, Y = my0 + y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && siens.has(lab[Y * w + X])) dedans = true; } if (dedans) md.data[(y * mw + x) * 4 + 3] = 255; } mctx.putImageData(md, 0, 0); const out = document.createElement("canvas"); out.width = ow; out.height = oh; const o = out.getContext("2d")!; o.drawImage(img, X0, Y0, X1 - X0, Y1 - Y0, 0, 0, ow, oh); o.globalCompositeOperation = "destination-in"; o.imageSmoothingEnabled = true; o.drawImage(mc, X0 / f - mx0, Y0 / f - my0, (X1 - X0) / f, (Y1 - Y0) / f, 0, 0, ow, oh); o.globalCompositeOperation = "source-over"; let fin: HTMLCanvasElement = out, echelle = 1; if (lueur) { const p = Math.round(Math.max(ow, oh) * .18), g = document.createElement("canvas"); g.width = ow + 2 * p; g.height = oh + 2 * p; const gx = g.getContext("2d")!; gx.shadowColor = "rgba(255, 214, 120, 0.95)"; gx.shadowBlur = p * .9; gx.drawImage(out, p, p); gx.drawImage(out, p, p); gx.shadowBlur = 0; gx.shadowColor = "transparent"; gx.drawImage(out, p, p); fin = g; echelle = g.height / oh; } const tex = new THREE.CanvasTexture(fin); tex.colorSpace = THREE.SRGBColorSpace; return { tex, ratio: fin.width / fin.height, echelle }; }); }

export class Ciel {
  private volants: Volant[] = [];
  private actif: { s: THREE.Sprite; t0: number; dur: number; versDroite: boolean; y: number; z: number; bob: number; fen?: { de: THREE.Vector3; a: THREE.Vector3 } } | null = null;
  private etiquette: HTMLDivElement | null = null;
  private prochain = performance.now() + (new URLSearchParams(location.search).has('ciel') ? 4000 : 25000);   // la première après 25 s (4 s avec ?ciel pour vérifier)
  onPassage: ((s: THREE.Sprite) => void) | null = null;
  private dernier = -1;
  private finPassageFenetre = 0;
  /** Un dessin existant traverse la fenêtre pendant que le personnage l'observe. */
  passageFenetre(duree = 9000) {
    if (!this.fenetre()) return;
    this.finPassageFenetre = performance.now() + duree;
    if (this.actif) {
      this.scene.remove(this.actif.s);
      (this.actif.s.material as THREE.SpriteMaterial).dispose();
      this.actif = null;
    }
    this.etiquette?.remove(); this.etiquette = null;
    this.prochain = performance.now();
  }
  constructor(private scene: THREE.Scene, private nuit: () => number, private camera: THREE.PerspectiveCamera,
              private fenetre: () => { centre: THREE.Vector3; dehors: THREE.Vector3; travers: THREE.Vector3; largeur: number } | null = () => null) { this.charger(); }
  /** Le point du monde, sur le plan de profondeur z, qui se trouve à l'endroit (x, y) de l'écran (de -1 à 1). */
  private surEcran(x: number, y: number, z: number): THREE.Vector3 {
    const p = new THREE.Vector3(x, y, .5).unproject(this.camera), o = this.camera.position;
    const d = p.sub(o).normalize(); const t = (z - o.z) / (d.z || -1e-3);
    return o.clone().addScaledVector(d, t);
  }

  /** Les planches : public/ciel/planches.json liste les fichiers (et lesquels sont pour la nuit). Chaque planche peut contenir
   *  n'importe quel nombre de dessins, dans n'importe quelle disposition : on les trouve en cherchant les taches non transparentes. */
  private async charger() {
    let liste: { fichier: string; nuit: boolean; sauf?: number[]; gauche?: number[] }[] = [];
    try { const r = await fetch('ciel/planches.json'); if (r.ok) liste = await r.json(); } catch { /* pas de liste */ }
    if (!liste.length) liste = [{ fichier: 'planche-ciel.png', nuit: false }];
    for (const pl of liste) {
      const img = new Image(); img.src = `ciel/${pl.fichier}`;
      try { await img.decode(); } catch { continue; }
      const retires: string[] = (() => { try { return JSON.parse(localStorage.getItem('jdp.ciel.sauf') || '[]'); } catch { return []; } })();
      decouper(img, pl.nuit).forEach((tex, i) => { if (!(pl.sauf ?? []).includes(i + 1) && !retires.includes(`${pl.fichier.replace('.png', '')} n°${i + 1}`)) this.volants.push({ tex: tex.tex, ratio: tex.ratio, index: this.volants.length, nuit: pl.nuit, gauche: (pl.gauche ?? []).includes(i + 1), echelle: tex.echelle, nom: `${pl.fichier.replace('.png', '')} n°${i + 1}` }); });
    }
    console.info(`[ciel] ${this.volants.length} dessins prêts (${this.volants.filter(v => v.nuit).length} de nuit)`);
  }
  update() {
    const now = performance.now();
    if (this.actif) {
      const a = this.actif, k = (now - a.t0) / a.dur;
      if (k >= 1) { this.scene.remove(a.s); (a.s.material as THREE.SpriteMaterial).dispose(); this.actif = null; this.etiquette?.remove(); this.etiquette = null; return; }
      if (a.fen) {                                                              // derrière la fenêtre du fond
        a.s.position.lerpVectors(a.fen.de, a.fen.a, k); a.s.position.y += Math.sin(k * Math.PI * 5) * .15;
      } else {
        // il traverse l'écran d'un bord à l'autre, dans le haut du ciel, entre la ville lointaine et les toits proches
        const x = a.versDroite ? -1.3 + 2.6 * k : 1.3 - 2.6 * k;
        a.s.position.copy(this.surEcran(x, a.y + Math.sin(k * Math.PI * 6) * a.bob, a.z));
      }
      if (this.etiquette) { this.etiquette.style.display = ''; const p = a.s.position.clone().project(this.camera); this.etiquette.style.left = `${(p.x + 1) / 2 * innerWidth}px`; this.etiquette.style.top = `${(1 - p.y) / 2 * innerHeight + 30}px`; }
      a.s.visible = true; (a.s.material as THREE.SpriteMaterial).opacity = Math.min(1, k * 8, (1 - k) * 8);
      (a.s.material as THREE.SpriteMaterial).rotation = Math.sin(k * Math.PI * 4) * .06;
      return;
    }
    const passageDemande = this.finPassageFenetre > now;
    if (now < this.prochain || !this.volants.length) return;
    this.prochain = now + (new URLSearchParams(location.search).has('ciel') ? 12000 : (60 + Math.random() * 40) * 1000);   // la suivante dans 1,5 à 4 min (12 s avec ?ciel)
    const nuit = this.nuit() > .5;
    let choix = this.volants.filter(v => v.nuit === nuit && v.index !== this.dernier);
    if (!choix.length) choix = this.volants.filter(v => v.index !== this.dernier);
    if (!choix.length) return;
    const v = choix[Math.floor(Math.random() * choix.length)];
    this.dernier = v.index;
    // loin derrière les toits proches (z = -40) et devant la ville lointaine (z = -150), dans le haut de l'écran
    const versDroite = Math.random() < .6, z = -85 - Math.random() * 30;
    const taille = (5 + Math.random() * 3) * (-z / 100) * (v.echelle ?? 1);
    const mat = new THREE.SpriteMaterial({ map: v.tex, transparent: true, depthWrite: true, alphaTest: .25, fog: false });
    const s = new THREE.Sprite(mat); s.scale.set(taille * v.ratio * (versDroite !== !!v.gauche ? 1 : -1), taille, 1);
    s.position.set(0, -1000, 0); mat.opacity = 0; s.visible = false; this.scene.add(s);
    // un passage sur deux derrière la fenêtre du fond (s'il y en a une) : à sa hauteur, 7 m dehors, de biais
    const f = this.fenetre();
    let fen: { de: THREE.Vector3; a: THREE.Vector3 } | undefined;
    if (f && (passageDemande || Math.random() < .7)) {
      const loinF = f.centre.clone().addScaledVector(f.dehors, 7), sg = versDroite ? 1 : -1; const horsEcran = (dir: number) => { let L = 4; while (L < 400 && Math.abs(loinF.clone().addScaledVector(f.travers, dir * L).project(this.camera).x) < 1.15) L *= 1.25; return L; };
      fen = { de: loinF.clone().addScaledVector(f.travers, -sg * horsEcran(-sg)), a: loinF.clone().addScaledVector(f.travers, sg * horsEcran(sg)) };
      if (passageDemande) {
        const marge = Math.max(1, f.largeur * .75);
        fen = { de: loinF.clone().addScaledVector(f.travers, -sg * marge), a: loinF.clone().addScaledVector(f.travers, sg * marge) };
      }
      const t2 = 1.3 * (v.echelle ?? 1); s.scale.set(t2 * v.ratio * (versDroite !== !!v.gauche ? 1 : -1), t2, 1);
    }
    console.info(`[ciel] passe : ${v.nom}${fen ? ' (derrière la fenêtre)' : ''}`);
    if (new URLSearchParams(location.search).has('ciel')) {               // mode vérification : le nom du dessin s'affiche sous lui
      this.etiquette = document.createElement('div');
      this.etiquette.style.cssText = 'display:none;position:fixed;z-index:50;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#fff;font:600 13px sans-serif;padding:5px 10px;border-radius:10px;cursor:pointer';
      this.etiquette.textContent = `${v.nom}  ·  ✕ retirer`;
      this.etiquette.onclick = () => {                                   // le retirer : il ne repassera plus
        try { const l = JSON.parse(localStorage.getItem('jdp.ciel.sauf') || '[]'); l.push(v.nom); localStorage.setItem('jdp.ciel.sauf', JSON.stringify(l)); } catch { /* ignore */ }
        this.volants = this.volants.filter(x => x !== v);
        if (this.actif) { this.scene.remove(this.actif.s); this.actif = null; }
        this.etiquette?.remove(); this.etiquette = null;
        console.info(`[ciel] « ${v.nom} » retiré. Dis-le à Claude pour qu'il soit retiré pour tout le monde.`);
      };
      document.body.appendChild(this.etiquette);
    }
    if (!fen) this.onPassage?.(s);
    this.actif = { s, t0: now, dur: passageDemande ? Math.max(1000, this.finPassageFenetre - now) : (fen ? 16 + Math.random() * 8 : 24 + Math.random() * 14) * 1000, versDroite, y: .5 + Math.random() * .25, z, bob: .015 + Math.random() * .02, fen };
    this.finPassageFenetre = 0;
  }
}
