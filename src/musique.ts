// =============================================================================================
//  La musique d'ambiance : un morceau par personnage (public/music/music-<id>.mp3), en boucle sans couture.
//  La boucle : chaque passage commence 2 s avant la fin du précédent, en fondu enchaîné (la couture ne s'entend pas).
//  Le volume et la coupure sont gardés sur l'appareil. Les navigateurs n'autorisent le son qu'après un premier geste :
//  la musique démarre au premier toucher / clic / touche.
// =============================================================================================
const DIAG_SON = typeof location !== 'undefined' && new URLSearchParams(location.search).has('son');
const JOURNAL_SON: string[] = [];
function noterSon(t: string) { if (!DIAG_SON) return; JOURNAL_SON.push(new Date().toTimeString().slice(0, 8) + ' ' + t); if (JOURNAL_SON.length > 14) JOURNAL_SON.shift(); }
const CLE = 'jdp.son';
const FONDU = 3.0;                                  // secondes de fondu enchaîné à la boucle
const CHANGEMENT = 1.6;                             // secondes de fondu quand on change de morceau

export interface ReglagesSon { volume: number; coupe: boolean; playlist?: string }
export function reglagesSon(): ReglagesSon {
  try { return { volume: .22, coupe: false, ...JSON.parse(localStorage.getItem(CLE) || '{}') }; } catch { return { volume: .22, coupe: false }; }
}

interface Morceau { buf: AudioBuffer; debut: number; fin: number }
/** La partie « pleine » d'un morceau : on saute le silence du début, et on coupe avant le silence ou le long fondu de la fin
 *  (c'est ce qui faisait un « gros blanc » à la boucle). Mesure de l'énergie par tranches de 100 ms. */
function utile(buf: AudioBuffer): Morceau {
  const d = buf.getChannelData(0), n = Math.floor(buf.sampleRate * .1), tr = Math.floor(d.length / n);
  const rms: number[] = [];
  for (let i = 0; i < tr; i++) { let t = 0; for (let k = i * n; k < (i + 1) * n; k += 4) t += d[k] * d[k]; rms.push(Math.sqrt(t / (n / 4))); }
  const milieu = rms.slice(Math.floor(tr * .2), Math.floor(tr * .8)).sort((a, b) => a - b);
  const ref = milieu[Math.floor(milieu.length / 2)] || .01;                  // l'énergie typique du morceau
  let a = 0; while (a < tr - 1 && rms[a] < ref * .25) a++;
  let b = tr - 1; while (b > a && rms[b] < ref * .45) b--;
  const debut = a * .1, fin = Math.max(debut + 10, (b + 1) * .1);
  return { buf, debut, fin: Math.min(buf.duration, fin) };
}

class Musique {
  private ac: AudioContext | null = null;
  private maitre: GainNode | null = null;
  private voulu = '';                               // le morceau demandé
  private enCours: { id: string; gain: GainNode; sources: AudioBufferSourceNode[]; timer: number } | null = null;
  private pret = false;
  private muet: HTMLAudioElement | null = null;
  private auditeurs: (() => void)[] = [];
  R = reglagesSon();

