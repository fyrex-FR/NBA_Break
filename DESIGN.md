---
name: NoClim
description: Le guide du break, lu comme une page de stats de journal.
colors:
  accent-red: "#C8261F"
  accent-red-hover: "#D9322A"
  accent-fg: "#F7F1E4"
  ink: "#15130F"
  ink-panel: "#1A1814"
  ink-elevated: "#1E1B17"
  ink-surface: "#211E19"
  ink-hover: "#2A2620"
  paper: "#F1EADB"
  paper-secondary: "#D6CDBA"
  paper-tertiary: "#ADA390"
  paper-quaternary: "#958C7B"
  rule-subtle: "#2A2620"
  rule: "#3A352C"
  rule-strong: "#4D473C"
  rule-heavy: "#F1EADB"
  cat-logoman: "#F0607A"
  cat-case: "#E8B04A"
  cat-auto: "#6FA9E8"
  cat-mem: "#45C2A6"
  cat-automem: "#A69CEE"
  cat-base: "#958C7B"
  success: "#5CC28A"
  warning: "#E8B04A"
  danger: "#EB4034"
  light-paper: "#EFEAE0"
  light-panel: "#F6F2E9"
  light-surface: "#E7E1D4"
  light-ink-text: "#15130F"
  light-rule: "#C9C0AE"
  light-accent-red: "#B51F18"
typography:
  display:
    fontFamily: "Libre Franklin, -apple-system, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 900
    lineHeight: "36px"
    letterSpacing: "-0.022em"
  headline:
    fontFamily: "Libre Franklin, -apple-system, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 900
    lineHeight: "24px"
    letterSpacing: "-0.022em"
  title:
    fontFamily: "Libre Franklin, -apple-system, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "20px"
  body:
    fontFamily: "Libre Franklin, -apple-system, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "24px"
  body-ui:
    fontFamily: "Libre Franklin, -apple-system, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
  stat:
    fontFamily: "Libre Franklin, -apple-system, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    letterSpacing: "-0.005em"
    fontFeature: "\"tnum\""
  label:
    fontFamily: "Libre Franklin, -apple-system, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: "16px"
    letterSpacing: "0.1em"
rounded:
  sm: "2px"
  md: "3px"
  lg: "4px"
  2xl: "5px"
  3xl: "6px"
spacing:
  xs: "4px"
  sm: "8px"
  row: "10px"
  md: "12px"
  gutter: "16px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent-red}"
    textColor: "{colors.accent-fg}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.accent-red-hover}"
  button-secondary:
    backgroundColor: "{colors.ink-surface}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.ink-hover}"
  chip:
    backgroundColor: "{colors.ink-surface}"
    textColor: "{colors.paper-secondary}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "28px"
  chip-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  segment-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "26px"
  input:
    backgroundColor: "{colors.ink-surface}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "34px"
  tab:
    textColor: "{colors.paper-tertiary}"
    padding: "0 10px"
    height: "42px"
  tab-selected:
    textColor: "{colors.paper}"
  spots-row-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
---

# Design System: NoClim

## Overview

**Creative North Star : « La Cote du mois »**

NoClim se lit comme la page de stats d'un guide de cotes mensuel : de l'encre chaude, du papier, des filets, des colonnes de chiffres alignés, et un seul rouge d'imprimeur pour dire où regarder. Chaque spot (équipe, joueur) est présenté par ce qu'il contient vraiment, en comptes bruts, et se trie en touchant l'en-tête de colonne. La densité est celle d'un tableau de journal : beaucoup de lignes, peu d'ornement, une hiérarchie portée par la graisse et les filets plutôt que par des boîtes ou des couleurs.

Le thème sombre (encre) est le thème par défaut, par choix de l'utilisateur ; un thème clair « papier journal » existe et ne change que les valeurs des tokens, jamais la structure. Le téléphone en plein live (390 px) est la cible de conception ; le desktop élargit le même tableau (colonne Cartes en plus) sans le recomposer.

