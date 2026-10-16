// Tableau de bord (page /tableau/) : renvoie les chiffres du jeu, SEULEMENT à qui donne le bon code.
// Deux réglages Vercel (Settings > Environment Variables), jamais dans un fichier ni dans le navigateur :
//   TABLEAU_CODE        : ton code d'accès (12 caractères ou plus)
//   SUPABASE_SECRET_KEY : la clé secrète Supabase (sb_secret_…) ; elle ne quitte jamais le serveur
import { createHash, timingSafeEqual } from 'node:crypto';

const empreinte = s => createHash('sha256').update(String(s)).digest();
const pause = ms => new Promise(r => setTimeout(r, ms));

/** Solde Tripo (TRIPO_API_KEY, déjà dans Vercel) : jamais bloquant, 4 s au plus, plusieurs adresses comme pour l'Atelier. */
async function soldeTripo() {
  const cle = process.env.TRIPO_API_KEY; if (!cle) return null;
  const urls = ['https://openapi.tripo3d.ai/v3/account/balance', 'https://openapi.tripo3d.com/v3/account/balance', 'https://api.tripo3d.ai/v2/openapi/user/balance'];
  for (const u of urls) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(u, { headers: { Authorization: `Bearer ${cle}` }, signal: ctl.signal }); clearTimeout(t);
      if (!r.ok) continue;
      const j = await r.json().catch(() => null), d = j && (j.data ?? j);
      const solde = Number(d?.balance);
      if (Number.isFinite(solde)) return { solde, gele: Number(d?.frozen) || 0 };
    } catch { /* adresse suivante */ }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'POST') { res.status(405).json({ erreur: 'methode' }); return; }
  const code = process.env.TABLEAU_CODE, cle = process.env.SUPABASE_SECRET_KEY;
  if (!code || code.length < 12 || !cle) { res.status(503).json({ erreur: 'pas_configure' }); return; }
  let recu = '', periode = '24h', b = null;
  try { b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; recu = String(b?.code ?? ''); if (['24h', '7j', '30j'].includes(b?.periode)) periode = b.periode; } catch { recu = ''; }
  if (!timingSafeEqual(empreinte(recu), empreinte(code))) { await pause(800); res.status(401).json({ erreur: 'code' }); return; }
  try {
    const SB = 'https://jbwlhapwszsuwirspybg.supabase.co/rest/v1';
    // marquer un code de l'Atelier comme donné (QR montré, carte remise) ou le remettre libre
    if (b && b.action === 'donner') {
      const ca = String(b.code_atelier ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9-]{6,24}$/.test(ca)) { res.status(400).json({ erreur: 'code_atelier' }); return; }
      const r = await fetch(`${SB}/codes_atelier?code=eq.${encodeURIComponent(ca)}`, { method: 'PATCH', headers: { apikey: cle, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ donne_le: b.donne ? new Date().toISOString() : null }) });
      const t = await r.text();
      if (!r.ok) { res.status(502).json({ erreur: 'supabase', detail: `${r.status} ${t.slice(0, 300)}` }); return; }
      res.status(200).json({ ok: true, codes: JSON.parse(t) }); return;
    }
    const [r, rc, tripo] = await Promise.all([
      fetch(`${SB}/rpc/tableau_de_bord`, { method: 'POST', headers: { apikey: cle, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_periode: periode }) }),
      // les codes de l'Atelier et, pour chaque code utilisé, la création qui va avec (si les tables n'existent pas encore, on s'en passe)
      fetch(`${SB}/codes_atelier?select=code,cree_le,note,utilise_le,donne_le,creations(statut,progres,prompt,url_image,url_modele,erreur,cree_le)&order=cree_le.asc`, { headers: { apikey: cle } }).catch(() => null),
      soldeTripo().catch(() => null),
    ]);
    const texte = await r.text();
    if (!r.ok) { res.status(502).json({ erreur: 'supabase', detail: `${r.status} ${texte.slice(0, 300)}` }); return; }
    let codes = null;
    try { if (rc && rc.ok) codes = await rc.json(); } catch { codes = null; }
    let corps = texte;
    try { const j = JSON.parse(texte); if (j && typeof j === 'object') { if (Array.isArray(codes)) j.codes = codes; j.tripo = tripo; corps = JSON.stringify(j); } } catch { /* on renvoie tel quel */ }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(corps);
  } catch (e) {
    res.status(500).json({ erreur: 'appel', detail: String(e).slice(0, 200) });
  }
}
