# Checklists prêtes à importer

Checklists générées hors de l'app, au format attendu par `POST /api/upload` :
un classeur Excel avec un onglet **`Teams_clean`** et quatre colonnes
`Player` / `Team` / `Card Type` / `Numbering`.

Le dossier porte le `sport_key` à utiliser à l'upload — c'est le seul endroit où
cette information existe, les fichiers ne la contiennent pas.

```
data/checklists/
├── nba/         -> sport_key=nba
├── nfl/         -> sport_key=nfl
└── multisport/  -> sport_key=multisport
```

## Comment les importer

**Passer par l'API, jamais par un dépôt direct sur R2.** Les checklists ne vivent
pas en Excel sur R2 : `POST /api/upload` parse le classeur, normalise les équipes
via les `team_aliases` du profil sport, dérive Year / Product / checklist_id,
écrit `parquet/{sport}/{nom}.parquet` **et fusionne dans
`parquet_master/{sport}.parquet`** — le seul fichier que l'app lit ensuite.
Un Excel déposé à la main sur R2 n'apparaîtra jamais dans l'app.

```bash
API=https://checklist-api.cardvaults.app

for sport in nba nfl multisport; do
  for f in data/checklists/$sport/*.xlsx; do
    echo "== $f ($sport)"
    curl -fsS -X POST "$API/api/upload" \
      -F "file=@$f" \
      -F "sport_key=$sport" \
      -F "overwrite=true"
    echo
  done
done
```

**Séquentiellement, jamais en parallèle.** La fusion du master est un
read-modify-write d'un unique fichier parquet : deux uploads simultanés sur le
même sport en écrasent un.

`overwrite=true` est nécessaire pour réimporter une checklist déjà présente ;
sans lui l'API répond 409.

## Provenance et partis pris

Les six sets basket et le SP Authentic viennent de
[Trading Card Database](https://www.tcdb.com). Les deux Wild Card viennent des
pages de checklist officielles de `wildcardinc.com`.

- **Cartes checklist exclues.** Ce ne sont pas des cartes de joueur et elles
  créeraient de faux joueurs (« Checklist: 337-381 ») dans l'analyse de break.
- **Inserts, autographes et parallèles inclus.** Sur TCDB ce sont des sets
  distincts du set de base, pas des lignes de son checklist : il faut les scraper
  séparément. Le nom du set porte le type dans `Card Type` (`Player's Ink Green`,
  `Thunder and Lightning`, `Trademark Move Autographs`…), ce qui les rend
  filtrables. Attention, TCDB range sous « Inserts and Related Sets » à la fois
  les vrais inserts de paquet et des produits séparés : panneaux de programme,
  Collect-A-Books, Announcers, Prototypes, redemptions. Sur les sets d'avant
  1993 c'est surtout de l'oddball sans intérêt pour un break ; à partir de
  1993-94 ce sont de vrais inserts.
- **Séries marquées dans `Card Type`** quand TCDB les documente, sous la forme
  `Series 1 - Base` / `Series 2 - DPK RC`. Bornes reprises des notes TCDB :
  1990-91 Hoops `#1-336` / `#337-440`, 1991-92 Hoops `#1-330` / `#331-590`,
  1993-94 Topps `#1-198` / `#199-396`. 1994 SkyBox USA est en une seule série.
  SkyBox 91-92, SkyBox Premium 93-94 et SP Authentic 99 n'ont aucune note de
  série sur TCDB : aucune n'a été inventée.
- **Codes de sous-set laissés verbatim** (RS, SC, DPK, SM, INTL, ROO, BG, UPD…)
  quand leur sens n'était pas certain. Un code brut vaut mieux qu'un libellé faux.
- **Deux mots renommés** dans les fichiers Wild Card, parce que le détecteur
  auto/mem de l'app teste ses mots-clés en sous-chaîne :
  la scène `Patch` (pumpkin patch) déclenchait le mot-clé memorabilia `patch`,
  et la couleur `Pink` contient `ink`, mot-clé d'autographe. Écrits `Pumpkin` et
  `Rose`. Les 64 composants de libellé ont été balayés contre les listes de
  `sports_config` : ce sont les deux seules collisions.

### Faux positif connu : `Center Stage`

Les 10 cartes de l'insert `Center Stage` (SkyBox Premium 93-94) sortent en
memorabilia. `Stage` contient la sous-chaîne `tag`, mot-clé memorabilia, et le
détecteur teste en sous-chaîne sans frontière de mot. Le nom du set n'a pas été
modifié : contrairement à `Patch` et `Pink`, aucune écriture fidèle de
« Center Stage » n'évite la collision.

C'est le même défaut qui frappait `Patch`, `Pink` et qui frappera tout parallèle
nommé `Pink`, tout insert contenant `Stage`, `Prime`, `Sole` ou `Mem`. Le
correctif n'est pas dans les données mais dans `classify_hit_type` : il faut
comparer sur frontières de mot plutôt qu'en sous-chaîne. Les overrides de l'app
ne peuvent pas compenser, ils forcent un type **dans** une catégorie, jamais
hors.
- **`Team` vide sur les deux Wild Card.** Les pages officielles de ces produits
  multi-sport ne portent aucune équipe. L'analyse par joueur fonctionne,
  l'analyse par équipe non.
- **Cartes multi-joueurs** écrites `Messi/Mbappe`, le format que
  `split_slash_values` découpe déjà : elles comptent pour les deux joueurs.

## À savoir sur le contenu

Sur le **2026 Haunted Hits Hobby Jumbo**, les 85 joueurs ont tous exactement la
même allocation — 92 autographes et 266 base, écart-type nul. Tous les spots d'un
break sont donc mathématiquement équivalents, le choix se fait uniquement sur la
côte du joueur. Le Matte Metal Graffiti, lui, différencie fortement (de 4 à 109
autographes selon le joueur) grâce à ses rosters restreints et ses cartes duales.
