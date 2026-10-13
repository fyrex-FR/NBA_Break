# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Application web pensée d'abord pour le téléphone, installable comme PWA (écran d'accueil iPhone/Android). Le desktop reste pleinement supporté.

## Users

Trois publics, tous dans une **communauté fermée** et francophone :

- **Acheteurs de spots** : collectionneurs qui achètent des spots dans des breaks de cartes en live (Voggt surtout). Avant de payer, ils veulent savoir si le spot (une équipe, un joueur, une lettre) concentre les cartes qui comptent ou s'il va les « climatiser ». Souvent sur téléphone, en plein show, avec peu de temps pour décider.
- **Breakers / organisateurs** : ceux qui montent les breaks. Ils préparent la grille de spots, répartissent et tarifent selon la valeur réelle du contenu, et présentent ce contenu à leur audience.
- **Le propriétaire et son cercle** : l'outil sert d'abord au porteur du projet et à ses proches. C'est aussi lui qui l'administre (import de checklists, corrections de détection, mapping des odds).

## Product Purpose

NoClim croise une ou plusieurs checklists de cartes (Topps, Panini, Bowman…) pour montrer, joueur par joueur et équipe par équipe, qui concentre les hits : autos, memorabilia, Logoman, case hits, rookies. Il en tire la valeur relative de chaque spot d'un break.

Le succès compte **dans les trois sens à la fois**, selon le profil :
- l'acheteur évite les mauvais spots (il ne se fait plus « climatiser ») ;
- il décide vite en live, sur son téléphone, quel spot encore disponible vaut son prix ;
- le breaker fixe des prix justes pour ses spots.

## Positioning

Le mécanisme propre à NoClim : partir des **checklists réelles** (et des feuilles d'odds Topps quand elles existent), les agréger par joueur, équipe ou lettre selon la méthode de break, et **relier ce contenu aux spots d'un break Voggt réel** (prix, vendu ou dispo). C'est un outil d'aide à la décision sur un break précis, pas un site de cotes ni un catalogue généraliste.

## Operating Context

- Usage typique : un show Voggt est en cours. On colle l'URL du show, NoClim reconnaît les produits, sélectionne les checklists et affiche pour chaque spot son contenu et son prix.
- Usage de préparation : choisir des checklists (seules ou en presets enregistrés), lancer l'analyse, explorer les classements, les fiches joueur et équipe, puis simuler un break (par équipe, par joueur, par lettre, par lettre du nom de famille, ou par lettres assignées à la main).
- Sports couverts : NBA en priorité, plus NFL, football, tennis, WWE, MMA, Disney et Marvel. Chaque sport a ses checklists et ses règles.
- Partage : un lien d'URL reproduit la sélection, la vue et la fiche ouverte.
- Un sondage communautaire « DBTK · Pick Your Player » vit sur une route dédiée (`/sondagedbtk`), avec son propre habillage.

## Capabilities and Constraints

Capacités confirmées :
- Catalogue de checklists par sport, par saison ; presets ; ajout par fichier Excel ou import assisté par IA (Gemini) depuis du texte ou un fichier.
- Analyse : volumes, répartition des catégories (Logoman, case hit, auto, memo, auto/memo, base), classements joueurs et équipes, multi-joueurs, rookies, tendances par saison, analyse par fichier, comparateur de joueurs.
- Fiches joueur et équipe, avec photo et stats de carrière NBA via `nba_api`. `stats.nba.com` bloque les IP cloud : les appels passent par un relais à IP résidentielle, avec des replis (cache périmé, puis photo + identité seulement).
- Simulation de break par spot (score, hits, case hits, part du break), pondération par hits garantis par box et par feuilles d'odds Topps (configurations Hobby, Jumbo…).
- Mode break Voggt : import d'un show, reconnaissance des produits, état des spots (prix, vendu ou dispo).
- Assistant conversationnel sur la sélection.
- Outils d'administration : détection auto/memo/case hit par type de carte, mapping des odds, attribution Marvel, suppression de checklist protégée par un token admin.

Contraintes :
- Interface entièrement en français, tutoiement.
- **Accès en communauté fermée confirmé, mais pas encore appliqué techniquement** : il n'y a ni compte ni authentification aujourd'hui, l'URL est publique. La façon de fermer l'accès reste à décider.
- Les données de prix réels des cartes (marché secondaire) ne sont pas intégrées ; la valeur affichée est relative (contenu, scores, odds), pas en euros, sauf les prix des spots Voggt.

## Brand Commitments

- Nom : **NoClim**. Jeu de mots sur « se faire climatiser » : tomber sur un spot froid, un mauvais break.
- Slogan : **« Ne te fais plus climatiser. »**
- Voix : humour de collectionneur et clins d'œil (la « base de 2012 », prendre la « température » d'un spot), sans jamais travestir les chiffres.
- Logo : la jauge froid → chaud. Fichiers dans `frontend/public/brand/` (`noclim-icon.svg`, `noclim-icon-square.svg`, `noclim-mark.svg`, `noclim-mark-mono.svg`).

## Evidence on Hand

- Données réelles : checklists par sport sur Cloudflare R2, feuilles d'odds Topps pour certains produits, shows Voggt réels. Exemple d'analyse utilisée dans la démo de l'accueil : NBA 2025-26, Topps Chrome Update + Topps Bowman (2 749 cartes, 479 joueurs, 82 équipes, 1 298 hits premium).
- Guide utilisateur existant : `frontend/public/guide.html` et `NoClim_Guide.pdf`.
- **Absences à ne pas combler par de l'invention** : aucun témoignage, aucun chiffre d'utilisateurs, aucune presse, aucun prix de revente.
- Images de cartes : ne jamais utiliser de visuels officiels Topps ou Panini. Une photo d'une carte personnelle du propriétaire pourra être fournie (emplacement prévu : `frontend/public/hero-card.webp`), elle n'existe pas encore.

## Product Principles

1. **Décider avant de payer.** Chaque écran doit aider à répondre à « ce spot vaut-il le coup ? », pour l'acheteur comme pour le breaker.
2. **Le téléphone, en plein live, d'abord.** Si une information ne se lit pas en quelques secondes sur un écran de téléphone, elle n'est pas finie.
3. **Des chiffres vrais, jamais inventés.** Tout vient des checklists, des odds ou de Voggt. Une donnée partielle ou ancienne est signalée comme telle.
4. **Le ton chambre, l'outil ne ment pas.** L'humour est dans la voix, jamais dans les données.
5. **Servir les deux côtés du break.** L'outil aide l'acheteur et le breaker sans pencher pour l'un contre l'autre.