  constructor() {
    // Le son démarre au premier geste, et il est relancé à CHAQUE geste s'il a été suspendu. Sur iPhone, seuls « touchend »
    // et « click » comptent comme de vrais gestes pour le son (pas toujours « pointerdown »), d'où la liste complète.
    const gestes = ['pointerdown', 'touchend', 'click', 'keydown'];
    const debloquer = (e: Event) => {
      this.demarrerContexte();
      if (this.ac && this.ac.state !== 'running' && !this.enPause) this.ac.resume().then(() => noterSon('relance OK sur ' + e.type)).catch(() => noterSon('relance refusee sur ' + e.type));
      if (this.muet && this.muet.paused) this.muet.play().catch(() => { /* au prochain geste */ });
    };
    for (const g of gestes) window.addEventListener(g, debloquer, { capture: true, passive: true });
  }
  private demarrerContexte() {
    if (this.pret) return;
    // Sur iPhone, l'audio d'une page web suit l'interrupteur « silencieux » comme une sonnerie. On déclare que c'est de la
    // musique (« playback ») et on joue un son <audio> muet en boucle : la page passe alors en audio « média », comme une
    // vidéo, et la musique se fait entendre même en mode silencieux, au volume « média » du téléphone.
    try { (navigator as any).audioSession && ((navigator as any).audioSession.type = 'playback'); } catch { /* ancien navigateur */ }
    try {
      // Ce <audio> ne sert qu'à iOS (mode silencieux de l'iPhone). Avant, il contenait 0 octet de son et tournait en boucle
      // à l'infini sur TOUS les appareils : sur Windows, Chrome et Edge rebouclaient des milliers de fois par seconde,
      // le moteur audio de Windows saturait et tout le PC se figeait (bug introduit le 1er octobre au soir).
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (ios) {
        const muet = document.createElement('audio');
        muet.src = silenceDataUrl(1);                                    // 1 seconde de vrai silence, en data URL (une blob URL échoue en silence dans Safari)
        muet.setAttribute('x-webkit-airplay', 'deny');
        muet.loop = true; muet.setAttribute('playsinline', ''); (muet as any).playsInline = true; muet.volume = .01;
        muet.play().then(() => noterSon('audio muet iOS : lance')).catch(e => noterSon('audio muet iOS refuse : ' + (e && e.name)));
        this.muet = muet;
      }
    } catch { /* ignore */ }
    try {
      this.ac = new AudioContext();
      this.maitre = this.ac.createGain(); this.maitre.connect(this.ac.destination);
      this.maitre.gain.value = this.R.coupe ? 0 : this.R.volume;
      this.pret = true;
      noterSon('contexte audio cree : ' + this.ac.state); const ac0 = this.ac; ac0.onstatechange = () => noterSon('contexte -> ' + ac0.state);
      if (this.voulu) this.jouer(this.voulu);
    } catch { /* pas de son possible sur cet appareil */ }
  }
  // Un morceau de 2 minutes décodé pèse ~40 Mo en mémoire. Avant, on décodait TOUS les morceaux de chaque playlist
  // visitée (jusqu'à 9, soit ~380 Mo) : de quoi faire caler un navigateur. Maintenant on ne décode que le morceau qui joue
  // et le suivant ; les autres ne sont que des adresses, décodées au moment voulu, puis libérées.
  private listes = new Map<string, Promise<string[]>>();       // perso → adresses des morceaux (rien de décodé)
  private decodes = new Map<string, Promise<Morceau | null>>(); // adresse → morceau décodé (2 au plus)
  private async adresses(id: string): Promise<string[]> {
    if (!this.listes.has(id)) this.listes.set(id, (async () => {
      const out: string[] = [];
      const existe = async (u: string) => { try { const r = await fetch(u, { method: 'HEAD' }); noterSon('HEAD ' + u.split('/').pop() + ' -> ' + r.status + ' ' + (r.headers.get('content-type') || '?')); return r.ok && (r.headers.get('content-type') || '').includes('audio'); } catch (e) { noterSon('HEAD echoue ' + u.split('/').pop() + ' ' + (e as Error).name); return false; } };
      for (const u of [`music/music-${id}.mp3`, `music/music_${id}.mp3`, `music/musique_${id}.mp3`, `music/${id}.mp3`]) if (await existe(u)) { out.push(u); break; }
      for (let k = 2; k <= 4; k++) { const u = [`music/music-${id}-${k}.mp3`, `music/music-${id}${k}.mp3`, `music/music_${id}_${k}.mp3`]; let ok = false; for (const x of u) if (await existe(x)) { out.push(x); ok = true; break; } if (!ok) break; }
      if (!out.length) console.warn(`[musique] aucun fichier pour ${id}`);
      return out;
    })());
    return this.listes.get(id)!;
  }
  private decoder(url: string): Promise<Morceau | null> {
    if (!this.decodes.has(url)) {
      this.decodes.set(url, (async () => { try { const r = await fetch(url); const b = await r.arrayBuffer(); noterSon('telecharge ' + url.split('/').pop() + ' ' + r.status + ' ' + Math.round(b.byteLength / 1024) + ' Ko'); const d = await this.ac!.decodeAudioData(b); noterSon('decode OK ' + url.split('/').pop()); return utile(d); } catch (e) { noterSon('ECHEC decodage ' + url.split('/').pop() + ' : ' + (e as Error).name + ' ' + (e as Error).message); return null; } })());
      while (this.decodes.size > 2) this.decodes.delete(this.decodes.keys().next().value!);   // on libère le plus ancien
    }
    return this.decodes.get(url)!;
  }
  /** Compat : nombre de morceaux d'un personnage. */
  private async charger(id: string): Promise<string[]> { return this.adresses(id); }
  /** Ce qui joue : quelle playlist, quel morceau sur combien. */
  enCours_: { id: string; index: number; total: number } | null = null;
  private perso = '';
  /** Le personnage du joueur : sa playlist, sauf si une autre a été choisie dans l'appli Musique. */
  jouerPerso(id: string) { this.perso = id; this.jouer(this.R.playlist || id); }
  /** Choisir une playlist dans l'appli Musique ('' = celle de mon personnage). */
  choisir(id: string) { this.R.playlist = id; this.appliquer(); this.jouer(id || this.perso, 0, true); }
  suivant() { if (this.enCours_) this.jouer(this.enCours_.id, (this.enCours_.index + 1) % this.enCours_.total, true); }
  precedent() { if (this.enCours_) this.jouer(this.enCours_.id, (this.enCours_.index - 1 + this.enCours_.total) % this.enCours_.total, true); }
  enPause = false;
  private pauseParJeu = false;
  /** Le jeu du mois a sa propre musique : on met la nôtre en pause pendant qu'il est ouvert, et on la reprend après. */
  pauseJeu(oui: boolean) {
    if (oui && !this.enPause) { this.pauseParJeu = true; this.pause(true); }
    else if (!oui && this.pauseParJeu) { this.pauseParJeu = false; this.pause(false); }
  }
  pause(p: boolean) { this.enPause = p; if (this.ac) { if (p) this.ac.suspend(); else this.ac.resume(); } for (const f of this.auditeurs) f(); }
  /** Combien de morceaux dans une playlist (0 tant qu'elle n'est pas chargée). */
  async nbMorceaux(id: string) { return this.pret ? (await this.adresses(id)).length : 0; }

