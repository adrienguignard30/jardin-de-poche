import * as THREE from 'three';
import { Assets } from './assets';
import { Character } from './character';
import { CATALOG } from './state';

/** Planches de contrôle locales, accessibles uniquement depuis ?audit=1.
 * Trois instants par clip et par corps ; aucune partie n'est changée. */
export async function revueAnimations(assets: Assets) {
  if (document.getElementById('planchesAnimations')) return;
  const personnages = await Promise.all(CATALOG.characters.map(async def => {
    const a = await assets.loadCharacter(def.id, def.file), char = new Character(assets, a);
    char.mesurerSurLaBibliotheque(); return { id: def.id, char };
  }));
  const noms = personnages[0].char.nomsAnimations().sort(); let index = 0;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(256, 250); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e1e6e9');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2));
  const lampe = new THREE.DirectionalLight(0xffffff, 2); lampe.position.set(3, 5, 4); scene.add(lampe);
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: '#aab4b5' }));
  sol.rotation.x = -Math.PI / 2; sol.position.y = -.002; scene.add(sol);
  const camera = new THREE.PerspectiveCamera(35, 256 / 250, .01, 30); camera.position.set(1.7, 1.5, 3.5); camera.lookAt(0, .85, 0);
  const box = document.createElement('div'); box.id = 'planchesAnimations';
  box.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#fafafa;overflow:auto;padding:10px;font:14px system-ui;color:#24313a';
  const barre = document.createElement('div'); barre.style.cssText = 'position:sticky;top:0;background:white;padding:6px;display:flex;gap:12px;align-items:center;z-index:1';
  const titre = document.createElement('b'); titre.id = 'titrePlanche';
  const grille = document.createElement('div'); grille.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));max-width:900px;margin:auto;gap:4px';
  const bouton = (texte: string, f: () => void) => { const b = document.createElement('button'); b.textContent = texte; b.onclick = f; return b; };
  const afficher = () => {
    titre.textContent = `${index + 1}/${noms.length} — ${noms[index]} — Léa / Marcel / Jimy`;
    grille.replaceChildren();
    for (const fraction of [0, .5, .99]) for (const { id, char } of personnages) {
      const t = char.clipDuree(noms[index]) * fraction; char.poserAnimation(noms[index], t); scene.add(char.obj);
      renderer.render(scene, camera);
      const cell = document.createElement('div'); cell.style.cssText = 'text-align:center';
      const label = document.createElement('div'); label.textContent = `${id} — ${t.toFixed(2)} s`;
      const img = document.createElement('img'); img.src = renderer.domElement.toDataURL('image/png'); img.alt = `${noms[index]} ${id} ${t.toFixed(2)} s`; img.style.cssText = 'width:100%;max-width:256px';
      cell.append(label, img); grille.append(cell); scene.remove(char.obj);
    }
  };
  barre.append(bouton('Précédente', () => { index = (index + noms.length - 1) % noms.length; afficher(); }),
    bouton('Suivante', () => { index = (index + 1) % noms.length; afficher(); }), titre,
    bouton('Fermer les planches', () => { renderer.dispose(); sol.geometry.dispose(); (sol.material as THREE.Material).dispose(); box.remove(); }));
  box.append(barre, grille); document.body.append(box); afficher();
}
