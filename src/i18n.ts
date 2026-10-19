// Toutes les phrases de l'interface. Aucun texte en dur ailleurs dans le code.
export const LANGUES = [
  { id: 'fr', nom: 'Français' },
  { id: 'en', nom: 'English' },
  { id: 'es', nom: 'Español' },
] as const;
export type Lang = typeof LANGUES[number]['id'];

const GUIDE_ACCUEIL = {
  fr: {
    titre: 'Bienvenue ! Voici ton menu ⚙', passer: 'Passer', fin: "C'est parti", revoir: 'Revoir le guide',
    lignes: ['La vidéo de présentation du jeu.', 'Comment j’ai créé ce jeu, étape par étape.', 'Ma carte : qui je suis, et où me suivre.', 'Les règles en 1 minute : semer, arroser, récolter, cuisiner, offrir.', 'Les meilleurs jardiniers. Crée un compte pour y figurer.', 'Léa, Marcel et Jimy en réalité augmentée, dans ta pièce, avec ton appareil photo.', 'Connecte-toi ou crée un compte : tu entres dans le classement et tu retrouves ton balcon sur tous tes appareils.', 'Pour voir tes plantes pousser en accéléré : Normal, ×50 ou ×90.'],
  },
  en: {
    titre: 'Welcome! Here is your menu ⚙', passer: 'Skip', fin: "Let's go", revoir: 'Show the guide again',
    lignes: ['The game’s presentation video.', 'How I made this game, step by step.', 'My card: who I am, and where to follow me.', 'The rules in 1 minute: sow, water, harvest, cook, give.', 'The best gardeners. Create an account to join the leaderboard.', 'Léa, Marcel and Jimy in augmented reality, in your room, using your camera.', 'Sign in or create an account: join the leaderboard and access your balcony on all your devices.', 'Watch your plants grow faster: Normal, ×50 or ×90.'],
  },
  es: {
    titre: '¡Bienvenido! Este es tu menú ⚙', passer: 'Omitir', fin: '¡Vamos!', revoir: 'Volver a ver la guía',
    lignes: ['El vídeo de presentación del juego.', 'Cómo hice este juego, paso a paso.', 'Mi tarjeta: quién soy y dónde seguirme.', 'Las reglas en 1 minuto: sembrar, regar, cosechar, cocinar, regalar.', 'Los mejores jardineros. Crea una cuenta para aparecer en la clasificación.', 'Léa, Marcel y Jimy en realidad aumentada, en tu habitación, con tu cámara.', 'Inicia sesión o crea una cuenta: entra en la clasificación y accede a tu balcón desde todos tus dispositivos.', 'Para ver tus plantas crecer más rápido: Normal, ×50 o ×90.'],
  },
};
export function guideAccueil() { return GUIDE_ACCUEIL[lang()]; }

