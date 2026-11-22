"""Type de carte lu dans les SECTIONS de la source (PDF/XLS éditeur), source de vérité avant les mots-clés.

Les checklists éditeur (Topps surtout) rangent chaque set sous un en-tête de catégorie : BASE, INSERT, AUTOGRAPH,
RELIC (memorabilia)... On enregistre ce type par carte dans la colonne `Section` du master. Quand elle est
renseignée, elle décide du Hit Type / de la catégorie (voir `apply_section_kinds`), les mots-clés ne servent plus
qu'aux checklists sans section."""
import re

KIND_BASE = "base"
KIND_INSERT = "insert"
KIND_AUTO = "auto"
KIND_MEM = "mem"
KIND_AUTO_MEM = "auto_mem"
VALID_KINDS = (KIND_BASE, KIND_INSERT, KIND_AUTO, KIND_MEM, KIND_AUTO_MEM)

# Section (kind) -> Hit Type de l'app. base et insert ne sont ni auto ni mem.
SECTION_HIT_TYPE = {
    KIND_BASE: "none",
    KIND_INSERT: "none",
    KIND_AUTO: "auto",
    KIND_MEM: "mem",
    KIND_AUTO_MEM: "auto_mem",
}

# En-têtes de catégorie (en MAJUSCULES dans les PDF Topps) : ils changent le type courant, ce ne sont pas des sets.
_MARKERS = {
    "BASE CARDS": KIND_BASE,
    "INSERT": KIND_INSERT,
    "INSERTS": KIND_INSERT,
    "AUTOGRAPH": KIND_AUTO,
    "AUTOGRAPHS": KIND_AUTO,
    "RELIC": KIND_MEM,
    "RELICS": KIND_MEM,
    "MEMORABILIA": KIND_MEM,
    "AUTOGRAPH RELIC": KIND_AUTO_MEM,
    "AUTOGRAPH RELICS": KIND_AUTO_MEM,
    "AUTOGRAPHED RELIC": KIND_AUTO_MEM,
    "AUTOGRAPHED RELICS": KIND_AUTO_MEM,
    "AUTO RELIC": KIND_AUTO_MEM,
}


def marker_kind(line):
    """Le type si `line` est un en-tête de catégorie (INSERT, AUTOGRAPH...), sinon None."""
    return _MARKERS.get(re.sub(r"\s+", " ", str(line or "").strip().upper()))


def assign_sections(entries):
    """entries : [(section_title, ...)] dans l'ordre du document, avec des marqueurs {'marker': 'INSERT'} intercalés.
    Retourne la liste des types par entrée (marqueurs exclus). Le type courant démarre à `base`."""
    kind = KIND_BASE
    out = []
    for e in entries:
        if isinstance(e, dict) and "marker" in e:
            kind = marker_kind(e["marker"]) or kind
            continue
        out.append(kind)
    return out


def apply_section_kinds(df, mask, hit_type_none, category_from_hit_type, protected_categories):
    """Applique la colonne `Section` (si elle existe) sur les lignes de `mask`.
    Hit Type = celui du type de section ; Category = celle du Hit Type, sauf Logoman et Case Hit
    (une rareté, pas un type : elle reste décidée par les règles)."""
    if "Section" not in df.columns:
        return 0
    section = df.loc[mask, "Section"].fillna("").astype(str).str.strip().str.lower()
    changed = 0
    for kind, hit_type in SECTION_HIT_TYPE.items():
        idx = section.index[section == kind]
        if not len(idx):
            continue
        df.loc[idx, "Hit Type"] = hit_type
        regular = idx[~df.loc[idx, "Category"].isin(protected_categories)]
        df.loc[regular, "Category"] = category_from_hit_type(hit_type)
        changed += len(idx)
    return changed
