// L'Atelier : le joueur décrit un objet de déco, Tripo le fabrique en 3D, on le copie dans Supabase Storage.
// Tout passe par ici : le navigateur ne connaît ni la clé Tripo ni la clé Supabase.
// Réglages Vercel : TRIPO_API_KEY (clé Tripo, tsk_…), SUPABASE_SECRET_KEY (clé secrète Supabase, sb_secret_…),
//                   pour « Améliorer ma description », dans l'ordre d'essai : CEREBRAS_API_KEY (gratuit, CEREBRAS_MODEL), GEMINI_API_KEY (gratuit, GEMINI_MODELS),
//                   OPENAI_API_KEY (payant, OPENAI_MODEL). Une seule suffit ; plusieurs = secours automatique.
// Actions (POST JSON) :
//   { action: 'creer', code, prompt, langue, prompt_tripo?, image? }  → vérifie le code (usage unique), lance Tripo (texte, ou photo si image = dataURL jpeg), renvoie { id }
//   { action: 'etat', id }                      → où en est la fabrication ; quand c'est prêt, { statut:'pret', url, image }
//   { action: 'liste', ids: [...] }             → l'état de plusieurs créations (pour « Mes objets »)
//   { action: 'retrouver', code }               → l'objet fabriqué avec ce code (pour le retrouver sur un autre téléphone)
//   { action: 'ameliorer', code, texte, langue } → l'IA propose une description structurée (dans la langue du joueur + en anglais pour Tripo)
import { createHash, randomUUID } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, draco, textureCompress, weld, simplify, getSceneVertexCount, VertexCountMethod } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

export const config = { maxDuration: 60 };   // télécharger puis compresser un modèle de 50 Mo prend 20 à 40 s

const SB = 'https://jbwlhapwszsuwirspybg.supabase.co';
// Tripo : API V3 (deux domaines documentés), puis l'ancienne V2 en secours (elle s'arrête le 31 octobre 2026).
// On essaie dans l'ordre ; si un domaine refuse la clé (401/403) ou est injoignable, on passe au suivant.
const TRIPO_API = [
  { v: 3, base: 'https://openapi.tripo3d.ai/v3' },
  { v: 3, base: 'https://openapi.tripo3d.com/v3' },
  { v: 2, base: 'https://api.tripo3d.ai/v2/openapi' },
];
const MODELE_V3 = 'v3.1-20260211';   // Tripo H3.1, texture détaillée + PBR + géométrie détaillée (« Ultra ») : 50 crédits
const MODELE_V2 = 'v2.5-20250123';
// Pas de filtre de mots ici : c'est la modération de Tripo qui décide (si Tripo refuse tout de suite, le code est rendu au joueur).

const rep = (res, code, corps) => { res.status(code).json(corps); };

