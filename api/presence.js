// Présence : le jeu envoie un petit signal toutes les 30 s pendant qu'on joue (src/suivi.ts).
// Ce serveur y ajoute la ville et le pays (fournis par Vercel) et une EMPREINTE du visiteur : un hachage de son adresse
// et de son navigateur, salé avec la clé secrète. L'adresse brute n'est jamais enregistrée ni renvoyée.
// Réglage Vercel : SUPABASE_SECRET_KEY (la clé secrète Supabase, jamais dans le navigateur).
import { createHash } from 'node:crypto';

const recents = new Map();   // garde-fou par adresse : 10 signaux par minute au plus (par instance serveur)

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const cle = process.env.SUPABASE_SECRET_KEY;
  if (!cle) { res.status(204).end(); return; }                          // pas réglé : on ignore sans gêner le jeu
  let p;
  try { p = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch { res.status(400).end(); return; }
  const session = String(p.session ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(session)) { res.status(400).end(); return; }

  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || String(req.socket?.remoteAddress ?? '');
  const ua = String(req.headers['user-agent'] ?? '').slice(0, 200);
  const maintenant = Date.now();
  const r = recents.get(ip) ?? { t: maintenant, n: 0 };
  if (maintenant - r.t > 60000) { r.t = maintenant; r.n = 0; }
  r.n++; recents.set(ip, r);
  if (recents.size > 5000) recents.clear();
  if (r.n > 10) { res.status(429).end(); return; }

  const empreinte = createHash('sha256').update(`${ip}|${ua}|${cle.slice(-24)}`).digest('hex').slice(0, 24);
  const dec = v => { try { return decodeURIComponent(String(v)); } catch { return String(v); } };
  const corps = {
    session, empreinte,
    delta: Math.max(0, Math.min(120, Number(p.delta) || 0)),
    perso: typeof p.perso === 'string' ? p.perso.slice(0, 12) : null,
    langue: typeof p.langue === 'string' ? p.langue.slice(0, 5) : null,
    appareil: typeof p.appareil === 'string' ? p.appareil.slice(0, 80) : null,
    page: typeof p.page === 'string' ? p.page.slice(0, 80) : null,
    boot: Number.isFinite(p.boot) ? Math.round(p.boot) : null,
    fps: Number.isFinite(p.fps) ? Math.round(p.fps) : null,
    joueur: typeof p.joueur === 'string' && /^[0-9a-f-]{36}$/i.test(p.joueur) ? p.joueur : null,
    pays: req.headers['x-vercel-ip-country'] ? dec(req.headers['x-vercel-ip-country']) : null,
    ville: req.headers['x-vercel-ip-city'] ? dec(req.headers['x-vercel-ip-city']) : null,
    region: req.headers['x-vercel-ip-country-region'] ? dec(req.headers['x-vercel-ip-country-region']) : null,
  };
  try {
    const sb = await fetch('https://jbwlhapwszsuwirspybg.supabase.co/rest/v1/rpc/enregistrer_battement', {
      method: 'POST', headers: { apikey: cle, 'Content-Type': 'application/json' }, body: JSON.stringify({ p: corps }),
    });
    res.status(sb.ok ? 204 : 502).end();
  } catch {
    res.status(500).end();
  }
}
