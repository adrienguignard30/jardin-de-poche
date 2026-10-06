// =============================================================================================
//  LE CLASSEMENT — affiché au même format dans le téléphone et sur l'accueil.
//  Seuls les comptes avec un pseudo y figurent (pas les invités, pas les voisins du jeu), sous leur pseudo.
//  Podium pour les 3 premiers, liste ensuite, et « ta place » toujours visible, même hors du top 20.
// =============================================================================================
import * as EL from './enligne';
import { t } from './i18n';

const esc = (x: string) => x.replace(/[<>&"]/g, '');
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e;
}

/** Ta place, même hors du top 20 (fonction SQL « mon_rang »). */
async function monRang(cat: EL.Categorie): Promise<{ rang: number; total: number; score: number } | null> {
  if (!EL.sb) return null;
  try { const { data } = await EL.sb.rpc('mon_rang', { p_type: cat }); const r = (data ?? [])[0]; return r ? { rang: Number(r.rang), total: Number(r.total), score: Number(r.score) } : null; }
  catch { return null; }
}

let catCourante: EL.Categorie = 'trocs';
/** Remplit « c » avec le classement complet (onglets, podium, liste, ta place). */
export function remplirClassement(hote: HTMLElement) {
  const s = t() as any;
  let c = hote.querySelector(':scope > .classementPro') as HTMLElement | null;   // une enveloppe à lui : le conteneur du téléphone sert à toutes les applis
  if (!c) { c = el('div', 'classementPro'); hote.appendChild(c); }
  c.innerHTML = '';
  const racine = hote;
  if (!EL.EN_LIGNE) { c.appendChild(el('p', 'small', s.classementHorsLigne)); return; }
  const cats: [EL.Categorie, string, string][] = [['trocs', s.catTrocs, '🔄'], ['recoltes', s.catRecoltes, '🥕'], ['offerts', s.catOfferts, '🍲'], ['recus', s.catRecus, '🎁']];
  const onglets = el('div', 'ongletsClassement');
  for (const [k, nom, ic] of cats) { const b = el('button', 'og' + (k === catCourante ? ' on' : ''), `<span>${ic}</span>${nom}`); b.onclick = () => { catCourante = k; remplirClassement(racine); }; onglets.appendChild(b); }
  c.appendChild(onglets);
  const zone = el('div', 'zoneClassement', `<p class="small">…</p>`); c.appendChild(zone);
  const cat = catCourante;
  Promise.all([EL.classement(cat), monRang(cat)]).then(([rangs, moi]) => {
    if (cat !== catCourante) return;
    zone.innerHTML = '';
    if (!rangs.length) zone.appendChild(el('div', 'videClassement', `<div class="grand">🏆</div><p>${s.classementVide}</p>`));
    else {
      // le podium : 2e à gauche, 1er au centre (plus haut), 3e à droite
      const podium = el('div', 'clPodium');
      for (const i of [1, 0, 2]) {
        const r = rangs[i]; const marche = el('div', 'clMarche m' + (i + 1) + (r?.moi ? ' moi' : ''));
        marche.innerHTML = r ? `<div class="clMed">${['🥇', '🥈', '🥉'][i]}</div><div class="clNom">${esc(r.nom)}</div><div class="clScore">${r.score}</div><div class="clSocle">${r.rang}</div>` : `<div class="clMed vide">·</div><div class="clSocle">${i + 1}</div>`;
        podium.appendChild(marche);
      }
      zone.appendChild(podium);
      const liste = el('div', 'listeClassement');
      for (const r of rangs.slice(3)) liste.appendChild(el('div', 'row rang' + (r.moi ? ' moi' : ''), `<span class="n">${r.rang}</span><span class="nom">${esc(r.nom)}${r.moi ? ` <i>(${s.toi})</i>` : ''}</span><b>${r.score}</b>`));
      zone.appendChild(liste);
    }
    // ta place
    const compte = EL.etatCompte();
    let bandeau = '';
    if (!compte.connecte || compte.invite) bandeau = s.classementInvite;
    else if (moi) bandeau = s.taPlace.replace('{r}', String(moi.rang)).replace('{n}', String(moi.total)).replace('{s}', String(moi.score));
    else bandeau = s.horsClassement;
    zone.appendChild(el('div', 'taPlace' + (moi ? ' ok' : ''), bandeau));
  });
}

export const STYLE_CLASSEMENT = `
.classementPro .ongletsClassement { display: flex; gap: 6px; margin-top: 8px; }
.classementPro .ongletsClassement .og { flex: 1; padding: 8px 4px; border-radius: 12px; background: rgba(36,49,58,.07); border: 0; font-weight: 700; color: #24313a; font-size: 12px; display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer; }
.classementPro .ongletsClassement .og span { font-size: 18px; }
.classementPro .ongletsClassement .og.on { background: #24313a; color: #fff; }
.classementPro .clPodium { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: end; gap: 8px; margin: 14px 0 8px; }
.classementPro .clMarche { display: flex; flex-direction: column; align-items: center; text-align: center; min-width: 0; }
.classementPro .clMed { font-size: 28px; line-height: 1; } .classementPro .clMed.vide { color: #b8c2c8; }
.classementPro .clNom { font-weight: 800; font-size: 13px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 4px; }
.classementPro .clScore { font-size: 12px; color: #5b6b75; font-weight: 700; }
.classementPro .clSocle { width: 100%; margin-top: 6px; border-radius: 10px 10px 4px 4px; background: linear-gradient(#f3d27a, #e2b247); color: #6b4f15; font-weight: 900; font-size: 18px; display: flex; align-items: center; justify-content: center; }
.classementPro .clMarche.m1 .clSocle { height: 74px; } .classementPro .clMarche.m2 .clSocle { height: 54px; background: linear-gradient(#e6ebee, #c4ced4); color: #4b5a63; } .classementPro .clMarche.m3 .clSocle { height: 42px; background: linear-gradient(#f0c9a4, #d39a68); color: #6b3f1c; }
.classementPro .clMarche.moi .clNom { color: #2f7a45; }
.classementPro .listeClassement { display: flex; flex-direction: column; gap: 6px; }
.classementPro .row.rang { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 12px; background: rgba(36,49,58,.05); }
.classementPro .row.rang .n { width: 28px; text-align: center; font-weight: 800; } .classementPro .row.rang .nom { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.classementPro .row.rang.moi { border: 2px solid #3f9a5a; background: #eef8f0; }
.classementPro .videClassement { text-align: center; padding: 18px 8px; color: #5b6b75; } .classementPro .videClassement .grand { font-size: 44px; }
.classementPro .taPlace { position: sticky; bottom: 0; z-index: 2; margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: #fff7e0; color: #6b4f15; font-weight: 700; font-size: 13px; text-align: center; box-shadow: 0 -6px 14px rgba(255,253,248,.95), 0 20px 0 8px #fffdf8; }   /* l'ombre pleine du dessous cache la liste qui défile, sans créer de défilement horizontal */
.classementPro .taPlace.ok { background: #eef8f0; color: #2f7a45; }
.fenClassement { width: 100%; }
.fenClassement h2 { margin: 0 0 4px; padding-right: 44px; font-size: 22px; }
#start .btnClassementAccueil { border: 1px solid rgba(255,255,255,.5); border-radius: 999px; padding: 8px 16px; background: rgba(255,255,255,.88); box-shadow: 0 4px 14px rgba(0,0,0,.18); font-weight: 800; color: #24313a; font-size: 14px; cursor: pointer; }
@media (max-width: 640px) { #ui > .overlay.start > .startTop { padding-top: calc(98px + var(--sat, 0px)); } }   /* sur téléphone, le titre passe sous les boutons Compte / Démo / langues (ils le cachaient) */
@media (max-width: 420px) { #start .btnClassementAccueil { padding: 7px 12px; font-size: 13px; } .classementPro .clMed { font-size: 24px; } .classementPro .clMarche.m1 .clSocle { height: 60px; } .classementPro .clMarche.m2 .clSocle { height: 44px; } .classementPro .clMarche.m3 .clSocle { height: 34px; } }
`;
