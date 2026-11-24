---
version: 1
slug: "frontend-src-app-tsx"
primary_target: "frontend/src/App.tsx"
related_targets: ["frontend/src/index.css"]
---

# Surface : l'app NoClim (shell et parcours)

**Mode** : Operate. Mobile d'abord (390 px), thème sombre par défaut (choisi par l'utilisateur).
**Audience** : collectionneurs francophones qui préparent un achat de spot ou un break ; breakers qui tarifent leurs spots.
**Tâche prioritaire** : préparer un achat ou un break — comparer collections, équipes et joueurs et savoir quel spot vaut le coup.
**Contraintes** : nom et logo NoClim conservés ; écrans d'admin hors périmètre visuel prioritaire ; chiffres vrais uniquement : pas de score ni d'indice synthétique, pas de mention HOT ni de flèches chaud/froid (refusés par l'utilisateur le 2026-11-24 : « ça veut rien dire »).

## Direction contract

THESIS : NoClim est le guide du break, lu comme une page de stats de journal : chaque spot avec ce qu'il contient vraiment (cartes, autos, memo, case hits), triable par colonne. Refuse le tableau de bord sombre à tuiles de KPI et accent néon, et refuse les scores synthétiques.

OWN-WORLD : encre chaude #15130F, papier #F1EADB, rouge #C8261F (accent unique : action principale, colonne triée, barres), filets #3A352C ; Libre Franklin seule, de 400 à 900, chiffres tabulaires ; tableaux denses à filets fins, en-têtes en petites capitales espacées, filet épais sous les en-têtes, colonne triée soulignée de rouge, masthead à filet papier épais.

STORY : le visiteur ouvre une collection, voit d'emblée quels spots ont le plus d'autos (ou de case hits, memo, cartes en touchant l'en-tête), déplie un spot pour ses chiffres face à la moyenne et les joueurs qui le portent, entoure ceux qu'il vise, puis ouvre l'équipe ou le joueur pour la preuve carte par carte.

FIRST VIEWPORT : barre du haut (NoClim, sélecteur de collection) ; masthead avec nom de la collection en 34 px noir 900 ; onglets Spots · Hits · Boîte · Checklist · Odds ; tableau des spots (rang, équipe, autos, memo, case ; cartes en plus sur grand écran) trié par autos, qui occupe l'écran ; barre d'onglets en bas.

FORM : Cote du mois (guide de cotes mensuel), mon candidat n°1, choisi comme IMPECCABLE’S PICK ; seed:4e676649ea24af9a.

FINISH : unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature : le tableau de stats à filet épais, la barre rouge à l'échelle exacte de la colonne triée, et la ligne choisie qui s'inverse (papier sur encre).
