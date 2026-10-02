// =============================================================================================
//  La musique d'ambiance : un morceau par personnage (public/music/music-<id>.mp3), en boucle sans couture.
//  La boucle : chaque passage commence 2 s avant la fin du précédent, en fondu enchaîné (la couture ne s'entend pas).
//  Le volume et la coupure sont gardés sur l'appareil. Les navigateurs n'autorisent le son qu'après un premier geste :
//  la musique démarre au premier toucher / clic / touche.
// =============================================================================================
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
    const debloquer = () => { this.demarrerContexte(); window.removeEventListener('pointerdown', debloquer); window.removeEventListener('keydown', debloquer); };
    window.addEventListener('pointerdown', debloquer); window.addEventListener('keydown', debloquer);
  }
  private demarrerContexte() {
    if (this.pret) return;
    // Sur iPhone, l'audio d'une page web suit l'interrupteur « silencieux » comme une sonnerie. On déclare que c'est de la
    // musique (« playback ») et on joue un son <audio> muet en boucle : la page passe alors en audio « média », comme une
    // vidéo, et la musique se fait entendre même en mode silencieux, au volume « média » du téléphone.
    try { (navigator as any).audioSession && ((navigator as any).audioSession.type = 'playback'); } catch { /* ancien navigateur */ }
    try {
      const muet = document.createElement('audio');
      muet.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
      muet.loop = true; muet.setAttribute('playsinline', ''); (muet as any).playsInline = true; muet.volume = .01;
      muet.play().catch(() => { /* refusé : tant pis */ });
      this.muet = muet;
    } catch { /* ignore */ }
    try {
      this.ac = new AudioContext();
      this.maitre = this.ac.createGain(); this.maitre.connect(this.ac.destination);
      this.maitre.gain.value = this.R.coupe ? 0 : this.R.volume;
      this.pret = true;
      if (this.voulu) this.jouer(this.voulu);
    } catch { /* pas de son possible sur cet appareil */ }
  }
  private variantes = new Map<string, Promise<Morceau[]>>();
  /** Tous les morceaux d'un personnage : music-lea.mp3, puis music-lea-2.mp3, music-lea-3.mp3… (d'autres écritures acceptées). */
  private charger(id: string): Promise<Morceau[]> {
    if (!this.variantes.has(id)) this.variantes.set(id, (async () => {
      const out: Morceau[] = [];
      const essayer = async (urls: string[]) => {
        for (const url of urls) {
          try {
            const r = await fetch(url); if (!r.ok || !(r.headers.get('content-type') || '').includes('audio')) continue;
            const buf = await this.ac!.decodeAudioData(await r.arrayBuffer());
            out.push(utile(buf)); return true;
          } catch { /* suivant */ }
        }
        return false;
      };
      await essayer([`music/music-${id}.mp3`, `music/music_${id}.mp3`, `music/musique_${id}.mp3`, `music/${id}.mp3`]);
      for (let k = 2; k <= 4; k++) if (!(await essayer([`music/music-${id}-${k}.mp3`, `music/music-${id}${k}.mp3`, `music/music_${id}_${k}.mp3`]))) break;
      if (!out.length) console.warn(`[musique] aucun fichier pour ${id} (attendu : public/music/music-${id}.mp3)`);
      else console.info(`[musique] ${id} : ${out.length} morceau(x), ` + out.map(m => `${m.debut.toFixed(1)}–${m.fin.toFixed(1)} s`).join(', '));
      return out;
    })());
    return this.variantes.get(id)!;
  }
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
  async nbMorceaux(id: string) { return this.pret ? (await this.charger(id)).length : 0; }

  /** Jouer une playlist, à partir d'un morceau ; les morceaux s'enchaînent dans l'ordre, en fondu, puis on recommence. */
  async jouer(id: string, depart = 0, force = false) {
    this.voulu = id;
    if (!this.pret || !this.ac) return;
    if (this.enCours?.id === id && !force) return;
    const morceaux = await this.charger(id);
    if (!morceaux.length || this.voulu !== id) return;
    this.arreter(force ? 1 : CHANGEMENT);
    const ac = this.ac, gain = ac.createGain(); gain.connect(this.maitre!);
    const entree = force ? 1 : CHANGEMENT;
    gain.gain.setValueAtTime(0, ac.currentTime); gain.gain.linearRampToValueAtTime(1, ac.currentTime + entree);
    const piste = { id, gain, sources: [] as AudioBufferSourceNode[], timer: 0 };
    let debut = ac.currentTime + .05, premier = true, k = depart % morceaux.length;
    const planifier = () => {
      const m = morceaux[k], duree = m.fin - m.debut, indexIci = k;
      const f = Math.min(FONDU, duree / 4);
      const s = ac.createBufferSource(); s.buffer = m.buf;
      const g = ac.createGain(); s.connect(g); g.connect(gain);
      if (premier) g.gain.setValueAtTime(1, debut); else { g.gain.setValueAtTime(0, debut); g.gain.linearRampToValueAtTime(1, debut + f); }
      g.gain.setValueAtTime(1, debut + duree - f); g.gain.linearRampToValueAtTime(0, debut + duree);
      s.start(debut, m.debut, duree + .05);
      const quand = Math.max(0, (debut - ac.currentTime) * 1000);
      window.setTimeout(() => { if (this.enCours === piste) { this.enCours_ = { id, index: indexIci, total: morceaux.length }; for (const fn of this.auditeurs) fn(); } }, quand);
      piste.sources.push(s); if (piste.sources.length > 3) piste.sources.shift();
      premier = false;
      debut += duree - f;
      k = (k + 1) % morceaux.length;                                           // le suivant, dans l'ordre
    };
    planifier();
    piste.timer = window.setInterval(() => { if (debut - ac.currentTime < 8) planifier(); }, 1000);
    this.enCours = piste;
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
