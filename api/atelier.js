// L'Atelier : le joueur décrit un objet de déco, Tripo le fabrique en 3D, on le copie dans Supabase Storage.
// Tout passe par ici : le navigateur ne connaît ni la clé Tripo ni la clé Supabase.
// Réglages Vercel : TRIPO_API_KEY (clé Tripo, tsk_…), SUPABASE_SECRET_KEY (clé secrète Supabase, sb_secret_…).
// Actions (POST JSON) :
//   { action: 'creer', code, prompt, langue }  → vérifie le code (usage unique), lance Tripo, renvoie { id }
//   { action: 'etat', id }                      → où en est la fabrication ; quand c'est prêt, { statut:'pret', url, image }
//   { action: 'liste', ids: [...] }             → l'état de plusieurs créations (pour « Mes objets »)
//   { action: 'retrouver', code }               → l'objet fabriqué avec ce code (pour le retrouver sur un autre téléphone)
import { createHash, randomUUID } from 'node:crypto';

export const config = { maxDuration: 60 };   // copier un modèle de 10 à 30 Mo peut dépasser 10 s

const SB = 'https://jbwlhapwszsuwirspybg.supabase.co';
const TRIPO = 'https://api.tripo3d.ai/v2/openapi';
const MODELE_TRIPO = 'v2.5-20250123';
const INTERDITS = /\b(nu|nue|nus|nude|naked|sex|sexe|sexy|porn|porno|arme|weapon|gun|pistol|rifle|knife|couteau|sang|blood|gore|cadavre|corpse|drogue|drug|cocaine|hitler|nazi|swastika|terror|bomb|bombe|suicide|personne|person|homme|femme|man|woman|girl|boy|fille|garçon|garcon|enfant|child|kid|bébé|baby|visage|face|portrait)\b/i;

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
async function tripo(cleTripo, methode, chemin, corps) {
  const r = await fetch(`${TRIPO}${chemin}`, { method: methode, headers: { Authorization: `Bearer ${cleTripo}`, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.code !== 0) throw new Error(`tripo ${r.status} ${j.code ?? ''} ${(j.message || j.suggestion || '').slice(0, 200)}`);
  return j.data;
}

/** Le texte envoyé à Tripo : la description du joueur, encadrée pour obtenir un bel objet de jardin, seul et posé. */
function promptTripo(texte, langue) {
  const cadre = 'A single cute decorative garden object for a balcony game, stylized low-poly toy look, clean simple shapes, bright friendly colors, standing on a flat base, centered, no text, no people';
  return `${cadre}. The object: ${texte}${langue && langue !== 'en' ? ` (description written in ${langue === 'fr' ? 'French' : 'Spanish'})` : ''}.`;
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
    // ---------- créer
    if (p.action === 'creer') {
      const code = String(p.code ?? '').trim().toUpperCase();
      const texte = String(p.prompt ?? '').replace(/\s+/g, ' ').trim();
      const langue = ['fr', 'en', 'es'].includes(p.langue) ? p.langue : 'fr';
      if (!/^[A-Z0-9-]{6,24}$/.test(code)) return rep(res, 400, { erreur: 'code_invalide' });
      if (texte.length < 3 || texte.length > 120) return rep(res, 400, { erreur: 'texte_longueur' });
      if (INTERDITS.test(texte)) return rep(res, 400, { erreur: 'texte_interdit' });
      const id = randomUUID();
      const joueur = typeof p.joueur === 'string' && /^[0-9a-f-]{36}$/i.test(p.joueur) ? p.joueur : null;
      const r = await sbRpc(cle, 'utiliser_code', { p_code: code, p_creation: id, p_prompt: texte, p_prompt_tripo: promptTripo(texte, langue), p_langue: langue, p_joueur: joueur, p_empreinte: empreinte });
      if (!r?.ok) return rep(res, 403, { erreur: r?.raison === 'deja_utilise' ? 'code_deja_utilise' : 'code_inconnu' });
      try {
        const t = await tripo(cleTripo, 'POST', '/task', { type: 'text_to_model', prompt: promptTripo(texte, langue), model_version: MODELE_TRIPO, face_limit: 30000, texture: true, pbr: false, texture_quality: 'standard' });
        await sbTable(cle, 'PATCH', `creations?id=eq.${id}`, { task_id: t.task_id, maj: new Date().toISOString() });
        return rep(res, 200, { id, statut: 'en_cours', progres: 0 });
      } catch (e) {
        await sbRpc(cle, 'rendre_code', { p_creation: id, p_erreur: String(e).slice(0, 300) }).catch(() => undefined);
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
            const d = await tripo(cleTripo, 'GET', `/task/${c.task_id}`);
            if (d.status === 'success') {
              const urlM = d.output?.pbr_model || d.output?.model || d.output?.base_model;
              if (!urlM) throw new Error('pas de modèle dans la réponse Tripo');
              const modele = await fetch(urlM); if (!modele.ok) throw new Error(`téléchargement du modèle ${modele.status}`);
              const octets = Buffer.from(await modele.arrayBuffer());
              if (octets.length > 50 * 1024 * 1024) throw new Error('modèle trop lourd');
              const url = await sbUpload(cle, `${c.id}.glb`, octets, 'model/gltf-binary');
              let image = null;
              if (d.output?.rendered_image) {
                try { const im = await fetch(d.output.rendered_image); if (im.ok) image = await sbUpload(cle, `${c.id}.webp`, Buffer.from(await im.arrayBuffer()), im.headers.get('content-type') || 'image/webp'); } catch { /* l'image est un bonus */ }
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