Rejets confirmés : le tableau de bord sombre à tuiles de KPI et accent néon ; tout score ou indice synthétique, toute mention HOT, toute flèche chaud/froid (refusés par l'utilisateur le 2026-11-24 : « ça veut rien dire »).

**Key Characteristics:**
- Encre chaude et papier, un seul accent rouge.
- Une seule famille, Libre Franklin, de 400 à 900, chiffres tabulaires.
- Tableaux denses à filets fins, filet épais (2 px) sous les en-têtes et autour du masthead.
- La sélection s'inverse : papier sur encre.
- Coins presque carrés (2 à 6 px), aucune ombre portée sur les surfaces au repos.
- Uniquement des chiffres vrais et des comparaisons simples (rang, moyenne).

## Colors

Une palette d'imprimerie : encre chaude, papier crème, filets bruns, un rouge unique ; les couleurs de catégories sont un codage de données, pas une palette.

### Primary
- **Rouge d'imprimeur** (accent-red ; light-accent-red en thème clair) : l'unique accent. Action principale (bouton « Voir la fiche »), soulignement de la colonne triée, barres d'échelle des spots, filet sous l'onglet actif, destination active de la barre du bas, filet de progression, anneau de focus (à 45 %), date de sortie à venir. Survol : accent-red-hover. Texte posé dessus : accent-fg.

### Neutral
- **Encre** (ink) : fond de page. **Encre panneau / élevée / surface / survol** (ink-panel, ink-elevated, ink-surface, ink-hover) : marches tonales du plus profond au plus élevé ; surface pour les champs, chips et boutons secondaires ; survol pour l'état hover et l'élément de navigation courant.
- **Papier** (paper) : texte principal, et fond de toute sélection inversée. **Papier secondaire / tertiaire / quaternaire** : texte courant atténué, métadonnées et en-têtes de colonne, placeholders et compteurs.
- **Filets** (rule-subtle, rule, rule-strong) : séparateurs de lignes de tableau (rule), lignes du détail (rule-subtle), bordures au survol (rule-strong).
- **Filet épais** (rule-heavy) : vaut la couleur du texte principal (papier en sombre, encre en clair). Sert au filet de 2 px sous les en-têtes de tableau, sous la barre du haut, au-dessus de la barre d'onglets mobile et sous le détail déplié.
- **Thème clair « papier journal »** (light-paper, light-panel, light-surface, light-ink-text, light-rule) : même rôles, valeurs inversées ; toute nouvelle couleur doit exister dans les deux thèmes.

### Codage de données
- **Catégories de cartes** (cat-logoman, cat-case, cat-auto, cat-mem, cat-automem, cat-base) : codent le type de carte (Logoman, case hit, auto, memo, auto/memo, base) dans les répartitions et étiquettes de cartes. Chaque thème a ses propres valeurs.
- **États** (success, warning, danger) : messages de réussite, d'avertissement et d'erreur, et la pastille « en direct » d'un break.

### Named Rules
**La règle du Rouge Unique.** Le rouge est le seul accent. Il marque l'action, la colonne triée, l'échelle et l'endroit où l'on se trouve ; rien d'autre ne le porte, et aucune deuxième couleur d'accent n'est introduite.

**La règle des Catégories-Données.** Les couleurs `cat-*` ne codent que le type de carte. Jamais en décoration, jamais en accent, jamais pour classer ou « chauffer » un spot.

## Typography

**Display Font:** Libre Franklin (repli -apple-system, system-ui, sans-serif)
**Body Font:** Libre Franklin
**Label/Mono Font:** Libre Franklin en petites capitales espacées ; les chiffres en `tnum`

**Character :** une grotesque de journal, très noire et serrée pour les titres, nette et tabulaire pour les colonnes. Une seule famille ; la hiérarchie vient de la graisse (400 à 900), de la taille et de la casse.

### Hierarchy
- **Display** (900, 34 px / 36 px sur desktop, 32 / 34 px sur mobile, -0.022em) : nom de la collection dans le masthead, deux lignes maximum.
- **Headline** (900, 20 px / 24 px) : titres de rubrique de l'accueil.
- **Title** (600, 15 px) : nom d'un spot dans une ligne de tableau, tronqué sur une ligne.
- **Body** (400, 15 px / 24 px) : phrase de détail d'un spot (« 3e sur 30 équipes en autos »). Body UI (500, 13 px) pour boutons, champs, menus.
- **Stat** (700, 14 px, chiffres tabulaires) : toutes les valeurs chiffrées de colonne. La colonne triée passe en 800 ; dans le détail, une valeur au-dessus de la moyenne passe en 800, sinon 500.
- **Label** (700, 12 px / 16 px, 0.1em, capitales) : en-têtes de colonnes de tableau et intitulés de groupes de listes (menus, palette, presets).

### Named Rules
**La règle des Colonnes Tabulaires.** Tout chiffre qui se compare à un autre est en chiffres tabulaires et aligné à droite.

**La règle du Plancher de 12 px.** Aucun texte lisible sous 12 px sur mobile.

## Layout

Mobile d'abord, à 390 px : gouttière latérale de 16 px, aucun débordement horizontal (vérifié à 390 et 1440 px : largeur de défilement égale au viewport). Le premier écran d'une collection empile la barre du haut (56 px + safe area, filet épais dessous), le masthead (vignette de boîte 72 px, nom en display, ligne de métadonnées et ligne Hobby), la rangée d'onglets (Spots · Hits · Boîte · Checklist · Odds, les autres sous « Plus »), puis le tableau des spots qui occupe l'écran ; sur mobile, une barre de trois entrées est fixée en bas (Collections, Break, Chercher). Les fiches équipe et joueur sont des pages de la collection : on y arrive depuis Spots, la recherche ou un lien, l'onglet Spots reste actif et un lien « ← Spots » ramène au tableau (le choix équipe/joueur est conservé). Sans collection ouverte, les onglets proposent Catalogue · Par équipe · Qui a signé ?, qui cherchent dans tout le catalogue.

Rythme : lignes de tableau à 10 px de padding vertical, gaps de 8 et 12 px entre contrôles, 16 à 20 px entre blocs. Sur desktop (≥ 768 px) un rail de navigation remplace la barre du bas, les onglets passent à 38 px / 13 px, et le tableau gagne la colonne Cartes (≥ 640 px).

**La règle de la Cible de 44 px.** Sur pointeur grossier, toute cible tactile principale fait au moins 44 px (boutons, chips, en-têtes de colonne triables, icônes) ; les champs montent à 40 px, les selects à 36 px.

## Elevation & Depth

Le système est plat : un guide imprimé se lit à plat. Les surfaces au repos n'ont pas d'ombre portée ; une carte se détache par un filet d'un pixel (`--shadow-card`, un contour de la couleur `rule`) et par la marche tonale de l'encre. La profondeur vient des filets et de l'inversion, pas de la lumière.

### Shadow Vocabulary
- **Contour de carte** (`box-shadow: 0 0 0 1px var(--border-standard)`) : cartes, vignettes de boîte.
- **Surgissement** (`box-shadow: 0 0 0 1px #4D473C, 0 18px 40px rgba(0,0,0,0.55)`) : popovers et menus flottants uniquement.

### Named Rules
**La règle du Papier à Plat.** Aucune ombre au repos. Seul ce qui flotte au-dessus de la page (popover, menu) a une ombre. Les deux barres collantes (haut et bas mobile) sont de l'encre translucide floutée pour laisser passer le défilement ; aucune autre surface n'utilise de verre.

## Shapes

Coins presque carrés : 2 px pour boutons, chips, champs, segments ; 3 à 4 px pour les menus ; 5 à 6 px pour les vignettes de boîte. Pas de pilule. Seule exception, le cercle autour d'un rang « entouré » : c'est le geste du stylo sur la page imprimée, pas une forme d'interface. Les filets structurent tout : 1 px entre les lignes, 2 px sous les en-têtes et autour du masthead, 3 px pour le filet rouge sous l'onglet actif.

## Components

### Buttons
- **Shape :** coins à 2 px, hauteur 32 px (26 px petit, 40 px grand), 44 px minimum sur pointeur grossier.
- **Primary :** fond rouge, texte accent-fg, 600. Réservé à l'action principale d'un écran ou d'un détail.
- **Hover / Focus :** survol vers accent-red-hover (seulement sur appareils à survol) ; focus clavier par anneau rouge à 45 % de 2 px, décalé de 2 px.
- **Secondary :** encre surface, filet `rule`, texte papier ; survol vers ink-hover et rule-strong. **Ghost :** transparent, texte atténué, survol ink-hover.

### Chips
- **Style :** encre surface, filet `rule`, 12 px / 500, 28 px de haut (44 px tactile).
- **State :** actif = inversion franche, fond papier, texte encre, 700.

### Segmented control
- **Style :** piste encre surface à filet subtil ; options à 26 px (38 px tactile), compteur tabulaire en quaternaire.
- **State :** option pressée = papier sur encre, 700.

### Inputs / Fields
- **Style :** encre surface, filet `rule`, coins 2 px, 34 px (40 px tactile), placeholder quaternaire.
- **Focus :** filet rouge à 45 % et halo rouge à 14 % de 3 px.

### Navigation
- **Onglets de destination :** texte tertiaire 14 px / 500, 42 px de haut ; l'onglet choisi passe en papier 800 avec un filet rouge de 3 px dessous. La rangée défile horizontalement et s'estompe en fondu sur 28 px à droite.
- **Barre du bas (mobile) :** trois entrées (Collections, Break, Chercher), filet épais au-dessus, entrée active en rouge.
- **Rail (desktop) :** élément courant sur fond ink-hover, 600.

### Tableau des spots (signature)
Onglet d'entrée d'une collection. Rang, équipe ou joueur, puis Autos, Memo, Case (Cartes en plus à partir de 640 px), trié par autos par défaut.
- **En-tête :** label en petites capitales, filet épais de 2 px dessous. Chaque colonne chiffrée est un bouton de tri (44 px de haut) ; la colonne triée passe en papier, soulignée de rouge (2 px, décalage 4 px).
- **Ligne :** filet `rule` dessous, rang tabulaire 13 px en tertiaire, nom en title, chiffres en stat (colonne triée en 800).
- **Barre d'échelle :** sous le nom, une barre rouge de 3 px dont la longueur est à l'échelle exacte de la valeur de la colonne triée (proportion du maximum, 1 % minimum).
- **Sélection :** toucher une ligne l'inverse (fond papier, texte encre) et déplie sous elle le détail : rang sur le total (« 3e sur 30 équipes en autos »), joueurs qui portent l'équipe, un petit tableau Ligne / spot / Moyenne, puis « Voir la fiche » (primaire) et « Entourer » (secondaire). Le détail se ferme sur un filet épais.
- **Entourer :** un spot entouré porte un cercle rouge de 1,5 px autour de son rang ; la chip « Entourés » filtre sur eux.

## Do's and Don'ts

### Do:
- **Do** montrer des comptes réels (cartes, autos, memo, case hits, odds) et des comparaisons simples : rang, moyenne.
- **Do** inverser papier sur encre pour toute sélection (ligne, chip, segment).
- **Do** mettre un filet de 2 px de la couleur du texte sous chaque en-tête de tableau.
- **Do** dessiner les barres à l'échelle exacte de la valeur qu'elles représentent.
- **Do** définir toute nouvelle couleur dans les deux thèmes, sombre par défaut.
- **Do** tenir 44 px de cible sur pointeur grossier et 12 px de texte minimum sur mobile.

### Don't:
- **Don't** introduire de score, d'indice ou de note synthétique, de mention HOT, ni de flèche chaud/froid.
- **Don't** utiliser les couleurs `cat-*` hors du codage du type de carte.
- **Don't** ajouter une deuxième couleur d'accent, un dégradé ou un accent néon.
- **Don't** composer en tuiles de KPI : les chiffres vivent dans des colonnes.
- **Don't** poser d'ombre portée sur une surface au repos, ni de coins au-delà de 6 px.
- **Don't** introduire une deuxième famille de caractères.