  /** Jouer une playlist, à partir d'un morceau ; les morceaux s'enchaînent dans l'ordre, en fondu, puis on recommence.
   *  Chaque morceau n'est décodé qu'au moment d'être programmé (≈ 8 s avant), et seuls 2 restent en mémoire. */
  async jouer(id: string, depart = 0, force = false) {
    this.voulu = id; noterSon('jouer ' + id + ' (pret ' + this.pret + ')');
    if (!this.pret || !this.ac) return;
    if (this.enCours?.id === id && !force) return;
    const urls = await this.adresses(id);
    if (!urls.length || this.voulu !== id) return;
    const premierM = await this.decoder(urls[depart % urls.length]);
    if (!premierM || this.voulu !== id) return;
    this.arreter(force ? 1 : CHANGEMENT);
    const ac = this.ac, gain = ac.createGain(); gain.connect(this.maitre!);
    const entree = force ? 1 : CHANGEMENT;
    gain.gain.setValueAtTime(0, ac.currentTime); gain.gain.linearRampToValueAtTime(1, ac.currentTime + entree);
    const piste = { id, gain, sources: [] as AudioBufferSourceNode[], timer: 0 };
    let debut = ac.currentTime + .05, premier = true, k = depart % urls.length, occupe = false;
    const planifier = async () => {
      if (occupe) return; occupe = true;
      const indexIci = k;
      const m = indexIci === depart % urls.length && premier ? premierM : await this.decoder(urls[indexIci]);
      occupe = false;
      if (!m || this.enCours !== piste) return;
      const duree = m.fin - m.debut, f = Math.min(FONDU, duree / 4);
      const s = ac.createBufferSource(); s.buffer = m.buf;
      const g = ac.createGain(); s.connect(g); g.connect(gain);
      if (premier) g.gain.setValueAtTime(1, debut); else { g.gain.setValueAtTime(0, debut); g.gain.linearRampToValueAtTime(1, debut + f); }
      g.gain.setValueAtTime(1, debut + duree - f); g.gain.linearRampToValueAtTime(0, debut + duree);
      s.start(debut, m.debut, duree + .05);
      s.onended = () => { try { s.disconnect(); g.disconnect(); } catch { /* déjà */ } };
      const quand = Math.max(0, (debut - ac.currentTime) * 1000);
      window.setTimeout(() => { if (this.enCours === piste) { this.enCours_ = { id, index: indexIci, total: urls.length }; for (const fn of this.auditeurs) fn(); } }, quand);
      piste.sources.push(s); if (piste.sources.length > 3) piste.sources.shift();
      premier = false;
      debut += duree - f;
      k = (k + 1) % urls.length;
    };
    this.enCours = piste;
    await planifier();
    piste.timer = window.setInterval(() => { if (debut - ac.currentTime < 8) planifier(); }, 1000);
    if (this.enPause) this.pause(false);
  }
  arreter(fondu = 1) {
    const p = this.enCours; if (!p || !this.ac) return;
    this.enCours = null;
    clearInterval(p.timer);
    const t = this.ac.currentTime;
    p.gain.gain.cancelScheduledValues(t); p.gain.gain.setValueAtTime(p.gain.gain.value, t); p.gain.gain.linearRampToValueAtTime(0, t + fondu);
    setTimeout(() => { for (const s of p.sources) { try { s.stop(); } catch { /* déjà arrêtée */ } } p.gain.disconnect(); }, fondu * 1000 + 100);
  }
  private appliquer() {
    try { localStorage.setItem(CLE, JSON.stringify(this.R)); } catch { /* ignore */ }
    if (this.maitre && this.ac) { const t = this.ac.currentTime; this.maitre.gain.cancelScheduledValues(t); this.maitre.gain.setTargetAtTime(this.R.coupe ? 0 : this.R.volume, t, .08); }
    for (const f of this.auditeurs) f();
  }
  volume(v: number) { this.R.volume = Math.max(0, Math.min(1, v)); if (this.R.volume > 0) this.R.coupe = false; this.appliquer(); }
  basculer() { this.R.coupe = !this.R.coupe; if (!this.R.coupe && this.R.volume < .03) this.R.volume = .22; this.appliquer(); }
  couper(c: boolean) { this.R.coupe = c; this.appliquer(); }
  /** Prévenir l'interface quand le volume ou la coupure changent (bouton du jeu, réglages du téléphone). */
  surChangement(f: () => void) { this.auditeurs.push(f); }
}
export const MUSIQUE = new Musique();

