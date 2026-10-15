// Voix du diaporama (/tableau/demo.html) : fabrique UNE FOIS chaque phrase avec Gemini TTS, la range dans
// Supabase Storage (bucket public « voix »), et renvoie son adresse. Protégé par TABLEAU_CODE : personne d'autre
// ne peut dépenser le quota Gemini. Réglages Vercel (jamais dans un fichier ni dans le navigateur) :
//   TABLEAU_CODE, SUPABASE_SECRET_KEY, GEMINI_API_KEY
//   facultatifs : GEMINI_TTS_MODELS (défaut gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts), GEMINI_TTS_VOIX (défaut Kore)
import { createHash, timingSafeEqual } from 'node:crypto';

const SB = 'https://jbwlhapwszsuwirspybg.supabase.co';
const BUCKET = 'voix';
const empreinte = s => createHash('sha256').update(String(s)).digest();
const pause = ms => new Promise(r => setTimeout(r, ms));
export const cheminVoix = (lang, i, texte) => `${lang}/${String(i).padStart(2, '0')}-${createHash('sha1').update(texte).digest('hex').slice(0, 10)}.wav`;

/** Enveloppe WAV autour de PCM 16 bits mono (si Gemini renvoie du l16 brut). */
function wav(pcm, hz) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(hz, 24); h.writeUInt32LE(hz * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Cherche, n'importe où dans la réponse JSON, un morceau audio en base64. */
function trouverAudio(o, prof = 0) {
  if (!o || typeof o !== 'object' || prof > 8) return null;
  if (typeof o.data === 'string' && o.data.length > 1000 && (!o.type || /audio/i.test(String(o.type)) || /audio/i.test(String(o.mime_type || o.mimeType || '')))) return { b64: o.data, mime: String(o.mime_type || o.mimeType || o.type || 'audio/wav') };
  if (o.inlineData && typeof o.inlineData.data === 'string') return { b64: o.inlineData.data, mime: String(o.inlineData.mimeType || 'audio/wav') };
  for (const k of Object.keys(o)) { const r = trouverAudio(o[k], prof + 1); if (r) return r; }
  return null;
}

async function gemini(cle, texte, lang) {
  const modeles = String(process.env.GEMINI_TTS_MODELS || 'gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts').split(',').map(x => x.trim()).filter(Boolean);
  const voix = process.env.GEMINI_TTS_VOIX || 'Kore';
  const style = { fr: 'Narration chaleureuse, naturelle, posée, en français.', en: 'Warm, natural, calm narration in English.', es: 'Narración cálida, natural y tranquila en español.' }[lang];
  const erreurs = [];
  for (const modele of modeles) {
    for (let essai = 0; essai < 2; essai++) {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST', headers: { 'x-goog-api-key': cle, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modele, input: [{ type: 'user_input', content: [{ type: 'text', text: texte, annotations: [{ type: 'speech_metadata', style }] }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice: voix }] } })
      });
      const t = await r.text();
      if (r.ok) {
        let j = null; try { j = JSON.parse(t); } catch { j = null; }
        const a = trouverAudio(j);
        if (a) {
          const octets = Buffer.from(a.b64, 'base64');
          return octets.slice(0, 4).toString() === 'RIFF' ? octets : wav(octets, 24000);
        }
        erreurs.push(`${modele}: pas d'audio dans la réponse`); break;
      }
      erreurs.push(`${modele}: ${r.status} ${t.slice(0, 160)}`);
      if (r.status === 429 || r.status === 503) { await pause(1500); continue; }
      break;
    }
  }
  throw new Error(erreurs.join(' | '));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'POST') { res.status(405).json({ erreur: 'methode' }); return; }
  const code = process.env.TABLEAU_CODE, cle = process.env.SUPABASE_SECRET_KEY, cleGemini = process.env.GEMINI_API_KEY;
  if (!code || code.length < 12 || !cle) { res.status(503).json({ erreur: 'pas_configure' }); return; }
  let b = null; try { b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { b = null; }
  if (!timingSafeEqual(empreinte(String(b?.code ?? '')), empreinte(code))) { await pause(800); res.status(401).json({ erreur: 'code' }); return; }
  const lang = ['fr', 'en', 'es'].includes(b?.lang) ? b.lang : null, i = Number.isInteger(b?.i) && b.i >= 0 && b.i < 200 ? b.i : null, texte = String(b?.texte ?? '').trim();
  if (!lang || i === null || !texte || texte.length > 1500) { res.status(400).json({ erreur: 'parametres' }); return; }
  const chemin = cheminVoix(lang, i, texte), url = `${SB}/storage/v1/object/public/${BUCKET}/${chemin}`;
  try {
    // déjà fabriquée ? (même texte → même nom de fichier)
    const h = await fetch(url, { method: 'HEAD' });
    if (h.ok) { res.status(200).json({ url, genere: false }); return; }
    if (!cleGemini) { res.status(503).json({ erreur: 'pas_gemini' }); return; }
    const octets = await gemini(cleGemini, texte, lang);
    // bucket public « voix » (créé au premier passage)
    await fetch(`${SB}/storage/v1/bucket`, { method: 'POST', headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }) }).catch(() => null);
    const up = await fetch(`${SB}/storage/v1/object/${BUCKET}/${chemin}`, { method: 'POST', headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'audio/wav', 'x-upsert': 'true' }, body: octets });
    if (!up.ok) { res.status(502).json({ erreur: 'stockage', detail: `${up.status} ${(await up.text()).slice(0, 200)}` }); return; }
    res.status(200).json({ url, genere: true, octets: octets.length });
  } catch (e) {
    res.status(502).json({ erreur: 'gemini', detail: String(e?.message ?? e).slice(0, 400) });
  }
}
