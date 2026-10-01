# Jardin de Poche — projet du jeu (livraison 1)

Un cadeau pour ceux qui n'ont pas de jardin. Three.js + Vite + TypeScript, bilingue FR/EN.

## 1. Mettre tes fichiers

Depuis `Bureau\jardin-cadeaux` :

- copie **tout le contenu de `models\`** (les .glb et index.json) dans `public\models\`
- copie **tout le contenu de `fonds\`** (les .png) dans `public\fonds\`

## 2. Lancer sur ton PC

Il faut Node.js (version LTS, nodejs.org). Puis, dans une invite de commandes ouverte dans ce dossier :

```
npm install
npm run dev
```

Ouvre l'adresse affichée (http://localhost:5173). Pour l'essayer sur ton téléphone, même wifi :

```
npm run dev -- --host
```

et ouvre l'adresse « Network » affichée, sur le téléphone.

## 3. Mettre en ligne

Le dossier sur GitHub (sans `node_modules`), puis Vercel > Import project > le dépôt. Vercel détecte Vite tout seul. L'URL est publique dès le premier déploiement.

## 4. Astuces de démo

- `?fast=5` à la fin de l'adresse : la pousse va 5 fois plus vite (`?fast=20` pour la vidéo)
- `?night=1` : force la nuit
- Réglages (⚙️) : langue, jour/nuit, effacer la partie

## 5. Où modifier quoi

- `public/data/catalog.json` : plantes, prix, temps de pousse, objets de la boutique, kit de départ, personnages (sans toucher au code)
- `src/i18n.ts` : tous les textes, en français et en anglais
- `src/world.ts` : les positions du balcon, des pots, de la caméra, des fonds
- `src/game.ts` : les règles du jeu ; `src/plants.ts` : la pousse et la soif ; `src/state.ts` : l'état et la sauvegarde

## Ce que contient cette livraison

Balcon assemblé avec le toit verrouillé, fonds de la vue du personnage avec jour/nuit, choix du personnage (Léa, Marcel, Jimy) et de la langue, semis / arrosage / récolte avec les vrais stades et la soif, panier, téléphone (vendre, acheter graines, pots, décos, améliorations, toit), vie autonome de base (s'asseoir, regarder les plantes, arroser si tu laisses faire, dormir la nuit), sauvegarde locale avec pousse hors ligne et résumé au retour, score et valeur du balcon.

À venir : Supabase et classement, montée du toit animée, sons, particules, masque de couleurs des vêtements.
