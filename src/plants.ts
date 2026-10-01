import { CATALOG, plantDef, type PlantState, type PlantDef } from './state';

// Stades : 0 semé, 1 pousse, 2 jeune, 3 en fleurs, 4 prête.
// La pousse n'avance que tant que la terre est humide (fenêtre après chaque arrosage).
export const STAGE_AT = [0, 0.12, 0.3, 0.6, 1.0];

export let SPEED = 1; // vitesse démo (?fast=5 dans l'URL)
export function setSpeed(x: number) { SPEED = Math.max(0.1, x); }

export function wetWindowMs(d: PlantDef, acc = 1): number {
  return Math.max(CATALOG.timing.wetMin / acc, d.grow * CATALOG.timing.wetFraction / acc) * 1000 / SPEED;
}
export function isWet(p: PlantState, now = Date.now()): boolean {
  if (!p.wateredAt) return false;
  return now - p.wateredAt < wetWindowMs(plantDef(p.plant), p.acc ?? 1);
}
export function dryFor(p: PlantState, now = Date.now()): number {
  if (!p.wateredAt) return (now - p.sownAt) / 1000;
  return Math.max(0, (now - p.wateredAt - wetWindowMs(plantDef(p.plant), p.acc ?? 1)) / 1000);
}
/** Fait avancer la pousse depuis le dernier calcul, en ne comptant que le temps humide (marche aussi hors ligne). */
export function tick(p: PlantState, now = Date.now()): void {
  const d = plantDef(p.plant);
  const from = p.lastTick, to = now;
  if (to <= from) return;
  if (p.wateredAt) {
    const acc = p.acc ?? 1;
    const wetEnd = p.wateredAt + wetWindowMs(d, acc);
    const a = Math.max(from, p.wateredAt), b = Math.min(to, wetEnd);
    if (b > a) p.grown = Math.min(d.grow, p.grown + (b - a) / 1000 * SPEED * acc);
  }
  p.lastTick = to;
}
export function stage(p: PlantState): number {
  const f = p.grown / plantDef(p.plant).grow;
  let s = 0;
  for (let i = 0; i < STAGE_AT.length; i++) if (f >= STAGE_AT[i]) s = i;
  return s;
}
export const isReady = (p: PlantState) => stage(p) >= 4;
export function isWilted(p: PlantState, now = Date.now()): boolean {
  const s = stage(p);
  return s >= 3 && !isWet(p, now) && dryFor(p, now) > CATALOG.timing.wiltAfterDry / SPEED;
}
export function remainingSec(p: PlantState): number {
  const d = plantDef(p.plant);
  return Math.max(0, (d.grow - p.grown) / SPEED / (p.acc ?? 1));
}
/** Nom de l'objet 3D à afficher pour cette plante maintenant. */
export function objectName(p: PlantState, now = Date.now()): string {
  const s = stage(p);
  if (s <= 1) return `plant_common_s${s}`;
  const wilt = isWilted(p, now) ? '_wilt' : '';
  return `plant_${p.plant}_s${s}${wilt}`;
}
export function water(p: PlantState, now = Date.now()) {
  tick(p, now);
  p.wateredAt = now;
}
export function sow(plant: string, now = Date.now()): PlantState {
  return { plant, sownAt: now, grown: 0, wateredAt: 0, lastTick: now, harvests: 0 };
}
/** Récolte : renvoie la valeur et le nombre d'unités, et remet la plante en fleurs (ou vide le pot). */
export function harvest(p: PlantState, now = Date.now()): { value: number; count: number; emptied: boolean } {
  const d = plantDef(p.plant);
  p.harvests += 1;
  const emptied = p.harvests >= d.harvests;
  if (!emptied) {
    p.grown = d.grow * CATALOG.timing.regrowFraction;
    p.lastTick = now;
    p.wateredAt = now;
  }
  return { value: d.harvest, count: d.yield, emptied };
}