async function sbRpc(cle, nom, args) {
  const r = await fetch(`${SB}/rest/v1/rpc/${nom}`, { method: 'POST', headers: { apikey: cle, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const texte = await r.text();
  if (!r.ok) throw new Error(`supabase ${nom} ${r.status} ${texte.slice(0, 200)}`);
  return texte ? JSON.parse(texte) : null;
}
async function sbTable(cle, methode, chemin, corps) {
  const r = await fetch(`${SB}/rest/v1/${chemin}`, { method: methode, headers: { apikey: cle, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: corps ? JSON.stringify(corps) : undefined });
  const texte = await r.text();
  if (!r.ok) throw new Error(`supabase ${chemin} ${r.status} ${texte.slice(0, 200)}`);
  return texte ? JSON.parse(texte) : null;
}
async function sbUpload(cle, chemin, octets, type) {
  const r = await fetch(`${SB}/storage/v1/object/creations/${chemin}`, { method: 'POST', headers: { apikey: cle, 'Content-Type': type, 'x-upsert': 'true' }, body: octets });
  if (!r.ok) throw new Error(`storage ${r.status} ${(await r.text()).slice(0, 200)}`);
  return `${SB}/storage/v1/object/public/creations/${chemin}`;
}
/** Appelle Tripo : `quoi` = 'creer' (texte → modèle) ou 'etat' (tâche). Renvoie data, avec data._v = version utilisée. */
async function tripo(cleTripo, quoi, arg) {
  const essais = [];
  for (const api of TRIPO_API) {
    if (quoi === 'creerImage' && api.v !== 3) continue;   // photo → objet : V3 seulement
    const qualite = { texture: true, pbr: true, texture_quality: 'detailed', geometry_quality: 'detailed', face_limit: 300000 };
    const [methode, chemin, corps] = quoi === 'creer'
      ? (api.v === 3 ? ['POST', '/generation/text-to-model', { prompt: arg, model: MODELE_V3, ...qualite }]
                     : ['POST', '/task', { type: 'text_to_model', prompt: arg, model_version: MODELE_V2, texture: true, pbr: true, texture_quality: 'detailed' }])
      : quoi === 'creerImage' ? ['POST', '/generation/image-to-model', { ...arg, model: MODELE_V3, ...qualite }]
      : ['GET', api.v === 3 ? `/tasks/${arg}` : `/task/${arg}`, null];
    let r;
    try { r = await fetch(`${api.base}${chemin}`, { method: methode, headers: { Authorization: `Bearer ${cleTripo}`, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined }); }
    catch (e) { essais.push(`${api.base}: injoignable`); continue; }
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.code === 0) { const d = j.data ?? {}; d._v = api.v; d._base = api.base; return d; }
    const msg = `${r.status} ${j.code ?? ''} ${(j.message || j.suggestion || '').slice(0, 120)}`;
    if (r.status === 401 || r.status === 403 || r.status === 404) { essais.push(`${api.base}: ${msg}`); continue; }   // clé ou adresse refusée ici : on tente la suivante
    throw new Error(`tripo ${msg}`);   // vraie réponse (modération, crédits, paramètre) : on s'arrête
  }
  throw new Error(`tripo refus partout — ${essais.join(' | ')}`.slice(0, 400));
}

/** Compresse un GLB de Tripo comme les modèles du jeu : doublons retirés, textures WebP (max 2048 px), géométrie Draco.
 *  50 Mo → ~5 Mo, aucune perte visible ; le jeu sait déjà lire Draco et WebP. En cas de souci, on garde le fichier d'origine. */
let ioPromesse = null;
const MAX_SOMMETS = 400000;   // au-delà, le maillage est simplifié (comme les plantes du jeu) : un téléphone ne suivrait pas
async function compresserGlb(octets) {
  const info = { brut: octets.length };
  try {
    if (!ioPromesse) ioPromesse = (async () => new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() }))();
    const io = await ioPromesse;
    const doc = await io.readBinary(new Uint8Array(octets));
    const sommets = getSceneVertexCount(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0], VertexCountMethod.RENDER);
    info.sommets = sommets;
    const etapes = [dedup(), prune()];
    if (sommets > MAX_SOMMETS) { await MeshoptSimplifier.ready; etapes.push(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: MAX_SOMMETS / sommets, error: 0.01, lockBorder: false })); }
    etapes.push(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 86, resize: [2048, 2048] }), draco());
    await doc.transform(...etapes);
    const sortie = Buffer.from(await io.writeBinary(doc));
    info.compresse = sortie.length;
    return { octets: sortie.length < octets.length ? sortie : octets, info };
  } catch (e) { info.erreur = String(e).slice(0, 160); return { octets, info }; }
}