// ---------- DIAGNOSTIC DU SON (seulement avec ?son=1 dans l'adresse) : un petit panneau qui raconte ce que fait le son
if (DIAG_SON) {
  for (const g of ['pointerdown', 'touchend', 'click']) window.addEventListener(g, e => noterSon('geste ' + e.type), true);
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:9999;max-width:94vw;background:rgba(0,0,0,.82);color:#9f9;font:11px/1.35 monospace;padding:6px 8px;border-radius:8px;pointer-events:none;white-space:pre-wrap';
  const maj = () => {
    const m = MUSIQUE as unknown as { ac: AudioContext | null; pret: boolean; voulu: string; enCours_: unknown; R: { volume: number; coupe: boolean }; enPause: boolean };
    p.textContent = `SON  contexte: ${m.ac ? m.ac.state : 'pas cree'} | pret: ${m.pret} | voulu: ${m.voulu || '-'} | joue: ${m.enCours_ ? JSON.stringify(m.enCours_) : 'rien'}\nvolume: ${m.R.volume} coupe: ${m.R.coupe} pause: ${m.enPause}\n${navigator.userAgent.slice(0, 90)}\n` + JOURNAL_SON.join('\n');
    if (!p.parentNode && document.body) document.body.appendChild(p);
  };
  setInterval(maj, 700);
}

/** Un fichier WAV de silence de `secondes` secondes (8 kHz, 8 bits, mono), fabriqué en mémoire. */
function silenceDataUrl(secondes: number): string {
  const n = Math.round(8000 * secondes), b = new ArrayBuffer(44 + n), v = new DataView(b);
  const txt = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  txt(0, 'RIFF'); v.setUint32(4, 36 + n, true); txt(8, 'WAVE'); txt(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  txt(36, 'data'); v.setUint32(40, n, true);
  new Uint8Array(b, 44).fill(128);
  let s = ''; const u = new Uint8Array(b); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return 'data:audio/wav;base64,' + btoa(s);
}
