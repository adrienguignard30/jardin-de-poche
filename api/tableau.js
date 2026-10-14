// Tableau de bord (page /tableau/) : renvoie les chiffres du jeu, SEULEMENT à qui donne le bon code.
// Deux réglages Vercel (Settings > Environment Variables), jamais dans un fichier ni dans le navigateur :
//   TABLEAU_CODE        : ton code d'accès (12 caractères ou plus)
//   SUPABASE_SECRET_KEY : la clé secrète Supabase (sb_secret_…) ; elle ne quitte jamais le serveur
import { createHash, timingSafeEqual } from 'node:crypto';

const empreinte = s => createHash('sha256').update(String(s)).digest();
const pause = ms => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'POST') { res.status(405).json({ erreur: 'methode' }); return; }
  const code = process.env.TABLEAU_CODE, cle = process.env.SUPABASE_SECRET_KEY;
  if (!code || code.length < 12 || !cle) { res.status(503).json({ erreur: 'pas_configure' }); return; }
  let recu = '', periode = '24h';
  try { const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; recu = String(b?.code ?? ''); if (['24h', '7j', '30j'].includes(b?.periode)) periode = b.periode; } catch { recu = ''; }
  if (!timingSafeEqual(empreinte(recu), empreinte(code))) { await pause(800); res.status(401).json({ erreur: 'code' }); return; }
  try {
    const SB = 'https://jbwlhapwszsuwirspybg.supabase.co/rest/v1';
    const [r, rc] = await Promise.all([
      fetch(`${SB}/rpc/tableau_de_bord`, { method: 'POST', headers: { apikey: cle, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_periode: periode }) }),
      // les codes de l'Atelier et, pour chaque code utilisé, la création qui va avec (si les tables n'existent pas encore, on s'en passe)
      fetch(`${SB}/codes_atelier?select=code,cree_le,note,utilise_le,creations(statut,progres,prompt,url_image,url_modele,erreur,cree_le)&order=cree_le.asc`, { headers: { apikey: cle } }).catch(() => null),
    ]);
    const texte = await r.text();
    if (!r.ok) { res.status(502).json({ erreur: 'supabase', detail: `${r.status} ${texte.slice(0, 300)}` }); return; }
    let codes = null;
    try { if (rc && rc.ok) codes = await rc.json(); } catch { codes = null; }
    let corps = texte;
    try { const j = JSON.parse(texte); if (j && typeof j === 'object' && Array.isArray(codes)) { j.codes = codes; corps = JSON.stringify(j); } } catch { /* on renvoie tel quel */ }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(corps);
  } catch (e) {
    res.status(500).json({ erreur: 'appel', detail: String(e).slice(0, 200) });
  }
}
