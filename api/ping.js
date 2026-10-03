// Appel quotidien (Vercel Cron) : réveille la base Supabase pour qu'elle ne se mette jamais en pause
// (un projet gratuit s'endort après 7 jours sans activité).
// Vercel envoie « Authorization: Bearer <CRON_SECRET> » : tout autre appel est refusé.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).send('non autorisé');
    return;
  }
  try {
    const r = await fetch('https://jbwlhapwszsuwirspybg.supabase.co/rest/v1/rpc/ping', {
      method: 'POST',
      headers: { apikey: 'sb_publishable_Q8e86m330gqO-yRG3zawGA_JVEz2WvB', 'Content-Type': 'application/json' },
      body: '{}',
    });
    const texte = await r.text();
    res.status(r.ok ? 200 : 502).send(r.ok ? `base réveillée : ${texte}` : `erreur Supabase ${r.status} : ${texte}`);
  } catch (e) {
    res.status(500).send(`appel impossible : ${e}`);
  }
}