/** Envoie la photo à Tripo (POST /v3/files) et renvoie le jeton de fichier, ou null si l'envoi est refusé. */
async function tripoFichier(cleTripo, octets, type) {
  for (const api of TRIPO_API) {
    if (api.v !== 3) continue;
    try {
      const fd = new FormData(); fd.append('file', new Blob([octets], { type }), type === 'image/png' ? 'photo.png' : 'photo.jpg');
      const r = await fetch(`${api.base}/files`, { method: 'POST', headers: { Authorization: `Bearer ${cleTripo}` }, body: fd });
      const j = await r.json().catch(() => ({}));
      const jeton = j?.data?.file_token || j?.data?.token || j?.data?.id || j?.file_token;
      if (r.ok && jeton) return jeton;
    } catch { /* on essaie l'autre domaine */ }
  }
  return null;
}
/** Lance Tripo à partir d'une photo : d'abord avec le jeton de fichier, sinon avec l'adresse publique de la photo. */
async function tripoDepuisImage(cleTripo, jeton, urlPublique) {
  const essais = []; if (jeton) essais.push({ file_token: jeton }); essais.push({ input: urlPublique }, { url: urlPublique });
  let derniere = null;
  for (const corps of essais) { try { return await tripo(cleTripo, 'creerImage', corps); } catch (e) { derniere = e; } }
  throw derniere ?? new Error('tripo image');
}