const STRINGS = {
  fr: {
    title: 'Potager de Poche',
    tagline: "Un potager de balcon pour ceux qui n'en ont pas.",
    personnaliser: 'Personnaliser', plus: 'Plus (âge, métier)', retour: 'Retour', demoJury: '⏩ Démo accélérée', jouerAvec: (n: string) => `Jouer avec ${n}`,
    points: 'points',
    tabRecette: 'Ma recette', tabMarche: 'Le marché', tabBoutique: 'Boutique', tabCarnet: 'Carnet',
    recetteDuJour: 'Recette du jour', pasDeRecette: 'Pas de recette aujourd\u2019hui : demain, une nouvelle arrive.',
    jai: 'J\u2019ai', ilManque: 'Il manque', caPousse: 'Ça pousse', enPoche: 'Dans ma poche',
    coutTotal: (n: number) => `Ce qu\u2019il me manque vaut ${n} points au cours du jour`,
    cuisiner: 'Cuisiner', cuisinerPasEncore: 'Il manque des ingrédients pour cuisiner.',
    platPret: (nom: string) => `${nom} est prêt ! À qui l\u2019offrir ?`, offrirA: 'Offrir à',
    platOffert: (nom: string, a: string, pts: number) => `${nom} offert à ${a} : +${pts} points`,
    recetteFaite: 'Recette du jour faite. Demain, une nouvelle.',
    cours: 'Cours', annonces: 'Annonces des voisins', pasDAnnonce: 'Aucune annonce pour l\u2019instant.',
    donne: 'donne', contre: 'contre', accepter: 'Accepter', accepte: 'Acceptée', monAnnonce: 'mon annonce',
    proposerTroc: 'Proposer un troc', jeDonne: 'Je donne', jeCherche: 'Je cherche', publier: 'Publier',
    trocRefus: { trop_d_annonces: '3 annonces ouvertes maximum.', pas_assez: 'Pas assez dans le panier.', ecart_trop_grand: 'L\u2019échange n\u2019est pas équitable (25 % d\u2019écart maximum).' } as Record<string, string>,
    trocPublie: 'Annonce publiée : un voisin peut l\u2019accepter à tout moment.',
    trocAccepteToast: 'Troc accepté : c\u2019est dans ton panier.',
    varietes: 'Variétés de graines', prochainPot: (n: number) => `Un pot de plus : ${n} points`, potsComplets: 'Le balcon est plein.',
    acheterPot: 'Acheter un pot', potAchete: 'Un pot de plus sur le balcon !',
    varieteAchetee: (n: string) => `${n} : tu peux la semer.`, varietesMax: '5 variétés maximum dans la poche.',
    interdite: 'Impossible sur ce balcon', rare: 'graine rare',
    carnetVide: 'Aucun plat pour l\u2019instant. Cuisine ta recette du jour !', platsOfferts: 'plats offerts', raresRecues: 'graines rares', echanges: 'unités échangées',
    manqueUnites: (n: number, g: string) => `${n} ${g}`,
    panierPlein: 'Panier plein pour cette graine (20).',
    modeDemo: 'Mode démo : le temps passe 90 fois plus vite.',
    demoOn: '⏹ Quitter la démo accélérée', demoOff: 'Mode démo : tout 90 fois plus vite',
    guide0: (nom: string, liste: string, g: string) => `Ta première recette : ${nom}. Il te faut ${liste}. Touche un pot vide et sème : ${g}.`,
    guideAussi: (g: string) => `Maintenant, sème aussi : ${g}, dans un autre pot. Ta recette en a besoin.`,
    pasDansRecette: (g: string, r: string, reste: string) => `${g} poussera, mais n\u2019est pas dans ta recette. Pour ${r}, sème : ${reste}.`,
    guide1: 'Tout est semé. Quand une goutte apparaît sous un pot, touche-le pour l\u2019arroser.',
    guide2: 'Merci ! Maintenant ça pousse tout seul.',
    guide3: 'C\u2019est prêt. Touche le pot pour récolter.',
    guide4: 'Bien récolté. Quand tu as tout, ouvre le téléphone : Ma recette, puis Cuisiner.',
    guide5: (nom: string, liste: string, manque: string, voisins: string, n: number) => `Nouvelle recette : ${nom}. Il te faut ${liste}. Il te manque ${manque}, et tu n\u2019en as pas les graines. ${voisins} en ${n > 1 ? 'ont' : 'a'} : ouvre le marché et accepte ${n > 1 ? 'leurs échanges' : 'son échange'}.`,
    guide7: (nom: string, liste: string, g: string, prix: number, pts: number) => `Bravo ! Ta prochaine recette : ${nom}. Il te faudra ${liste}. Tu n\u2019as pas la graine de ${g} : achète-la dans la Boutique (${prix} points, tu en as ${pts}${pts < prix ? ' : encore un plat et tu pourras' : ''}), ou échange au marché.`,
    guide7tout: (nom: string, liste: string) => `Bravo ! Ta prochaine recette : ${nom}. Il te faudra ${liste}. Tu as déjà toutes les graines : sème-les maintenant.`,
    platPretGuide: 'Ton plat est prêt ! Offre-le à un voisin : ouvre le téléphone, c\u2019est tout en haut de Ma recette.',
    ligneInterdite2: 'Ton balcon ne peut pas en faire pousser : échange au marché.',
    ligneSansGraine: (prix: number) => `Tu n\u2019as pas cette graine : échange-la au marché, ou achète la graine à la Boutique (${prix} points).`,
    guide5Cultiver: (nom: string, liste: string, manque: string, recolter: string) => `Pour ${nom}, garde les ingrédients de la recette et récolte ${recolter} de plus : sème ou laisse repousser, puis arrose et récolte. Échange ensuite ce surplus au marché contre ${manque}.`,
    guide6: 'Échange fait : tu as tout pour cuisiner. Désormais, le marché est ouvert. Bon jardinage !',
    ligneOk: (n: number) => `Il t\u2019en faut ${n} · tu les as`,
    ligneManque: (a: number, n: number) => `Il t\u2019en faut ${n}, tu en as ${a}.`,
    ligneSemer: 'Sème-en, ça pousse ici.', lignePousse: (k: number) => `${k} pot${k > 1 ? 's' : ''} en pousse.`,
    ligneVoisin: 'Ton balcon n\u2019en fait pas pousser : un voisin en a.', ligneInterdite: 'Ton balcon n\u2019en fait pas pousser : un voisin en a.',
    recuDe: (n: number, g: string, de: string, c: string) => c === 'cadeau' ? `${de} t\u2019a monté ${n} ${g}` : `${n} ${g} échangés avec ${de}`,
    ligneRecu: (de: string, c: string) => c === 'cadeau' ? `offert par ${de}` : `échangé avec ${de}`,
    trocJeDonne: 'Je donne', trocContre: 'contre', trocEquitable: 'Échange équitable', trocDesequilibre: (a: number, b: number) => `Pas équitable : tu donnes ${a} points, tu demandes ${b}`,
    trocMax: (n: number) => `(tu en as ${n})`, retirer: 'Retirer', annonceRetiree: 'Annonce retirée : c\u2019est revenu dans ton panier.',
    refus: { deja: 'Un autre voisin a déjà accepté.', mienne: 'C\u2019est ton annonce.', expiree: 'Cette annonce a expiré.', pas_assez: (n: number, g: string) => `Il te faut ${n} ${g} dans ton panier pour accepter.` } as Record<string, any>,
    echangerAuMarche: 'Trouver au marché', recetteFaiteBarre: 'Recette faite', voirDemain: 'Voir la recette de demain', demainTitre: 'Recette de demain',
    pourTaRecette: 'Pour ta recette', ontCeQuilManque: 'Ces voisins ont ce qu\u2019il te manque :', personnePoste: (g: string) => `Personne ne propose encore de ${g}. Propose un échange : un voisin qui en cultive pourra l\u2019accepter.`,
    autresAnnonces: 'Les autres annonces', valeurTitre: 'Ce que vaut chaque récolte aujourd\u2019hui',
    valeurExplique: 'Plus une récolte est rare dans l\u2019immeuble et demandée, plus elle vaut de points. Échange tes récoltes qui valent cher contre ce qu\u2019il te manque.',
    rareM: 'rare', courante: 'courante', recherchee: 'recherchée', tuEnAs: (n: number) => `tu en as ${n}`, ilTeManqueB: 'il te manque',
    voir: 'Voir', aideRecette: 'Il te manque un ingrédient ? Touche « Trouver au marché ».',
    apps: { panier: 'Panier', classement: 'Classement', jeu: 'Jeu', musique: 'Musique', recette: 'Recette du jour', bourse: 'Bourse', marche: 'Marché', boutique: 'Boutique', carnet: 'Mes recettes', recus: 'Plats reçus', voisins: 'Voisins', notifs: 'Messages', reglages: 'Réglages' } as Record<string, string>,
    jeDonneQ: 'je donne', trocJeCherche: 'Je cherche', trocContreDonne: 'Je donne', mesAnnonces: 'Mes annonces', rienADonner: 'Tu n\u2019as rien en trop à échanger pour l\u2019instant : récolte un peu plus que ta recette (un pot de plus de ton herbe la plus rapide), ou attends une annonce qu\u2019un voisin t\u2019adresse.',
    bourseAuj: 'Les plus recherchées aujourd\u2019hui', bourseSemaine: 'Les plus recherchées cette semaine', bourseExplique: 'Une récolte vaut plus quand elle est demandée par les recettes de l\u2019immeuble et que peu de voisins la cultivent. Touche une récolte pour voir sa semaine et la prévision de demain.',
    demande: 'demandée', cultivateurs: (n: number) => `${n} voisin${n > 1 ? 's' : ''} la cultive${n > 1 ? 'nt' : ''}`, dansRecettes: (n: number) => `Utilisée dans ${n} recette${n > 1 ? 's' : ''} sur 66`,
    demain: 'Demain', prevHausse: 'probablement plus chère', prevBaisse: 'probablement moins chère', prevStable: 'à peu près pareil',
    leg: { cours: 'Valeur (points)', demande: 'Demande', cultiv: 'Voisins qui la cultivent' } as Record<string, string>,
    repondreA: (n: string) => `Répondre à ${n}`, envoye: (n: string) => `Envoyé à ${n}`, dejaRepondu: 'Tu as déjà répondu.',
    resumeAbsence: (p: number, t_: number, m: number) => 'Pendant ton absence : ' + [p ? `${p} plat${p > 1 ? 's' : ''} reçu${p > 1 ? 's' : ''}` : '', t_ ? `${t_} échange${t_ > 1 ? 's' : ''} accepté${t_ > 1 ? 's' : ''}` : '', m ? `${m} message${m > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ') + '.',
    verdict: { avantageux: 'Avantageux pour toi', equitable: 'Équitable', desavantageux: 'Désavantageux pour toi' } as Record<string, string>,
    valeurs: (r: number, d: number) => `tu reçois ≈ ${r} pts · tu donnes ≈ ${d} pts`,
    chanceAccept: { avantageux: 'Avantageux pour toi : les voisins accepteront moins vite.', equitable: 'Équitable : un voisin qui en a acceptera vite.', desavantageux: 'Généreux de ta part : accepté très vite.' } as Record<string, string>,
    tropLoin: 'Trop déséquilibré (plus de 3 fois) : ajuste les quantités.',
    gainPlat: (n: number, type: string, m: number, rare: boolean) => `Ce plat te rapportera ≈ ${n} pièces : la valeur de ses ingrédients au marché, ×${m} parce que c\u2019est ${type}${rare ? ', et ×3 grâce à un ingrédient que ton balcon ne fait pas pousser' : ''}.`,
    trocFait: (donne: string, recoit: string, avec: string) => `Tu viens de troquer ${donne} contre ${recoit} avec ${avec}.`,
    jeuT: 'Jeu du mois', jeuBientot: 'Bientôt ici : un petit jeu, un nouveau chaque mois.', jeuQuitter: 'Quitter le jeu', jeuCharge: 'Le jeu se charge…',
    recommencer: 'Oui, recommencer', annuler: 'Annuler', boutiqueBtn: (p: number) => `Boutique · ${p} pts`,
    chantierMots: ['On monte les murs…', 'On pose le balcon…', 'On remplit les pots de terre…', 'On accroche le tableau…', 'On range les graines…', 'On ouvre les volets…', 'Encore un instant…'],
    tuRecolteras: 'Tu récolteras', monPanier: 'Mon panier', panierVide: 'Ton panier est vide : récolte tes plantes mûres pour le remplir.', affichageBloque: 'L\u2019affichage s\u2019est figé : ta partie est enregistrée, recharge la page (F5).',
    reprendreMaPartie: 'Reprendre ma partie', ouAutrePerso: 'ou touche un autre personnage pour jouer avec lui',
    changerPerso: 'Changer de personnage', valider: 'Valider', persoEnregistre: 'C\u2019est enregistré.',
    compteT: 'Compte', jouerTout: 'Jouer tout de suite', jouerToutAide: 'Rien à taper : ta partie est gardée sur ce téléphone et en ligne. Tu pourras créer un compte plus tard sans rien perdre.',
    creerCompteT: 'Créer un compte', dejaCompte: 'J\u2019ai déjà un compte', pseudoT: 'Pseudo', mdpT: 'Mot de passe',
    pseudoAide: '3 à 20 lettres ou chiffres', pseudoLibre: '✓ libre', pseudoPris: '✗ déjà pris', mdpAide: 'Mot de passe : 8 caractères minimum.',
    creerBtn: 'Créer mon compte', connecterBtn: 'Me connecter', deconnecterBtn: 'Me déconnecter', connecteComme: (p: string) => `Connecté : ${p}`, inviteEnCours: 'Tu joues en invité.',
    errCompte: { court: 'Mot de passe trop court : 8 caractères minimum.', courant: 'Ce mot de passe est trop courant, choisis-en un autre.', pseudo_pris: 'Ce pseudo est déjà pris.', pseudo_invalide: 'Pseudo : 3 à 20 lettres ou chiffres.', identifiants: 'Pseudo ou mot de passe incorrect.', robot: 'Vérification anti-robot impossible : réessaie dans un instant.', hors_ligne: 'Le jeu n\u2019est pas encore relié en ligne.' } as Record<string, string>,
    compteOk: 'Compte créé : ta partie te suit sur tous tes appareils.', connexionOk: 'Connecté : on récupère ta partie.',
    classementT: 'Classement', catTrocs: 'Troqueurs', catRecoltes: 'Jardiniers', catOfferts: 'Cuisiniers', catRecus: 'Gâtés', classementVide: 'Personne encore : sois le premier jardinier du classement !', classementInvite: 'Crée un compte (gratuit) pour entrer au classement.', taPlace: 'Ta place : {r}e sur {n} ({s})', horsClassement: 'Offre ton premier plat pour entrer au classement.', classementHorsLigne: 'Le classement arrive avec la mise en ligne.', toi: 'toi',
    musiqueT: 'Musique', volumeT: 'Volume', playlists: 'Playlists', plAuto: 'Celle de mon personnage', plLea: 'Léa · Café parisien', plMarcel: 'Marcel · Musette', plJimy: 'Jimy · Reggae du toit', morceau: (i: number, n: number) => `Morceau ${i} sur ${n}`, touchePourSon: 'Touche l\u2019écran pour lancer la musique.', offrirLePlat: 'Offrir le plat', ilManqueN: (n: number) => `Il manque ${n} ingrédient${n > 1 ? 's' : ''} · voir`,
    semerBtn: 'Semer', potsPleins: 'Tous tes pots sont occupés : récolte d\u2019abord, ou achète un pot dans la Boutique.',
    echangerBtn: 'Échanger', acheterGraineBtn: (p: number) => `Acheter · ${p} pts`, toutAccepter: (n: number) => `Accepter les ${n} échanges pour ta recette`, maxBtn: 'Max',
    pourDemain: 'pour demain', pourAujourdhui: 'pour aujourd\u2019hui',
    tuPeuxRepondre: 'Tu peux lui répondre.', gainPieces: (n: number) => `+${n} pièces`, peutAcheter: 'Tu peux acheter une nouvelle graine dans la Boutique.', encorePieces: (n: number) => `Encore ${n} pièces et tu pourras acheter une nouvelle graine.`,
    pauseSoif: 'En pause : elle a soif. Arrose-la et elle repart.', ilReste: (t_: string) => `Encore ${t_}`, repondre: 'Répondre', fermerTel: 'Fermer',
    accueilTel: 'Accueil', fondEcran: 'Fond d\u2019écran', vibreur: 'Vibreur', sonNotif: 'Son des notifications', sonAucun: 'Silencieux', sonBip: 'Bip', sonCloche: 'Clochette', sonGoutte: 'Goutte',
    fonds: { aube: 'Aube', menthe: 'Menthe', lavande: 'Lavande', nuit: 'Nuit', terracotta: 'Terracotta', paris: 'Ciel de Paris' } as Record<string, string>,
    aucunMessage: 'Aucun message pour l\u2019instant.', essai: 'Essayer', maintenant: 'maintenant',
    collection: (n: number, t: number) => `Mes recettes : ${n} cuisinée${n > 1 ? 's' : ''} sur ${t}`,
    tuAsCuisine: 'Tu as cuisiné', aQuiOffrir: 'À qui veux-tu l\u2019offrir ?', ingredients: 'Ingrédients', laRecette: 'La recette', fermer: 'Fermer', plusTard: 'Plus tard',
    platsOffertsT: 'Plats offerts', platsRecusT: 'Plats reçus', aucunRecu: 'Aucun plat reçu pour l\u2019instant : tes voisins cuisinent aussi.', offertA: (n: string) => `offert à ${n}`, recuDeQui: (n: string) => `reçu de ${n}`,
    amourToujours: 'Tu en as toujours', impossibleIci: 'Impossible ici', pourRecette: 'pour ta recette', recetteHud: 'Recette', recetteHudFaite: 'Recette faite · voir celle de demain', aToi: 'à toi',
    poche: (n: number, max: number, pts: number) => `Ta poche : ${n} variété${n > 1 ? 's' : ''} sur ${max} · tu as ${pts} points`,
    manquePoints: (prix: number, pts: number) => `Il faut ${prix} points, tu en as ${pts}. Offre un plat pour en gagner.`,
    dejaATOI: 'Tu l\u2019as déjà dans ta poche.', premiereRecette: 'Ta première recette', touteTa: 'Tu as tout : tu peux cuisiner.',
    persoTitre: 'C\u2019est toi', zPeau: 'Peau', zCheveux: 'Cheveux', zHaut: 'Haut', zBas: 'Bas', zChaussures: 'Chaussures', zAutre: 'Autre couleur', zReset: 'D\u2019origine', persoPrenom: 'Ton prénom', persoAge: 'Ton âge', persoMetier: 'Ton métier', persoCouleurs: 'Tes couleurs', persoPhoto: '📸 Prendre ma photo', persoPhotoOk: 'Photo prise !', persoCouleurNom: (i: number) => `Couleur ${i}`,
    enCuisine: 'Elle cuisine…', ilCuisine: 'Il cuisine…',
    voisin: 'voisin', cultive: 'cultive', cherche: 'cherche',
    loading: 'Chargement du balcon…',
    tapToStart: 'Touche pour commencer',
    chooseCharacter: 'Qui jardine ?',
    yourName: 'Ton pseudo',
    play: 'Jouer',
    continue_: 'Continuer',
    newGame: 'Nouvelle partie',
    coins: 'pièces',
    basket: 'Panier',
    phone: 'Téléphone',
    sell: 'Vendre',
    buy: 'Acheter',
    rank: 'Classement',
    sellAll: 'Tout vendre',
    basketEmpty: 'Le panier est vide.',
    basketFull: 'Le panier est plein : va vendre.',
    seeds: 'Graines',
    pots: 'Pots',
    decos: 'Décos',
    upgrades: 'Améliorations',
    roof: 'Toit',
    owned: 'Acheté',
    locked: 'Verrouillé',
    unlockEarned: (n: number) => `Débloqué après ${n} € gagnés`,
    unlockRoof: 'Débloqué avec le toit',
    needFullBalcony: 'Il faut 8 pots sur le balcon.',
    notEnough: 'Pas assez de pièces.',
    bought: (name: string) => `${name} : acheté !`,
    sold: (n: number) => `Vendu pour ${n} €`,
    chooseSeed: 'Que semer ici ?',
    noSeeds: 'Plus de graines : achète-en au téléphone.',
    planted: (name: string) => `${name} semé`,
    watered: 'Arrosé',
    harvested: (name: string, n: number) => `${name} récolté (+${n})`,
    potEmpty: 'Le pot est vide, on peut resemer.',
    thirsty: 'A soif !',
    ready: 'Prêt à récolter',
    growing: (s: string) => `Pousse… ${s}`,
    stageNames: ['Semé', 'Pousse', 'Jeune', 'En fleurs', 'Prête'],
    roofUnlocked: 'Le toit est ouvert !',
    settings: 'Réglages',
    language: 'Langue',
    sound: 'Son',
    forceNight: 'Forcer la nuit',
    auto: 'Auto',
    day: 'Jour',
    night: 'Nuit',
    reset: 'Effacer la partie',
    resetConfirm: 'Effacer la partie et tout recommencer ?',
    close: 'Fermer',
    price: (n: number) => `${n} €`,
    score: 'Score',
    balconyValue: 'Valeur du balcon',
    earned: 'Gagné au total',
    rankSoon: 'Le classement en ligne arrive avec la sauvegarde partagée.',
    welcomeBack: 'Pendant ton absence :',
    nothingHappened: 'Rien de neuf, tout pousse.',
    readyCount: (n: number) => `${n} récolte(s) prête(s)`,
    wateredByChar: (name: string, n: number) => `${name} a arrosé ${n} pot(s)`,
    seedsLeft: (n: number) => `${n} graine(s)`,
    potsCount: (a: number, b: number) => `${a} / ${b} pots`,
    nextPot: (n: number) => `Pot suivant : ${n} €`,
    potMax: 'Le balcon est plein.',
    speed: 'Vitesse démo',
    toRoof: 'Sur le toit',
    home: 'Accueil',
    years: (n: number) => `${n} ans`,
    chooseSub: 'Chacun a son balcon, sa vue sur Paris, et ses graines de départ. La boutique est commune.',
    yourNick: 'Comment on t\u2019appelle ?',
    chooseTouch: 'Quel personnage choisis-tu ? Touche-le.',
    continueWith: (name: string) => `Reprendre la partie avec ${name}`,
    newGameHint: 'Nouvelle partie : choisis un personnage',
    fFirstName: 'Prénom',
    fAge: 'Âge',
    fJob: 'Profession',
    fAddress: 'Adresse',
    fLikes: 'Aime',
    fView: 'Vue',
    playWith: (name: string) => `Jouer avec ${name}`,
    goSell: 'Le panier est plein : va vendre au téléphone !',
    harvestsDone: (a: number, b: number) => `Récoltes : ${a}/${b}`,
    soilWet: 'Terre humide',
    soilDry: 'Terre sèche : à arroser',
    wilted: 'Fanée : arrose vite',
    readyNow: 'Prête à récolter !',
    basketTitle: 'Le panier',
    basketTotal: (n: number) => `Valeur : ${n} €`,
    openPhone: 'Ouvrir le téléphone',
    sellHint: (n: number) => `${n} récolte(s) à vendre`,
  },
  en: {
    title: 'Pocket Kitchen Garden',
    tagline: 'A balcony vegetable garden for those who have none.',
    personnaliser: 'Customise', plus: 'More (age, job)', retour: 'Back', demoJury: '⏩ Fast demo', jouerAvec: (n: string) => `Play as ${n}`,
    points: 'points',
    tabRecette: 'My recipe', tabMarche: 'Market', tabBoutique: 'Shop', tabCarnet: 'Notebook',
    recetteDuJour: 'Recipe of the day', pasDeRecette: 'No recipe today: a new one arrives tomorrow.',
    jai: 'I have', ilManque: 'Missing', caPousse: 'Growing', enPoche: 'In my pocket',
    coutTotal: (n: number) => `What I\u2019m missing is worth ${n} points at today\u2019s rate`,
    cuisiner: 'Cook', cuisinerPasEncore: 'Ingredients are missing to cook.',
    platPret: (nom: string) => `${nom} is ready! Who do you give it to?`, offrirA: 'Give to',
    platOffert: (nom: string, a: string, pts: number) => `${nom} given to ${a}: +${pts} points`,
    recetteFaite: 'Today\u2019s recipe is done. A new one tomorrow.',
    cours: 'Rates', annonces: 'Neighbours\u2019 offers', pasDAnnonce: 'No offer yet.',
    donne: 'gives', contre: 'for', accepter: 'Accept', accepte: 'Accepted', monAnnonce: 'my offer',
    proposerTroc: 'Propose a trade', jeDonne: 'I give', jeCherche: 'I\u2019m looking for', publier: 'Post',
    trocRefus: { trop_d_annonces: '3 open offers maximum.', pas_assez: 'Not enough in the basket.', ecart_trop_grand: 'The trade is not fair (25% gap maximum).' } as Record<string, string>,
    trocPublie: 'Offer posted: a neighbour can accept it any time.',
    trocAccepteToast: 'Trade accepted: it\u2019s in your basket.',
    varietes: 'Seed varieties', prochainPot: (n: number) => `One more pot: ${n} points`, potsComplets: 'The balcony is full.',
    acheterPot: 'Buy a pot', potAchete: 'One more pot on the balcony!',
    varieteAchetee: (n: string) => `${n}: you can sow it.`, varietesMax: '5 varieties maximum in the pocket.',
    interdite: 'Impossible on this balcony', rare: 'rare seed',
    carnetVide: 'No dish yet. Cook today\u2019s recipe!', platsOfferts: 'dishes given', raresRecues: 'rare seeds', echanges: 'units traded',
    manqueUnites: (n: number, g: string) => `${n} ${g}`,
    panierPlein: 'Basket full for this seed (20).',
    modeDemo: 'Demo mode: time runs 90× faster.',
    demoOn: '⏹ Leave the fast demo', demoOff: 'Demo mode: everything 90× faster',
    guide0: (nom: string, liste: string, g: string) => `Your first recipe: ${nom}. You need ${liste}. Tap an empty pot and sow: ${g}.`,
    guideAussi: (g: string) => `Now also sow: ${g}, in another pot. Your recipe needs it.`,
    pasDansRecette: (g: string, r: string, reste: string) => `${g} will grow, but it isn\u2019t in your recipe. For ${r}, sow: ${reste}.`,
    guide1: 'Everything is sown. When a drop appears under a pot, tap it to water.',
    guide2: 'Thank you! Now it grows on its own.',
    guide3: 'It\u2019s ready. Tap the pot to harvest.',
    guide4: 'Nicely harvested. When you have everything, open the phone: My recipe, then Cook.',
    guide5: (nom: string, liste: string, manque: string, voisins: string, n: number) => `New recipe: ${nom}. You need ${liste}. You\u2019re missing ${manque}, and you don\u2019t have the seeds. ${voisins} ${n > 1 ? 'have' : 'has'} some: open the market and accept ${n > 1 ? 'their trades' : 'their trade'}.`,
    guide7: (nom: string, liste: string, g: string, prix: number, pts: number) => `Well done! Your next recipe: ${nom}. You\u2019ll need ${liste}. You don\u2019t have the ${g} seed: buy it in the Shop (${prix} points, you have ${pts}${pts < prix ? ': one more dish and you can' : ''}), or trade at the market.`,
    guide7tout: (nom: string, liste: string) => `Well done! Your next recipe: ${nom}. You\u2019ll need ${liste}. You already have all the seeds: sow them now.`,
    platPretGuide: 'Your dish is ready! Give it to a neighbour: open the phone, it\u2019s at the very top of My recipe.',
    ligneInterdite2: 'Your balcony can\u2019t grow it: trade at the market.',
    ligneSansGraine: (prix: number) => `You don\u2019t have this seed: trade at the market, or buy the seed (${prix} points).`,
    guide5Cultiver: (nom: string, liste: string, manque: string, recolter: string) => `For ${nom}, keep your recipe ingredients and grow ${recolter} extra: sow or let plants regrow, then water and harvest. Trade this surplus at the market for ${manque}.`,
    guide6: 'Trade done: you have everything to cook. The market is open from now on. Happy gardening!',
    ligneOk: (n: number) => `You need ${n} · you have them`,
    ligneManque: (a: number, n: number) => `You need ${n}, you have ${a}.`,
    ligneSemer: 'Sow some, it grows here.', lignePousse: (k: number) => `${k} pot${k > 1 ? 's' : ''} growing.`,
    ligneVoisin: 'Your balcony can\u2019t grow it: a neighbour has some.', ligneInterdite: 'Your balcony can\u2019t grow it: a neighbour has some.',
    recuDe: (n: number, g: string, de: string, c: string) => c === 'cadeau' ? `${de} brought you ${n} ${g}` : `${n} ${g} traded with ${de}`,
    ligneRecu: (de: string, c: string) => c === 'cadeau' ? `given by ${de}` : `traded with ${de}`,
    trocJeDonne: 'I give', trocContre: 'for', trocEquitable: 'Fair trade', trocDesequilibre: (a: number, b: number) => `Not fair: you give ${a} points, you ask ${b}`,
    trocMax: (n: number) => `(you have ${n})`, retirer: 'Withdraw', annonceRetiree: 'Offer withdrawn: it\u2019s back in your basket.',
    refus: { deja: 'Another neighbour already accepted.', mienne: 'It\u2019s your offer.', expiree: 'This offer has expired.', pas_assez: (n: number, g: string) => `You need ${n} ${g} in your basket to accept.` } as Record<string, any>,
    echangerAuMarche: 'Find at the market', recetteFaiteBarre: 'Recipe done', voirDemain: 'See tomorrow\u2019s recipe', demainTitre: 'Tomorrow\u2019s recipe',
    pourTaRecette: 'For your recipe', ontCeQuilManque: 'These neighbours have what you\u2019re missing:', personnePoste: (g: string) => `Nobody offers ${g} yet. Propose a trade: a neighbour who grows it can accept.`,
    autresAnnonces: 'Other offers', valeurTitre: 'What each harvest is worth today',
    valeurExplique: 'The rarer and more wanted a harvest is in the building, the more points it\u2019s worth. Trade your valuable harvests for what you\u2019re missing.',
    rareM: 'rare', courante: 'common', recherchee: 'wanted', tuEnAs: (n: number) => `you have ${n}`, ilTeManqueB: 'you\u2019re missing',
    voir: 'See', aideRecette: 'Missing an ingredient? Tap “Find at the market”.',
    apps: { panier: 'Basket', classement: 'Ranking', jeu: 'Game', musique: 'Music', recette: 'Today\u2019s recipe', bourse: 'Stocks', marche: 'Market', boutique: 'Shop', carnet: 'My recipes', recus: 'Dishes received', voisins: 'Neighbours', notifs: 'Messages', reglages: 'Settings' } as Record<string, string>,
    jeDonneQ: 'I give', trocJeCherche: 'I want', trocContreDonne: 'I give', mesAnnonces: 'My offers', rienADonner: 'You have nothing spare to trade yet: harvest a little more than your recipe (one more pot of your fastest herb), or wait for an offer a neighbour makes you.',
    bourseAuj: 'Most wanted today', bourseSemaine: 'Most wanted this week', bourseExplique: 'A harvest is worth more when the building\u2019s recipes want it and few neighbours grow it. Tap a harvest to see its week and tomorrow\u2019s forecast.',
    demande: 'wanted', cultivateurs: (n: number) => `${n} neighbour${n > 1 ? 's' : ''} grow${n > 1 ? '' : 's'} it`, dansRecettes: (n: number) => `Used in ${n} recipe${n > 1 ? 's' : ''} out of 66`,
    demain: 'Tomorrow', prevHausse: 'probably pricier', prevBaisse: 'probably cheaper', prevStable: 'about the same',
    leg: { cours: 'Value (points)', demande: 'Demand', cultiv: 'Neighbours growing it' } as Record<string, string>,
    repondreA: (n: string) => `Reply to ${n}`, envoye: (n: string) => `Sent to ${n}`, dejaRepondu: 'You already replied.',
    resumeAbsence: (p: number, t_: number, m: number) => 'While you were away: ' + [p ? `${p} dish${p > 1 ? 'es' : ''} received` : '', t_ ? `${t_} trade${t_ > 1 ? 's' : ''} accepted` : '', m ? `${m} message${m > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ') + '.',
    verdict: { avantageux: 'Good deal for you', equitable: 'Fair', desavantageux: 'Bad deal for you' } as Record<string, string>,
    valeurs: (r: number, d: number) => `you get ≈ ${r} pts · you give ≈ ${d} pts`,
    chanceAccept: { avantageux: 'Good deal for you: neighbours will accept more slowly.', equitable: 'Fair: a neighbour who has some will accept quickly.', desavantageux: 'Generous of you: accepted very quickly.' } as Record<string, string>,
    tropLoin: 'Too unbalanced (more than 3 times): adjust the quantities.',
    gainPlat: (n: number, type: string, m: number, rare: boolean) => `This dish will earn you ≈ ${n} coins: its ingredients' market value, ×${m} because it's ${type}${rare ? ', and ×3 thanks to an ingredient your balcony can\u2019t grow' : ''}.`,
    trocFait: (donne: string, recoit: string, avec: string) => `You just traded ${donne} for ${recoit} with ${avec}.`,
    jeuT: 'Game of the month', jeuBientot: 'Coming soon: a little game, a new one every month.', jeuQuitter: 'Leave the game', jeuCharge: 'Loading the game…',
    recommencer: 'Yes, start over', annuler: 'Cancel', boutiqueBtn: (p: number) => `Shop · ${p} pts`,
    chantierMots: ['Raising the walls…', 'Fitting the balcony…', 'Filling the pots with soil…', 'Hanging the painting…', 'Sorting the seeds…', 'Opening the shutters…', 'One more moment…'],
    tuRecolteras: 'You will harvest', monPanier: 'My basket', panierVide: 'Your basket is empty: harvest your ripe plants to fill it.', affichageBloque: 'The display froze: your game is saved, reload the page (F5).',
    reprendreMaPartie: 'Resume my game', ouAutrePerso: 'or tap another character to play with them',
    changerPerso: 'Change character', valider: 'Save', persoEnregistre: 'Saved.',
    compteT: 'Account', jouerTout: 'Play right now', jouerToutAide: 'Nothing to type: your game is kept on this phone and online. You can create an account later without losing anything.',
    creerCompteT: 'Create an account', dejaCompte: 'I already have one', pseudoT: 'Username', mdpT: 'Password',
    pseudoAide: '3 to 20 letters or digits', pseudoLibre: '✓ available', pseudoPris: '✗ taken', mdpAide: 'Password: at least 8 characters.',
    creerBtn: 'Create my account', connecterBtn: 'Log in', deconnecterBtn: 'Log out', connecteComme: (p: string) => `Logged in: ${p}`, inviteEnCours: 'You are playing as a guest.',
    errCompte: { court: 'Password too short: at least 8 characters.', courant: 'This password is too common, pick another one.', pseudo_pris: 'This username is taken.', pseudo_invalide: 'Username: 3 to 20 letters or digits.', identifiants: 'Wrong username or password.', robot: 'Anti-bot check failed: try again in a moment.', hors_ligne: 'The game is not online yet.' } as Record<string, string>,
    compteOk: 'Account created: your game follows you on all your devices.', connexionOk: 'Logged in: fetching your game.',
    classementT: 'Leaderboard', catTrocs: 'Traders', catRecoltes: 'Gardeners', catOfferts: 'Cooks', catRecus: 'Spoiled', classementVide: 'Nobody yet: be the first gardener on the board!', classementInvite: 'Create a free account to join the leaderboard.', taPlace: 'Your rank: #{r} of {n} ({s})', horsClassement: 'Give your first dish to join the leaderboard.', classementHorsLigne: 'The leaderboard comes with the online version.', toi: 'you',
    musiqueT: 'Music', volumeT: 'Volume', playlists: 'Playlists', plAuto: 'My character\u2019s', plLea: 'Léa · Paris café', plMarcel: 'Marcel · Musette', plJimy: 'Jimy · Rooftop reggae', morceau: (i: number, n: number) => `Track ${i} of ${n}`, touchePourSon: 'Tap the screen to start the music.', offrirLePlat: 'Give the dish', ilManqueN: (n: number) => `${n} ingredient${n > 1 ? 's' : ''} missing · see`,
    semerBtn: 'Sow', potsPleins: 'All your pots are busy: harvest first, or buy a pot in the Shop.',
    echangerBtn: 'Trade', acheterGraineBtn: (p: number) => `Buy · ${p} pts`, toutAccepter: (n: number) => `Accept the ${n} trades for your recipe`, maxBtn: 'Max',
    pourDemain: 'for tomorrow', pourAujourdhui: 'for today',
    tuPeuxRepondre: 'You can reply.', gainPieces: (n: number) => `+${n} coins`, peutAcheter: 'You can buy a new seed in the Shop.', encorePieces: (n: number) => `${n} more coins and you can buy a new seed.`,
    pauseSoif: 'Paused: it\u2019s thirsty. Water it and it starts again.', ilReste: (t_: string) => `${t_} to go`, repondre: 'Reply', fermerTel: 'Close',
    accueilTel: 'Home', fondEcran: 'Wallpaper', vibreur: 'Vibration', sonNotif: 'Notification sound', sonAucun: 'Silent', sonBip: 'Beep', sonCloche: 'Bell', sonGoutte: 'Drop',
    fonds: { aube: 'Dawn', menthe: 'Mint', lavande: 'Lavender', nuit: 'Night', terracotta: 'Terracotta', paris: 'Paris sky' } as Record<string, string>,
    aucunMessage: 'No message yet.', essai: 'Try', maintenant: 'now',
    collection: (n: number, t: number) => `My recipes: ${n} cooked out of ${t}`,
    tuAsCuisine: 'You cooked', aQuiOffrir: 'Who would you like to give it to?', ingredients: 'Ingredients', laRecette: 'The recipe', fermer: 'Close', plusTard: 'Later',
    platsOffertsT: 'Dishes given', platsRecusT: 'Dishes received', aucunRecu: 'No dish received yet: your neighbours cook too.', offertA: (n: string) => `given to ${n}`, recuDeQui: (n: string) => `from ${n}`,
    amourToujours: 'You always have some', impossibleIci: 'Not here', pourRecette: 'for your recipe', recetteHud: 'Recipe', recetteHudFaite: 'Recipe done · see tomorrow\u2019s', aToi: 'yours',
    poche: (n: number, max: number, pts: number) => `Your pocket: ${n} variet${n > 1 ? 'ies' : 'y'} of ${max} · you have ${pts} points`,
    manquePoints: (prix: number, pts: number) => `You need ${prix} points, you have ${pts}. Give a dish to earn some.`,
    dejaATOI: 'Already in your pocket.', premiereRecette: 'Your first recipe', touteTa: 'You have everything: you can cook.',
    persoTitre: 'This is you', zPeau: 'Skin', zCheveux: 'Hair', zHaut: 'Top', zBas: 'Bottom', zChaussures: 'Shoes', zAutre: 'Other colour', zReset: 'Original', persoPrenom: 'Your first name', persoAge: 'Your age', persoMetier: 'Your job', persoCouleurs: 'Your colours', persoPhoto: '📸 Take my photo', persoPhotoOk: 'Photo taken!', persoCouleurNom: (i: number) => `Colour ${i}`,
    enCuisine: 'She is cooking…', ilCuisine: 'He is cooking…',
    voisin: 'neighbour', cultive: 'grows', cherche: 'looking for',
    loading: 'Loading the balcony…',
    tapToStart: 'Tap to start',
    chooseCharacter: 'Who\u2019s gardening?',
    yourName: 'Your nickname',
    play: 'Play',
    continue_: 'Continue',
    newGame: 'New game',
    coins: 'coins',
    basket: 'Basket',
    phone: 'Phone',
    sell: 'Sell',
    buy: 'Buy',
    rank: 'Ranking',
    sellAll: 'Sell everything',
    basketEmpty: 'The basket is empty.',
    basketFull: 'Basket full: go sell.',
    seeds: 'Seeds',
    pots: 'Pots',
    decos: 'Decor',
    upgrades: 'Upgrades',
    roof: 'Roof',
    owned: 'Owned',
    locked: 'Locked',
    unlockEarned: (n: number) => `Unlocks after earning ${n} €`,
    unlockRoof: 'Unlocks with the roof',
    needFullBalcony: 'You need 8 pots on the balcony.',
    notEnough: 'Not enough coins.',
    bought: (name: string) => `${name}: bought!`,
    sold: (n: number) => `Sold for ${n} €`,
    chooseSeed: 'What to sow here?',
    noSeeds: 'No seeds left: buy some on the phone.',
    planted: (name: string) => `${name} sown`,
    watered: 'Watered',
    harvested: (name: string, n: number) => `${name} harvested (+${n})`,
    potEmpty: 'The pot is empty, sow again.',
    thirsty: 'Thirsty!',
    ready: 'Ready to harvest',
    growing: (s: string) => `Growing… ${s}`,
    stageNames: ['Sown', 'Sprout', 'Young', 'Flowering', 'Ready'],
    roofUnlocked: 'The roof is open!',
    settings: 'Settings',
    language: 'Language',
    sound: 'Sound',
    forceNight: 'Force night',
    auto: 'Auto',
    day: 'Day',
    night: 'Night',
    reset: 'Erase the game',
    resetConfirm: 'Erase the game and start over?',
    close: 'Close',
    price: (n: number) => `${n} €`,
    score: 'Score',
    balconyValue: 'Balcony value',
    earned: 'Total earned',
    rankSoon: 'The online ranking comes with shared saving.',
    welcomeBack: 'While you were away:',
    nothingHappened: 'Nothing new, everything is growing.',
    readyCount: (n: number) => `${n} harvest(s) ready`,
    wateredByChar: (name: string, n: number) => `${name} watered ${n} pot(s)`,
    seedsLeft: (n: number) => `${n} seed(s)`,
    potsCount: (a: number, b: number) => `${a} / ${b} pots`,
    nextPot: (n: number) => `Next pot: ${n} €`,
    potMax: 'The balcony is full.',
    speed: 'Demo speed',
    toRoof: 'On the roof',
    home: 'Home',
    years: (n: number) => `${n} years old`,
    chooseSub: 'Each one has a balcony, a view of Paris and starter seeds. The shop is shared.',
    yourNick: 'What should we call you?',
    chooseTouch: 'Which character do you choose? Tap them.',
    continueWith: (name: string) => `Continue with ${name}`,
    newGameHint: 'New game: choose a character',
    fFirstName: 'First name',
    fAge: 'Age',
    fJob: 'Job',
    fAddress: 'Address',
    fLikes: 'Likes',
    fView: 'View',
    playWith: (name: string) => `Play with ${name}`,
    goSell: 'Basket full: go sell on the phone!',
    harvestsDone: (a: number, b: number) => `Harvests: ${a}/${b}`,
    soilWet: 'Soil is moist',
    soilDry: 'Soil is dry: water it',
    wilted: 'Wilting: water it now',
    readyNow: 'Ready to harvest!',
    basketTitle: 'The basket',
    basketTotal: (n: number) => `Value: ${n} €`,
    openPhone: 'Open the phone',
    sellHint: (n: number) => `${n} harvest(s) to sell`,
  },
} as const;

type TexteFonction = (...args: any[]) => string;
type Elargir<T> = T extends TexteFonction ? (...args: Parameters<T>) => string
  : T extends string ? string
  : T extends readonly unknown[] ? { [K in keyof T]: Elargir<T[K]> }
  : T extends object ? { [K in keyof T]: Elargir<T[K]> } : T;
export type DictionnairePartiel<T> = T extends TexteFonction ? T
  : T extends readonly unknown[] ? { [K in keyof T]?: DictionnairePartiel<T[K]> }
  : T extends object ? { [K in keyof T]?: DictionnairePartiel<T[K]> } : T;

const EXTRA_EN = {
  trocAttenteVoisin: 'If your offer is unfair to your neighbour, you may wait longer.',
  infosPlante: 'Plant info', infosVoirRecette: 'View the full recipe', infosChezToi: 'Cook it at home', infosDansJeu: 'In the game',
  infosBienfaits: 'Good to know', infosExposition: 'Light', infosArrosage: 'Watering', infosRecolte: 'Harvesting',
  infosPreparation: 'Preparation', infosCuisson: 'Cooking', infosRepos: 'Resting', infosTotal: 'Total', infosEtapes: 'Steps', infosAstuce: 'A little tip',
  infosChargement: 'Loading the guide…', infosIndisponible: 'The full guide will be available soon.',
  infosAccompagnement: 'Two side portions of vegetables.', infosQuantitesReelles: 'Kitchen quantities: these are separate from your game basket. Wash the produce before preparing it.',
  infosCultureReelle: 'For real-life growing: observe your plant and soil. Growing times in the game are imaginary.', infosToucheJeu: 'A touch from the game',
  infosPour: (n: number) => 'Serves ' + n,
  unite: 'unit', patienter: 'One moment, almost done!', commentJouer: 'How to play',
  personnagesAR: '📱 Meet the characters in AR', boutonRegles: '📖 How to play', afficherMdp: 'show password',
  pseudoPrefixe: 'Gardener ', typesRecette: { entree: 'starter', plat: 'main', dessert: 'dessert' },
  typesRecetteArticle: { entree: 'a starter', plat: 'a main course', dessert: 'a dessert' }, recoltes: 'harvests',
} as const;
const EXTRA_FR = {
  trocAttenteVoisin: "Si ton offre est désavantageuse pour le voisin, tu risques d'attendre plus longtemps.",
  infosPlante: 'Infos plante', infosVoirRecette: 'Voir la recette complète', infosChezToi: 'À cuisiner chez toi', infosDansJeu: 'Dans le jeu',
  infosBienfaits: 'Bienfaits', infosExposition: 'Exposition', infosArrosage: 'Arrosage', infosRecolte: 'Récolte',
  infosPreparation: 'Préparation', infosCuisson: 'Cuisson', infosRepos: 'Repos', infosTotal: 'Total', infosEtapes: 'Étapes', infosAstuce: 'La petite astuce',
  infosChargement: 'Chargement de la fiche…', infosIndisponible: 'La fiche complète sera bientôt disponible.',
  infosAccompagnement: 'Deux portions de légumes en accompagnement.', infosQuantitesReelles: 'Quantités de cuisine : elles sont indépendantes de ton panier du jeu. Lave les produits avant de les préparer.',
  infosCultureReelle: 'Pour cultiver chez toi : observe ta plante et la terre. Les temps de pousse du jeu sont imaginaires.', infosToucheJeu: 'La touche du jeu',
  infosPour: (n: number) => 'Pour ' + n + ' personne' + (n > 1 ? 's' : ''),
  unite: 'unité', patienter: 'Un instant, je termine !', commentJouer: 'Comment jouer',
  personnagesAR: '📱 Les personnages chez toi', boutonRegles: '📖 Comment jouer', afficherMdp: 'afficher le mot de passe',
  pseudoPrefixe: 'Jardinier ', typesRecette: { entree: 'entrée', plat: 'plat', dessert: 'dessert' },
  typesRecetteArticle: { entree: 'une entrée', plat: 'un plat', dessert: 'un dessert' }, recoltes: 'récoltes',
} as const;
export type Strings = Elargir<typeof STRINGS.en & typeof EXTRA_EN>;

/** Ne considère jamais une chaîne vide ou composée d'espaces comme une traduction. */
export function texteNonVide(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Complète les objets et tableaux, et protège aussi les retours des fonctions traduites. */
export function completer<T>(anglais: T, traduction: unknown): T {
  if (typeof anglais === 'string') {
    return (texteNonVide(traduction) ? traduction : texteNonVide(anglais) ? anglais : 'Information unavailable') as T;
  }
  if (typeof anglais === 'function') {
    const base = anglais as (...args: unknown[]) => unknown;
    const candidate = typeof traduction === 'function' ? traduction as typeof base : undefined;
    return ((...args: unknown[]) => {
      if (candidate) {
        try { const value = candidate(...args); if (texteNonVide(value)) return value; } catch { /* retour à la phrase anglaise */ }
      }
      try { const value = base(...args); if (texteNonVide(value)) return value; } catch { /* base mal formée */ }
      return 'Information unavailable';
    }) as T;
  }
  if (Array.isArray(anglais)) {
    const candidate = Array.isArray(traduction) ? traduction : [];
    return anglais.map((value, i) => completer(value, candidate[i])) as T;
  }
  if (anglais && typeof anglais === 'object') {
    const candidate = traduction && typeof traduction === 'object' && !Array.isArray(traduction)
      ? traduction as Record<string, unknown> : {};
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(anglais)) result[key] = completer(value, candidate[key]);
    return result as T;
  }
  return anglais;
}

export function estLang(value: unknown): value is Lang {
  return LANGUES.some(l => l.id === value);
}
export function detect(): Lang {
  try { const q = new URLSearchParams(location.search).get('lang'); if (estLang(q)) return q; } catch { /* hors navigateur */ }
  try { const saved = localStorage.getItem('jdp.lang'); if (estLang(saved)) return saved; } catch { /* stockage indisponible */ }
  return 'en';
}
let current: Lang = detect();
if (typeof document !== 'undefined') document.documentElement.lang = current;
export function lang(): Lang { return current; }
export function setLang(l: Lang) {
  current = estLang(l) ? l : 'en';
  try { localStorage.setItem('jdp.lang', current); } catch { /* stockage indisponible */ }
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

/** Un contenu localisé ; es est facultatif pour les anciennes données et sauvegardes. */
export type Bi = { fr: string; en: string; es?: string };
export function tx(o: Bi | undefined | null, l: Lang = current, secours = 'Information unavailable'): string {
  const langue = estLang(l) ? l : 'en';
  const value = o?.[langue];
  return texteNonVide(value) ? value : texteNonVide(o?.en) ? o.en : texteNonVide(secours) ? secours : 'Information unavailable';
}

export type ChampTexte = 'nom' | 'phrase' | 'interdit' | 'amour' | 'texte';
export type ChampsLocalises<C extends ChampTexte> = Partial<Record<`${C}_${Lang}`, string>>;
export function texteChamp<C extends ChampTexte>(o: ChampsLocalises<C> | undefined | null, champ: C, l: Lang = current, secours = 'Information unavailable'): string {
  const langue = estLang(l) ? l : 'en';
  const value = o?.[`${champ}_${langue}`];
  const anglais = o?.[`${champ}_en`];
  return texteNonVide(value) ? value : texteNonVide(anglais) ? anglais : texteNonVide(secours) ? secours : 'Information unavailable';
}

/** Si une étape ES manque, conserver toute la procédure anglaise plutôt que la raccourcir. */
export function etapesRecette(o: { etapes_fr?: string[]; etapes_en?: string[]; etapes_es?: string[] } | undefined | null, l: Lang = current): string[] {
  const anglais = o?.etapes_en;
  const candidate = o?.[`etapes_${estLang(l) ? l : 'en'}`];
  const valide = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && Array.from(v).every(texteNonVide);
  if (valide(candidate) && (!Array.isArray(anglais) || candidate.length === anglais.length)) return [...candidate];
  if (Array.isArray(anglais) && anglais.length > 0) return Array.from(anglais, v => texteNonVide(v) ? v : 'Step unavailable');
  return ['Recipe instructions unavailable'];
}
export function locale(l: Lang = current): 'fr-FR' | 'en-GB' | 'es-ES' {
  return l === 'fr' ? 'fr-FR' : l === 'es' ? 'es-ES' : 'en-GB';
}
export function typeRecette(type: string, l: Lang = current, article = false): string {
  const table = article ? t(l).typesRecetteArticle : t(l).typesRecette;
  return Object.prototype.hasOwnProperty.call(table, type) ? table[type as keyof typeof table] : 'dish';
}

export interface QuantiteES { singulier: string; pluriel: string; unite?: 'ramita' | 'diente' | 'puñado' }
export interface GraineQuantite { id: string; famille: string; nom_fr: string; nom_en: string; nom_es?: string; quantite_es?: QuantiteES }


const ESPAGNOL = {
  trocAttenteVoisin: 'Si tu oferta es desventajosa para el vecino, puede que esperes más tiempo.',
  infosPlante: 'Info de la planta', infosVoirRecette: 'Ver la receta completa', infosChezToi: 'Para cocinar en casa', infosDansJeu: 'En el juego',
  infosBienfaits: 'Qué te aporta', infosExposition: 'Luz', infosArrosage: 'Riego', infosRecolte: 'Cosecha',
  infosPreparation: 'Preparación', infosCuisson: 'Cocción', infosRepos: 'Reposo', infosTotal: 'Total', infosEtapes: 'Pasos', infosAstuce: 'Un pequeño truco',
  infosChargement: 'Cargando la ficha…', infosIndisponible: 'La ficha completa estará disponible pronto.',
  infosAccompagnement: 'Dos raciones de verduras como guarnición.', infosQuantitesReelles: 'Cantidades para cocinar: son independientes de tu cesta del juego. Lava los productos antes de prepararlos.',
  infosCultureReelle: 'Para cultivar en casa: observa tu planta y la tierra. Los tiempos de crecimiento del juego son imaginarios.', infosToucheJeu: 'El toque del juego',
  infosPour: (n: number) => 'Para ' + n + ' persona' + (n > 1 ? 's' : ''),
  title: 'Huerto de Bolsillo',
  tagline: 'Un huerto de balcón para quienes no tienen uno.',
  personnaliser: 'Personalizar', plus: 'Más (edad, profesión)', retour: 'Volver', demoJury: '⏩ Demo acelerada', jouerAvec: (n: string) => `Jugar con ${n}`,
  points: 'puntos',
  tabRecette: 'Mi receta', tabMarche: 'El mercado', tabBoutique: 'Tienda', tabCarnet: 'Recetario',
  recetteDuJour: 'Receta del día', pasDeRecette: 'Hoy no hay receta: mañana llegará una nueva.',
  jai: 'Tengo', ilManque: 'Falta', caPousse: 'Está creciendo', enPoche: 'En mi bolsillo',
  coutTotal: (n: number) => `Lo que me falta vale ${n} puntos al precio de hoy`,
  cuisiner: 'Cocinar', cuisinerPasEncore: 'Te faltan ingredientes para cocinar.',
  platPret: (nom: string) => `¡${nom} ya está listo! ¿A quién se lo regalas?`, offrirA: 'Regalar a',
  platOffert: (nom: string, a: string, pts: number) => `${nom}, regalado a ${a}: +${pts} puntos`,
  recetteFaite: 'Ya has preparado la receta del día. Mañana habrá otra.',
  cours: 'Precios', annonces: 'Ofertas de tus vecinos', pasDAnnonce: 'Todavía no hay ofertas.',
  donne: 'da', contre: 'a cambio de', accepter: 'Aceptar', accepte: 'Aceptada', monAnnonce: 'mi oferta',
  proposerTroc: 'Proponer un intercambio', jeDonne: 'Doy', jeCherche: 'Busco', publier: 'Publicar',
  trocRefus: { trop_d_annonces: 'Puedes tener un máximo de 3 ofertas abiertas.', pas_assez: 'No tienes suficiente en la cesta.', ecart_trop_grand: 'El intercambio no es justo (la diferencia máxima es del 25 %).' },
  trocPublie: 'Oferta publicada: un vecino puede aceptarla en cualquier momento.',
  trocAccepteToast: 'Intercambio aceptado: ya está en tu cesta.',
  varietes: 'Variedades de semillas', prochainPot: (n: number) => `Una maceta más: ${n} puntos`, potsComplets: 'El balcón está lleno.',
  acheterPot: 'Comprar una maceta', potAchete: '¡Una maceta más en el balcón!',
  varieteAchetee: (n: string) => `${n}: ya puedes sembrarla.`, varietesMax: 'Puedes llevar un máximo de 5 variedades en el bolsillo.',
  interdite: 'No crece en este balcón', rare: 'semilla rara',
  carnetVide: 'Todavía no hay platos. ¡Prepara tu receta del día!', platsOfferts: 'platos regalados', raresRecues: 'semillas raras', echanges: 'unidades intercambiadas',
  manqueUnites: (n: number, g: string) => `${n} ${g}`,
  panierPlein: 'La cesta está llena para esta semilla (20).',
  modeDemo: 'Modo demo: el tiempo pasa 90 veces más rápido.',
  demoOn: '⏹ Salir de la demo acelerada', demoOff: 'Modo demo: todo va 90 veces más rápido',
  guide0: (nom: string, liste: string, g: string) => `Tu primera receta: ${nom}. Necesitas ${liste}. Toca una maceta vacía y siembra: ${g}.`,
  guideAussi: (g: string) => `Ahora siembra también ${g} en otra maceta. Lo necesitas para tu receta.`,
  pasDansRecette: (g: string, r: string, reste: string) => `${g} crecerá, pero no forma parte de tu receta. Para ${r}, siembra: ${reste}.`,
  guide1: 'Ya está todo sembrado. Cuando aparezca una gota debajo de una maceta, tócala para regarla.',
  guide2: '¡Gracias! Ahora crecerá sin ayuda.',
  guide3: 'Ya está listo. Toca la maceta para cosechar.',
  guide4: '¡Buena cosecha! Cuando lo tengas todo, abre el teléfono: Mi receta y luego Cocinar.',
  guide5: (nom: string, liste: string, manque: string, voisins: string, n: number) => `Nueva receta: ${nom}. Necesitas ${liste}. Te falta ${manque} y no tienes las semillas. ${voisins} ${n > 1 ? 'tienen' : 'tiene'} lo que necesitas: abre el mercado y acepta ${n > 1 ? 'sus intercambios' : 'su intercambio'}.`,
  guide7: (nom: string, liste: string, g: string, prix: number, pts: number) => `¡Bien hecho! Tu próxima receta: ${nom}. Necesitarás ${liste}. No tienes semillas de ${g}: cómpralas en la Tienda (${prix} puntos, tienes ${pts}${pts < prix ? ': regala un plato más y podrás comprarlas' : ''}) o consíguelas en el mercado.`,
  guide7tout: (nom: string, liste: string) => `¡Bien hecho! Tu próxima receta: ${nom}. Necesitarás ${liste}. Ya tienes todas las semillas: siémbralas ahora.`,
  platPretGuide: '¡Tu plato está listo! Regálaselo a un vecino: abre el teléfono, lo tienes arriba del todo en Mi receta.',
  ligneInterdite2: 'No crece en tu balcón: consíguelo en el mercado.',
  ligneSansGraine: (prix: number) => `No tienes estas semillas: consíguelas en el mercado o cómpralas en la Tienda (${prix} puntos).`,
  guide5Cultiver: (nom: string, liste: string, manque: string, recolter: string) => `Para ${nom}, guarda ${liste} y cosecha además ${recolter}: siembra o deja que vuelva a crecer, riega y cosecha. Después intercambia lo que te sobre en el mercado por ${manque}.`,
  guide6: 'Intercambio hecho: ya tienes todo para cocinar. A partir de ahora, el mercado está abierto. ¡Disfruta de tu huerto!',
  ligneOk: (n: number) => `Necesitas ${n} · ya lo tienes`,
  ligneManque: (a: number, n: number) => `Necesitas ${n}, tienes ${a}.`,
  ligneSemer: 'Siembra, aquí crece.', lignePousse: (k: number) => `${k} maceta${k === 1 ? '' : 's'} con plantas creciendo.`,
  ligneVoisin: 'No crece en tu balcón: un vecino lo tiene.', ligneInterdite: 'No crece en tu balcón: un vecino lo tiene.',
  recuDe: (n: number, g: string, de: string, c: string) => c === 'cadeau' ? `${de} te ha traído ${n} ${g}` : `${n} ${g}, intercambiados con ${de}`,
  ligneRecu: (de: string, c: string) => c === 'cadeau' ? `regalo de ${de}` : `intercambiado con ${de}`,
  trocJeDonne: 'Doy', trocContre: 'a cambio de', trocEquitable: 'Intercambio justo', trocDesequilibre: (a: number, b: number) => `No es justo: das ${a} puntos y pides ${b}`,
  trocMax: (n: number) => `(tienes ${n})`, retirer: 'Retirar', annonceRetiree: 'Oferta retirada: vuelve a estar en tu cesta.',
  refus: { deja: 'Otro vecino ya la ha aceptado.', mienne: 'Es tu propia oferta.', expiree: 'Esta oferta ha caducado.', pas_assez: (n: number, g: string) => `Necesitas ${n} ${g} en tu cesta para aceptar.` },
  echangerAuMarche: 'Buscar en el mercado', recetteFaiteBarre: 'Receta preparada', voirDemain: 'Ver la receta de mañana', demainTitre: 'Receta de mañana',
  pourTaRecette: 'Para tu receta', ontCeQuilManque: 'Estos vecinos tienen lo que te falta:', personnePoste: (g: string) => `Todavía nadie ofrece ${g}. Propón un intercambio: un vecino que lo cultive podrá aceptarlo.`,
  autresAnnonces: 'Las otras ofertas', valeurTitre: 'Lo que vale cada cosecha hoy',
  valeurExplique: 'Cuanto más escasa y buscada sea una cosecha en el edificio, más puntos vale. Intercambia tus cosechas más valiosas por lo que te falta.',
  rareM: 'escasa', courante: 'abundante', recherchee: 'buscada', tuEnAs: (n: number) => `tienes ${n}`, ilTeManqueB: 'te falta',
  voir: 'Ver', aideRecette: '¿Te falta un ingrediente? Toca «Buscar en el mercado».',
  apps: { panier: 'Cesta', classement: 'Clasificación', jeu: 'Juego', musique: 'Música', recette: 'Receta del día', bourse: 'Cotizaciones', marche: 'Mercado', boutique: 'Tienda', carnet: 'Mis recetas', recus: 'Platos recibidos', voisins: 'Vecinos', notifs: 'Mensajes', reglages: 'Ajustes' },
  jeDonneQ: 'doy', trocJeCherche: 'Busco', trocContreDonne: 'Doy', mesAnnonces: 'Mis ofertas', rienADonner: 'Todavía no te sobra nada para intercambiar: cosecha un poco más de lo que pide tu receta (una maceta extra de la hierba que crezca más rápido) o espera una oferta de un vecino para ti.',
  bourseAuj: 'Lo más buscado hoy', bourseSemaine: 'Lo más buscado esta semana', bourseExplique: 'Una cosecha vale más cuando las recetas del edificio la necesitan y pocos vecinos la cultivan. Toca una cosecha para ver su semana y la previsión de mañana.',
  demande: 'buscada', cultivateurs: (n: number) => `${n} vecino${n === 1 ? '' : 's'} la cultiva${n === 1 ? '' : 'n'}`, dansRecettes: (n: number) => `Se usa en ${n} receta${n === 1 ? '' : 's'} de 66`,
  demain: 'Mañana', prevHausse: 'probablemente más cara', prevBaisse: 'probablemente más barata', prevStable: 'más o menos igual',
  leg: { cours: 'Valor (puntos)', demande: 'Demanda', cultiv: 'Vecinos que la cultivan' },
  repondreA: (n: string) => `Responder a ${n}`, envoye: (n: string) => `Enviado a ${n}`, dejaRepondu: 'Ya has respondido.',
  resumeAbsence: (p: number, t_: number, m: number) => 'Mientras no estabas: ' + [p ? `${p} plato${p === 1 ? '' : 's'} recibido${p === 1 ? '' : 's'}` : '', t_ ? `${t_} intercambio${t_ === 1 ? '' : 's'} aceptado${t_ === 1 ? '' : 's'}` : '', m ? `${m} mensaje${m === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ') + '.',
  verdict: { avantageux: 'Ventajoso para ti', equitable: 'Justo', desavantageux: 'Desventajoso para ti' },
  valeurs: (r: number, d: number) => `recibes ≈ ${r} ptos · das ≈ ${d} ptos`,
  chanceAccept: { avantageux: 'Ventajoso para ti: los vecinos tardarán más en aceptar.', equitable: 'Justo: un vecino que lo tenga aceptará pronto.', desavantageux: 'Generoso por tu parte: lo aceptarán enseguida.' },
  tropLoin: 'Demasiado desigual (más de 3 veces): ajusta las cantidades.',
  gainPlat: (n: number, type: string, m: number, rare: boolean) => `Este plato te dará ≈ ${n} monedas: el valor de sus ingredientes en el mercado, ×${m} porque es ${type}${rare ? ', y ×3 gracias a un ingrediente que no crece en tu balcón' : ''}.`,
  trocFait: (donne: string, recoit: string, avec: string) => `Has intercambiado ${donne} por ${recoit} con ${avec}.`,
  jeuT: 'Juego del mes', jeuBientot: 'Próximamente: un pequeño juego, uno nuevo cada mes.', jeuQuitter: 'Salir del juego', jeuCharge: 'El juego se está cargando…',
  recommencer: 'Sí, empezar de nuevo', annuler: 'Cancelar', boutiqueBtn: (p: number) => `Tienda · ${p} ptos`,
  chantierMots: ['Estamos levantando las paredes…', 'Estamos montando el balcón…', 'Estamos llenando las macetas de tierra…', 'Estamos colgando el cuadro…', 'Estamos ordenando las semillas…', 'Estamos abriendo las contraventanas…', 'Un momento más…'],
  tuRecolteras: 'Cosecharás', monPanier: 'Mi cesta', panierVide: 'Tu cesta está vacía: cosecha tus plantas maduras para llenarla.', affichageBloque: 'La pantalla se ha quedado bloqueada: tu partida está guardada, recarga la página (F5).',
  reprendreMaPartie: 'Continuar mi partida', ouAutrePerso: 'o toca otro personaje para jugar con él',
  changerPerso: 'Cambiar de personaje', valider: 'Guardar', persoEnregistre: 'Ya está guardado.',
  compteT: 'Cuenta', jouerTout: 'Jugar ahora', jouerToutAide: 'No tienes que escribir nada: tu partida se guarda en este teléfono y en línea. Puedes crear una cuenta más adelante sin perder nada.',
  creerCompteT: 'Crear una cuenta', dejaCompte: 'Ya tengo una cuenta', pseudoT: 'Nombre de usuario', mdpT: 'Contraseña',
  pseudoAide: 'De 3 a 20 letras o números', pseudoLibre: '✓ disponible', pseudoPris: '✗ ya está en uso', mdpAide: 'Contraseña: al menos 8 caracteres.',
  creerBtn: 'Crear mi cuenta', connecterBtn: 'Iniciar sesión', deconnecterBtn: 'Cerrar sesión', connecteComme: (p: string) => `Sesión iniciada: ${p}`, inviteEnCours: 'Estás jugando como invitado.',
  errCompte: { court: 'La contraseña es demasiado corta: al menos 8 caracteres.', courant: 'Esta contraseña es demasiado común, elige otra.', pseudo_pris: 'Este nombre de usuario ya está en uso.', pseudo_invalide: 'Nombre de usuario: de 3 a 20 letras o números.', identifiants: 'Nombre de usuario o contraseña incorrectos.', robot: 'No se ha podido comprobar que no eres un robot: vuelve a intentarlo en un momento.', hors_ligne: 'El juego todavía no está conectado en línea.' },
  compteOk: 'Cuenta creada: puedes seguir tu partida en todos tus dispositivos.', connexionOk: 'Sesión iniciada: estamos recuperando tu partida.',
  classementT: 'Clasificación', catTrocs: 'Intercambios', catRecoltes: 'Huerto', catOfferts: 'Cocina', catRecus: 'Regalos recibidos', classementVide: 'Todavía no hay nadie: ¡sé la primera persona en la clasificación!', classementInvite: 'Crea una cuenta gratuita para entrar en la clasificación.', taPlace: 'Tu puesto: {r}.º de {n} ({s})', horsClassement: 'Regala tu primer plato para entrar en la clasificación.', classementHorsLigne: 'La clasificación llegará con la versión en línea.', toi: 'tú',
  musiqueT: 'Música', volumeT: 'Volumen', playlists: 'Listas de reproducción', plAuto: 'La de mi personaje', plLea: 'Léa · Café parisino', plMarcel: 'Marcel · Musette', plJimy: 'Jimy · Reggae en la azotea', morceau: (i: number, n: number) => `Tema ${i} de ${n}`, touchePourSon: 'Toca la pantalla para iniciar la música.', offrirLePlat: 'Regalar el plato', ilManqueN: (n: number) => `Falta${n === 1 ? '' : 'n'} ${n} ingrediente${n === 1 ? '' : 's'} · ver`,
  semerBtn: 'Sembrar', potsPleins: 'Todas tus macetas están ocupadas: cosecha primero o compra una maceta en la Tienda.',
  echangerBtn: 'Intercambiar', acheterGraineBtn: (p: number) => `Comprar · ${p} ptos`, toutAccepter: (n: number) => `Aceptar los ${n} intercambios para tu receta`, maxBtn: 'Máx.',
  pourDemain: 'para mañana', pourAujourdhui: 'para hoy',
  tuPeuxRepondre: 'Puedes responder.', gainPieces: (n: number) => `+${n} monedas`, peutAcheter: 'Puedes comprar nuevas semillas en la Tienda.', encorePieces: (n: number) => `Con ${n} monedas más podrás comprar nuevas semillas.`,
  pauseSoif: 'En pausa: tiene sed. Riégala para que siga creciendo.', ilReste: (t_: string) => `Quedan ${t_}`, repondre: 'Responder', fermerTel: 'Cerrar',
  accueilTel: 'Inicio', fondEcran: 'Fondo de pantalla', vibreur: 'Vibración', sonNotif: 'Sonido de las notificaciones', sonAucun: 'Silencio', sonBip: 'Pitido', sonCloche: 'Campanita', sonGoutte: 'Gota',
  fonds: { aube: 'Amanecer', menthe: 'Menta', lavande: 'Lavanda', nuit: 'Noche', terracotta: 'Terracota', paris: 'Cielo de Paris' },
  aucunMessage: 'Todavía no hay mensajes.', essai: 'Probar', maintenant: 'ahora',
  collection: (n: number, t: number) => `Mis recetas: ${n} preparada${n === 1 ? '' : 's'} de ${t}`,
  tuAsCuisine: 'Has cocinado', aQuiOffrir: '¿A quién quieres regalárselo?', ingredients: 'Ingredientes', laRecette: 'La receta', fermer: 'Cerrar', plusTard: 'Más tarde',
  platsOffertsT: 'Platos regalados', platsRecusT: 'Platos recibidos', aucunRecu: 'Todavía no has recibido ningún plato: tus vecinos también cocinan.', offertA: (n: string) => `regalado a ${n}`, recuDeQui: (n: string) => `de ${n}`,
  amourToujours: 'Siempre tienes', impossibleIci: 'Aquí no crece', pourRecette: 'para tu receta', recetteHud: 'Receta', recetteHudFaite: 'Receta preparada · ver la de mañana', aToi: 'ya lo tienes',
  poche: (n: number, max: number, pts: number) => `Tu bolsillo: ${n} variedad${n === 1 ? '' : 'es'} de ${max} · tienes ${pts} puntos`,
  manquePoints: (prix: number, pts: number) => `Necesitas ${prix} puntos, tienes ${pts}. Regala un plato para ganar más.`,
  dejaATOI: 'Ya lo tienes en tu bolsillo.', premiereRecette: 'Tu primera receta', touteTa: 'Lo tienes todo: ya puedes cocinar.',
  persoTitre: 'Este eres tú', zPeau: 'Piel', zCheveux: 'Pelo', zHaut: 'Parte de arriba', zBas: 'Parte de abajo', zChaussures: 'Calzado', zAutre: 'Otro color', zReset: 'Original', persoPrenom: 'Tu nombre', persoAge: 'Tu edad', persoMetier: 'Tu profesión', persoCouleurs: 'Tus colores', persoPhoto: '📸 Hacerme una foto', persoPhotoOk: '¡Foto hecha!', persoCouleurNom: (i: number) => `Color ${i}`,
  enCuisine: 'Está cocinando…', ilCuisine: 'Está cocinando…',
  voisin: 'vecino', cultive: 'cultiva', cherche: 'busca',
  loading: 'Cargando el balcón…', tapToStart: 'Toca para empezar', chooseCharacter: '¿Quién cuida el huerto?', yourName: 'Tu nombre de usuario',
  play: 'Jugar', continue_: 'Continuar', newGame: 'Nueva partida', coins: 'monedas', basket: 'Cesta', phone: 'Teléfono', sell: 'Vender', buy: 'Comprar', rank: 'Clasificación', sellAll: 'Vender todo',
  basketEmpty: 'La cesta está vacía.', basketFull: 'La cesta está llena: ve a vender.', seeds: 'Semillas', pots: 'Macetas', decos: 'Decoración', upgrades: 'Mejoras', roof: 'Azotea', owned: 'Comprado', locked: 'Bloqueado',
  unlockEarned: (n: number) => `Se desbloquea al ganar ${n} €`, unlockRoof: 'Se desbloquea con la azotea', needFullBalcony: 'Necesitas 8 macetas en el balcón.', notEnough: 'No tienes suficientes monedas.',
  bought: (name: string) => `¡${name}, comprado!`, sold: (n: number) => `Vendido por ${n} €`, chooseSeed: '¿Qué quieres sembrar aquí?', noSeeds: 'No quedan semillas: cómpralas en el teléfono.',
  planted: (name: string) => `${name}, sembrado`, watered: 'Regado', harvested: (name: string, n: number) => `${name}, cosechado (+${n})`, potEmpty: 'La maceta está vacía, puedes volver a sembrar.', thirsty: '¡Tiene sed!', ready: 'Listo para cosechar', growing: (s: string) => `Creciendo… ${s}`,
  stageNames: ['Sembrada', 'Brotando', 'Joven', 'En flor', 'Lista'], roofUnlocked: '¡La azotea está abierta!', settings: 'Ajustes', language: 'Idioma', sound: 'Sonido', forceNight: 'Forzar la noche', auto: 'Auto', day: 'Día', night: 'Noche', reset: 'Borrar la partida', resetConfirm: '¿Quieres borrar la partida y empezar de nuevo?', close: 'Cerrar',
  price: (n: number) => `${n} €`, score: 'Puntuación', balconyValue: 'Valor del balcón', earned: 'Ganado en total', rankSoon: 'La clasificación en línea llegará con las partidas compartidas.',
  welcomeBack: 'Mientras no estabas:', nothingHappened: 'Nada nuevo, todo sigue creciendo.', readyCount: (n: number) => `${n} cosecha${n === 1 ? '' : 's'} lista${n === 1 ? '' : 's'}`, wateredByChar: (name: string, n: number) => `${name} ha regado ${n} maceta${n === 1 ? '' : 's'}`, seedsLeft: (n: number) => `${n} semilla${n === 1 ? '' : 's'}`, potsCount: (a: number, b: number) => `${a} / ${b} macetas`, nextPot: (n: number) => `Siguiente maceta: ${n} €`, potMax: 'El balcón está lleno.', speed: 'Velocidad de la demo', toRoof: 'A la azotea', home: 'Inicio',
  years: (n: number) => `${n} años`, chooseSub: 'Cada personaje tiene su balcón, sus vistas de Paris y sus semillas iniciales. La tienda es la misma para todos.', yourNick: '¿Cómo te llamamos?', chooseTouch: '¿Qué personaje eliges? Tócalo.', continueWith: (name: string) => `Continuar la partida con ${name}`, newGameHint: 'Nueva partida: elige un personaje', fFirstName: 'Nombre', fAge: 'Edad', fJob: 'Profesión', fAddress: 'Dirección', fLikes: 'Le gusta', fView: 'Vistas', playWith: (name: string) => `Jugar con ${name}`,
  goSell: '¡La cesta está llena: ve a vender en el teléfono!', harvestsDone: (a: number, b: number) => `Cosechas: ${a}/${b}`, soilWet: 'La tierra está húmeda', soilDry: 'La tierra está seca: riégala', wilted: 'Se está marchitando: riega enseguida', readyNow: '¡Ya puedes cosechar!', basketTitle: 'La cesta', basketTotal: (n: number) => `Valor: ${n} €`, openPhone: 'Abrir el teléfono', sellHint: (n: number) => `${n} cosecha${n === 1 ? '' : 's'} para vender`,
  unite: 'unidad', patienter: '¡Un momento, ya casi está!', commentJouer: 'Cómo jugar', personnagesAR: '📱 Los personajes en tu casa', boutonRegles: '📖 Cómo jugar', afficherMdp: 'mostrar la contraseña',
  pseudoPrefixe: 'Jardinero ', typesRecette: { entree: 'entrante', plat: 'plato principal', dessert: 'postre' }, typesRecetteArticle: { entree: 'un entrante', plat: 'un plato principal', dessert: 'un postre' }, recoltes: 'cosechas',
} satisfies DictionnairePartiel<Strings>;

const ANGLAIS: Strings = { ...STRINGS.en, ...EXTRA_EN };
const DICTIONNAIRES: Record<Lang, Strings> = {
  fr: completer(ANGLAIS, { ...STRINGS.fr, ...EXTRA_FR }),
  en: completer(ANGLAIS, ANGLAIS),
  es: completer(ANGLAIS, ESPAGNOL),
};
export function t(l: Lang = current): Strings { return DICTIONNAIRES[estLang(l) ? l : 'en']; }

/** Une quantité ES incomplète doit faire retomber toute la phrase sur l'anglais. */
export function quantiteESDisponible(g: GraineQuantite | undefined | null): boolean {
  const forme = g?.quantite_es;
  return !!g && texteNonVide(g.nom_es) && !!forme && texteNonVide(forme.singulier) && texteNonVide(forme.pluriel)
    && (forme.unite === undefined || forme.unite === 'ramita' || forme.unite === 'diente' || forme.unite === 'puñado');
}

export function quantite(n: number, g: GraineQuantite, l: Lang = current): string {
  if (l === 'es') {
    const forme = g.quantite_es;
    if (quantiteESDisponible(g) && forme) {
      const unite = forme.unite;
      if (unite === 'ramita' || unite === 'diente' || unite === 'puñado') return `${n} ${unite}${n === 1 ? '' : 's'} de ${forme.singulier}`;
      if (unite === undefined) return `${n} ${n === 1 ? forme.singulier : forme.pluriel}`;
    }
    l = 'en';
  }
  if (l !== 'fr') {
    const nom = texteNonVide(g.nom_en) ? g.nom_en.toLowerCase() : 'unknown plant';
    if (g.famille === 'herbe') return `${n} sprig${n > 1 ? 's' : ''} of ${nom}`;
    if (g.id === 'ail') return `${n} clove${n > 1 ? 's' : ''} of garlic`;
    if (g.id === 'epinard' || g.id === 'salade') return `${n} handful${n > 1 ? 's' : ''} of ${nom}`;
    if (n <= 1) return `1 ${nom}`;
    const w = nom.split(' '); const last = w.pop()!;
    const pl = /[^aeiou]y$/.test(last) ? last.slice(0, -1) + 'ies' : /(s|x|ch|sh|o)$/.test(last) ? last + 'es' : last + 's';
    return `${n} ${[...w, pl].join(' ')}`;
  }
  const nom = texteNonVide(g.nom_fr) ? g.nom_fr.toLowerCase() : texteChamp(g, 'nom', 'en', 'unknown plant').toLowerCase();
  const de = (x: string) => (/^[aeiouyéèêàh]/.test(x) ? 'd\u2019' : 'de ') + x;
  if (g.famille === 'herbe') return `${n} brin${n > 1 ? 's' : ''} ${de(nom)}`;
  if (g.id === 'ail') return `${n} gousse${n > 1 ? 's' : ''} d\u2019ail`;
  if (g.id === 'epinard' || g.id === 'salade') return `${n} poignée${n > 1 ? 's' : ''} ${de(nom)}`;
  if (n <= 1) return `1 ${nom}`;
  return `${n} ` + nom.split(' ').map(x => /[sxz]$/.test(x) ? x : /eau$/.test(x) ? x + 'x' : x + 's').join(' ');
}
/** Conjonction adaptée à la langue ; aucune modification des libellés FR/EN. */
export function liste(items: string[], l: Lang = current): string {
  if (items.length <= 1) return items.join('');
  const dernier = items[items.length - 1];
  const lien = l === 'es' ? (/^(?:i|hi(?![ea]))/i.test(dernier.trim()) ? ' e ' : ' y ') : l === 'fr' ? ' et ' : ' and ';
  return items.slice(0, -1).join(', ') + lien + dernier;
}
export function fmtTime(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}