/** « Améliorer ma description » : l'IA réécrit la demande du joueur en description structurée [sujet], [détails], [matière], [style], [qualité]. */
async function ameliorer(texte, langue) {
  const cleCerebras = process.env.CEREBRAS_API_KEY, cleGemini = process.env.GEMINI_API_KEY, cleIA = process.env.OPENAI_API_KEY; if (!cleCerebras && !cleGemini && !cleIA) throw new Error('pas_ia');
  const nomLangue = langue === 'en' ? 'English' : langue === 'es' ? 'Spanish' : 'French';
  const systeme = `You write prompts for Tripo, a text-to-3D generator, for a balcony-garden game where the visitor's object is displayed in 3D.
Rewrite the visitor's request into ONE rich description of a SINGLE object, following this order: [subject], [key details/features], [material/texture], [style], [quality]. Keep the visitor's idea and spirit exactly (do not change what they asked for, do not add characters or extra objects). No scene, no background, no ground, no text written on the object. 25 to 60 words.
Answer ONLY with JSON: {"langue": "<the description in ${nomLangue}, for the visitor to read and approve>", "en": "<the same description in English, for Tripo>"}`;
  // Les tentatives, dans l'ordre : chaque modèle Gemini (GEMINI_MODEL, ou GEMINI_MODELS séparés par des virgules), puis OpenAI.
  // Saturation (503/429) : on réessaie une fois après 1,5 s avant de passer au suivant.
  const tentatives = [];
  if (cleCerebras) for (const m of String(process.env.CEREBRAS_MODEL || 'gpt-oss-120b').split(',').map(x => x.trim()).filter(Boolean)) tentatives.push({ qui: 'cerebras', modele: m, base: 'https://api.cerebras.ai/v1', cle: cleCerebras });
  if (cleGemini) for (const m of String(process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || 'gemini-3.8-flash,gemini-2.5-flash').split(',').map(x => x.trim()).filter(Boolean)) tentatives.push({ qui: 'gemini', modele: m });
  if (cleIA) tentatives.push({ qui: 'openai', modele: process.env.OPENAI_MODEL || 'gpt-4o-mini', base: 'https://api.openai.com/v1', cle: cleIA });
  const appelIA = async t => {
    if (t.qui === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${t.modele}:generateContent`, {
        method: 'POST', headers: { 'x-goog-api-key': cleGemini, 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: systeme }] }, contents: [{ role: 'user', parts: [{ text: texte }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 600, responseMimeType: 'application/json' } }),
      });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, msg: (j?.error?.message || '').slice(0, 120), contenu: j.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('') || '' };
    }
    const r = await fetch(`${t.base}/chat/completions`, {   // OpenAI et Cerebras : même format
      method: 'POST', headers: { Authorization: `Bearer ${t.cle}`, 'Content-Type': 'application/json' },
      // les modèles « raisonneurs » (gpt-oss…) consomment des tokens avant d'écrire : large place, raisonnement court
      body: JSON.stringify({ model: t.modele, temperature: 0.7, max_tokens: 2000, ...(t.qui === 'cerebras' ? { reasoning_effort: 'low' } : {}), response_format: { type: 'json_object' }, messages: [{ role: 'system', content: systeme }, { role: 'user', content: texte }] }),
    });
    const j = await r.json().catch(() => ({}));
    const m = j.choices?.[0]?.message ?? {};
    const contenu = (typeof m.content === 'string' && m.content.trim()) ? m.content : (Array.isArray(m.content) ? m.content.map(x => x?.text || '').join('') : '');
    return { ok: r.ok, status: r.status, msg: (j?.error?.message || (r.ok && !contenu ? `réponse vide (${j.choices?.[0]?.finish_reason || '?'})` : '')).slice(0, 120), contenu };
  };
  let contenu = ''; const echecs = [];
  for (const t of tentatives) {
    for (let essai = 0; essai < 2 && !contenu; essai++) {
      let rep;
      try { rep = await appelIA(t); } catch (e) { echecs.push(`${t.qui}/${t.modele}: injoignable`); break; }
      if (rep.ok && rep.contenu) { contenu = rep.contenu; break; }
      echecs.push(`${t.qui}/${t.modele}: ${rep.status} ${rep.msg}`);
      if (rep.status === 503 || rep.status === 429) { if (essai === 0) await new Promise(r => setTimeout(r, 1500)); }   // saturé : un 2e essai
      else break;   // 404 (modèle inconnu), 401 (clé)… : inutile d'insister sur celui-là
    }
    if (contenu) break;
  }
  if (!contenu) throw new Error(`ia ${echecs.join(' | ')}`.slice(0, 300));
  let out = {};
  try { out = JSON.parse(contenu.replace(/^```json\s*|```\s*$/g, '').trim()); } catch { const m = contenu.match(/\{[\s\S]*\}/); try { out = m ? JSON.parse(m[0]) : {}; } catch { out = {}; } }
  const lng = String(out.langue || '').trim().slice(0, 600), en = String(out.en || '').trim().slice(0, 600);
  if (lng.length < 10 || en.length < 10) throw new Error('ia vide');
  return { langue: lng, en };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return rep(res, 405, { erreur: 'methode' });
  const cle = process.env.SUPABASE_SECRET_KEY, cleTripo = process.env.TRIPO_API_KEY;
  if (!cle || !cleTripo) return rep(res, 503, { erreur: 'pas_configure' });
  let p;
  try { p = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch { return rep(res, 400, { erreur: 'corps' }); }
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || String(req.socket?.remoteAddress ?? '');
  const ua = String(req.headers['user-agent'] ?? '').slice(0, 200);
  const empreinte = createHash('sha256').update(`${ip}|${ua}|${cle.slice(-24)}`).digest('hex').slice(0, 24);

  try {
    // ---------- améliorer la description (gratuit pour le joueur, mais il faut un code valide et libre : pas d'usage hors Atelier)
    if (p.action === 'ameliorer') {
      const code = String(p.code ?? '').trim().toUpperCase();
      const texte = String(p.texte ?? '').replace(/\s+/g, ' ').trim();
      const langue = ['fr', 'en', 'es'].includes(p.langue) ? p.langue : 'fr';
      if (!/^[A-Z0-9-]{6,24}$/.test(code)) return rep(res, 400, { erreur: 'code_invalide' });
      if (texte.length < 3 || texte.length > 300) return rep(res, 400, { erreur: 'texte_longueur' });
      const l = await sbTable(cle, 'GET', `codes_atelier?code=eq.${encodeURIComponent(code)}&select=code,utilise_le`);
      if (!l?.length) return rep(res, 403, { erreur: 'code_inconnu' });
      if (l[0].utilise_le) return rep(res, 403, { erreur: 'code_deja_utilise' });
      try { return rep(res, 200, await ameliorer(texte, langue)); }
      catch (e) { return rep(res, String(e).includes('pas_ia') ? 503 : 502, { erreur: 'ia', detail: String(e).slice(0, 160) }); }
    }
    // ---------- créer
    if (p.action === 'creer') {
      const code = String(p.code ?? '').trim().toUpperCase();
      let texte = String(p.prompt ?? '').replace(/\s+/g, ' ').trim();
      const langue = ['fr', 'en', 'es'].includes(p.langue) ? p.langue : 'fr';
      // photo (dataURL jpeg/png, ≤ 3 Mo) : la description devient facultative
      let image = null;
      if (typeof p.image === 'string' && p.image.startsWith('data:image/')) {
        const m = p.image.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
        if (!m) return rep(res, 400, { erreur: 'image' });
        const oct = Buffer.from(m[2], 'base64'); if (oct.length < 1000 || oct.length > 3 * 1024 * 1024) return rep(res, 400, { erreur: 'image' });
        image = { type: m[1], octets: oct };
        if (!texte) texte = langue === 'en' ? 'My photo' : langue === 'es' ? 'Mi foto' : 'Ma photo';
      }
      const texteTripo = (typeof p.prompt_tripo === 'string' && p.prompt_tripo.trim().length >= 3 ? p.prompt_tripo : texte).replace(/\s+/g, ' ').trim().slice(0, 600);
      if (!/^[A-Z0-9-]{6,24}$/.test(code)) return rep(res, 400, { erreur: 'code_invalide' });
      if (!image && (texte.length < 3 || texte.length > 600)) return rep(res, 400, { erreur: 'texte_longueur' });
      if (texte.length > 600) return rep(res, 400, { erreur: 'texte_longueur' });
      const id = randomUUID();
      const joueur = typeof p.joueur === 'string' && /^[0-9a-f-]{36}$/i.test(p.joueur) ? p.joueur : null;
      const r = await sbRpc(cle, 'utiliser_code', { p_code: code, p_creation: id, p_prompt: texte, p_prompt_tripo: texteTripo, p_langue: langue, p_joueur: joueur, p_empreinte: empreinte });
      if (!r?.ok) return rep(res, 403, { erreur: r?.raison === 'deja_utilise' ? 'code_deja_utilise' : 'code_inconnu' });
      try {
        let t;
        if (image) {
          const urlSrc = await sbUpload(cle, `${id}-photo.${image.type === 'image/png' ? 'png' : 'jpg'}`, image.octets, image.type);   // la photo du joueur, gardée avec sa création
          const jeton = await tripoFichier(cleTripo, image.octets, image.type);
          t = await tripoDepuisImage(cleTripo, jeton, urlSrc);
        } else t = await tripo(cleTripo, 'creer', texteTripo);
        await sbTable(cle, 'PATCH', `creations?id=eq.${id}`, { task_id: t.task_id, erreur: `api v${t._v} ${t._base}`, maj: new Date().toISOString() });
        return rep(res, 200, { id, statut: 'en_cours', progres: 0 });
      } catch (e) {
        await sbRpc(cle, 'rendre_code', { p_creation: id, p_erreur: String(e).slice(0, 400) }).catch(() => undefined);
        return rep(res, 502, { erreur: 'tripo', detail: String(e).slice(0, 200) });
      }
    }
    // ---------- retrouver son objet avec son code (nouveau téléphone, navigateur vidé) : le code reste la clé du joueur
    if (p.action === 'retrouver') {
      const code = String(p.code ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9-]{6,24}$/.test(code)) return rep(res, 404, { erreur: 'code_inconnu' });
      const l = await sbTable(cle, 'GET', `codes_atelier?code=eq.${encodeURIComponent(code)}&select=code,creation`);
      if (!l?.length) return rep(res, 404, { erreur: 'code_inconnu' });
      if (!l[0].creation) return rep(res, 404, { erreur: 'code_pas_utilise' });
      p = { action: 'etat', id: l[0].creation };   // puis on continue comme une demande d'état
    }
    // ---------- état d'une création (et copie du modèle quand Tripo a fini)
    if (p.action === 'etat' || p.action === 'liste') {
      const ids = (p.action === 'etat' ? [p.id] : (Array.isArray(p.ids) ? p.ids : [])).filter(x => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20);
      if (!ids.length) return rep(res, 400, { erreur: 'id' });
      const lignes = await sbTable(cle, 'GET', `creations?id=in.(${ids.join(',')})&select=id,statut,progres,url_modele,url_image,prompt,erreur,task_id,cree_le`);
      const out = [];
      for (const c of lignes) {
        if (c.statut === 'en_cours' && c.task_id) {
          try {
            const d = await tripo(cleTripo, 'etat', c.task_id);
            if (d.status === 'success') {
              const urlM = d.output?.model_url || d.output?.pbr_model_url || d.output?.base_model_url || d.output?.pbr_model || d.output?.model || d.output?.base_model;
              if (!urlM) throw new Error('pas de modèle dans la réponse Tripo');
              const modele = await fetch(urlM); if (!modele.ok) throw new Error(`téléchargement du modèle ${modele.status}`);
              const brut = Buffer.from(await modele.arrayBuffer());
              if (brut.length > 180 * 1024 * 1024) throw new Error('modèle trop lourd');
              const { octets, info } = await compresserGlb(brut);
              if (octets.length > 50 * 1024 * 1024) throw new Error(`modèle trop lourd même compressé (${JSON.stringify(info)})`);
              const url = await sbUpload(cle, `${c.id}.glb`, octets, 'model/gltf-binary');
              let image = null;
              const o = d.output ?? {};
              const urlI = o.rendered_image_url || o.rendered_image || o.preview_url || o.preview || o.thumbnail_url || o.thumbnail || o.image_url || o.image;
              if (typeof urlI === 'string' && /^https?:/.test(urlI)) {
                try {
                  const im = await fetch(urlI);
                  if (im.ok) {
                    const oct = Buffer.from(await im.arrayBuffer());
                    // le type d'image d'après les premiers octets (l'en-tête de Tripo n'est pas toujours fiable)
                    const type = oct.slice(0, 4).toString('hex') === '89504e47' ? 'image/png' : oct.slice(0, 3).toString('hex') === 'ffd8ff' ? 'image/jpeg' : oct.slice(0, 4).toString() === 'RIFF' ? 'image/webp' : null;
                    if (type) image = await sbUpload(cle, `${c.id}.${type.slice(6)}`, oct, type);
                  }
                } catch { /* l'image est un bonus : la visionneuse du téléphone sait faire une capture */ }
              }
              await sbTable(cle, 'PATCH', `creations?id=eq.${c.id}`, { statut: 'pret', progres: 100, url_modele: url, url_image: image, maj: new Date().toISOString() });
              Object.assign(c, { statut: 'pret', progres: 100, url_modele: url, url_image: image });
            } else if (d.status === 'failed' || d.status === 'cancelled' || d.status === 'unknown' || d.status === 'banned' || d.status === 'expired') {
              await sbTable(cle, 'PATCH', `creations?id=eq.${c.id}`, { statut: 'echec', erreur: `Tripo : ${d.status}`, maj: new Date().toISOString() });
              Object.assign(c, { statut: 'echec', erreur: `Tripo : ${d.status}` });
            } else {
              const progres = Math.max(c.progres || 0, Math.min(99, Number(d.progress) || 0));
              if (progres !== c.progres) await sbTable(cle, 'PATCH', `creations?id=eq.${c.id}`, { progres, maj: new Date().toISOString() }).catch(() => undefined);
              c.progres = progres;
            }
          } catch (e) {
            c.detail = String(e).slice(0, 160);   // on réessaiera au prochain appel ; le code n'est pas rendu (la tâche existe chez Tripo)
          }
        }
        out.push({ id: c.id, statut: c.statut, progres: c.progres, url: c.url_modele, image: c.url_image, prompt: c.prompt, erreur: c.erreur, detail: c.detail, cree_le: c.cree_le });
      }
      return rep(res, 200, p.action === 'etat' ? (out[0] ?? { erreur: 'introuvable' }) : { creations: out });
    }
    return rep(res, 400, { erreur: 'action' });
  } catch (e) {
    return rep(res, 500, { erreur: 'serveur', detail: String(e).slice(0, 200) });
  }
}
