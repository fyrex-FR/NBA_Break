import streamlit as st
import pandas as pd
import os
import glob
import plotly.express as px
import re
import json
import importlib
from card_logic import (
    CATEGORY_AUTO_MEM,
    CATEGORY_CASE_HIT,
    CATEGORY_FILTER_OPTIONS,
    CATEGORY_LOGOMAN,
    build_hype_map,
    calculate_score,
    categorize_card,
    get_hype_multiplier,
    normalize_team_name,
    parse_numbering,
    rarity_multiplier,
)
import sports_config as sports_config_module

sports_config_module = importlib.reload(sports_config_module)
DEFAULT_SPORT_KEY = sports_config_module.DEFAULT_SPORT_KEY
detect_sport_from_filename = sports_config_module.detect_sport_from_filename
get_sport_labels = sports_config_module.get_sport_labels
get_sport_profile = sports_config_module.get_sport_profile
sport_key_from_label = sports_config_module.sport_key_from_label

def extract_year(filename, sport_key=DEFAULT_SPORT_KEY):
    base_name = os.path.basename(filename)

    # NFL products are seasoned on a single year (e.g. 2024).
    if sport_key == "nfl":
        match = re.search(r"((?:19|20)\d{2})", base_name)
        return match.group(1) if match else "Inconnue"

    # Default behavior for basketball-like seasons (e.g. 2024-25).
    season_match = re.search(r"((?:19|20)\d{2}-\d{2})", base_name)
    if season_match:
        return season_match.group(1)

    # Fallback to simple year for other sports/files.
    year_match = re.search(r"((?:19|20)\d{2})", base_name)
    return year_match.group(1) if year_match else "Inconnue"

def extract_product(filename):
    name = os.path.splitext(filename)[0]
    name = re.sub(r"\d{4}-\d{2}", "", name)
    name = re.sub(r"checklist", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s+", " ", name)
    return name.strip(" -_")


def split_slash_values(value):
    text = "" if value is None else str(value)
    return [p.strip() for p in text.split("/") if p and p.strip() and p.strip().lower() != "nan"]


def dedupe_multiplayer_projection_rows(df):
    """
    Collapse repeated multi-player rows where the same card is listed once per team.
    Example: A/B card appearing as Team=A then Team=B should count once globally.
    """
    if df.empty or "Player" not in df.columns or "Team" not in df.columns:
        return df, 0

    work = df.copy()
    work["_player_parts"] = work["Player"].apply(split_slash_values)
    work["_player_count"] = work["_player_parts"].apply(len)
    multi_mask = work["_player_count"] > 1
    if not multi_mask.any():
        return df, 0

    work["_player_canon"] = work["_player_parts"].apply(lambda parts: "/".join(sorted(dict.fromkeys(parts))))
    work["_box_type_key"] = work["Box Type"].astype(str) if "Box Type" in work.columns else ""
    work["_numbering_key"] = work["Numbering"].astype(str) if "Numbering" in work.columns else ""
    work["_file_key"] = work["File"].astype(str) if "File" in work.columns else ""
    work["_dedupe_key"] = (
        work["_file_key"]
        + "||"
        + work["_box_type_key"]
        + "||"
        + work["_numbering_key"]
        + "||"
        + work["_player_canon"]
    )

    key_counts = work.loc[multi_mask, "_dedupe_key"].value_counts()
    duplicated_keys = set(key_counts[key_counts > 1].index.tolist())
    if not duplicated_keys:
        return df, 0

    duplicated_rows = work[multi_mask & work["_dedupe_key"].isin(duplicated_keys)].copy()
    keep_rows = work[~(multi_mask & work["_dedupe_key"].isin(duplicated_keys))].copy()

    def build_team_union(group):
        teams = []
        for raw_team in group["Team"].tolist():
            teams.extend(split_slash_values(raw_team))
        ordered_unique = []
        for t in teams:
            if t not in ordered_unique:
                ordered_unique.append(t)
        return "/".join(ordered_unique)

    team_map = duplicated_rows.groupby("_dedupe_key").apply(build_team_union).to_dict()
    collapsed_rows = duplicated_rows.drop_duplicates(subset=["_dedupe_key"]).copy()
    collapsed_rows["Team"] = collapsed_rows["_dedupe_key"].map(team_map).fillna(collapsed_rows["Team"])

    result = pd.concat([keep_rows, collapsed_rows], ignore_index=True)
    rows_removed = len(work) - len(result)

    helper_cols = [
        "_player_parts", "_player_count", "_player_canon", "_box_type_key", "_numbering_key", "_file_key", "_dedupe_key"
    ]
    result = result.drop(columns=[c for c in helper_cols if c in result.columns], errors="ignore")
    return result, rows_removed

# API Key Config (Removed as requested)
# OPENAI_API_KEY = st.secrets["OPENAI_API_KEY"]

initial_sport_key = st.session_state.get("selected_sport", DEFAULT_SPORT_KEY)
initial_sport_profile = get_sport_profile(initial_sport_key)
st.set_page_config(
    page_title="Check list optimizer",
    page_icon=initial_sport_profile.get("page_icon", "🏀"),
    layout="wide",
)

# --- CSS Styling ---
st.markdown("""
<style>
    .main {
        background-color: #f0f2f6;
    }
    .st-emotion-cache-1v0mbdj {
        width: 100%;
    }
    h1 {
        color: #1f77b4;
    }
    h3 {
        color: #333;
    }
</style>
""", unsafe_allow_html=True)

# --- Sidebar: Configuration ---
st.sidebar.header("📁 Configuration")
if st.sidebar.button("🔄 Recharger (cache)"):
    st.cache_data.clear()

if "selected_sport" not in st.session_state:
    st.session_state["selected_sport"] = DEFAULT_SPORT_KEY

sport_labels = get_sport_labels()
current_sport_label = get_sport_profile(st.session_state["selected_sport"])["label"]
selected_sport_label = st.sidebar.selectbox(
    "Sport",
    options=sport_labels,
    index=sport_labels.index(current_sport_label) if current_sport_label in sport_labels else 0,
    help="Le sport pilote la normalisation des équipes et les règles de scoring.",
)
selected_sport_key = sport_key_from_label(selected_sport_label)
st.session_state["selected_sport"] = selected_sport_key
sport_profile = get_sport_profile(selected_sport_key)

header_logo_url = sport_profile.get("header_logo_url", "")
header_title = sport_profile.get("header_title", "Check list optimizer")
header_subtitle = sport_profile.get("header_subtitle", "")

if header_logo_url:
    st.markdown(
        f"""
        <div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin-bottom: 20px;">
            <img src="{header_logo_url}" width="60">
            <h1 style="margin: 0; display: inline-block;">{header_title}</h1>
        </div>
        <div style="text-align: center; margin-bottom: 40px;">
            {header_subtitle}
        </div>
        """,
        unsafe_allow_html=True,
    )
else:
    st.markdown(
        f"""
        <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="margin: 0;">{header_title}</h1>
        </div>
        <div style="text-align: center; margin-bottom: 40px;">
            {header_subtitle}
        </div>
        """,
        unsafe_allow_html=True,
    )

# Setup default data folder for mobile ease-of-use
base_dir = os.getcwd()
default_data_root_dir = os.path.join(base_dir, "checklists_clean")

def resolve_sport_data_dir(root_dir, sport_key):
    exact = os.path.join(root_dir, sport_key)
    if os.path.isdir(exact):
        return exact
    if not os.path.isdir(root_dir):
        return exact
    # Case-insensitive fallback (e.g. Tennis vs tennis).
    target = sport_key.lower()
    for entry in os.listdir(root_dir):
        if entry.lower() == target and os.path.isdir(os.path.join(root_dir, entry)):
            return os.path.join(root_dir, entry)
    return exact

sport_data_dir = resolve_sport_data_dir(default_data_root_dir, selected_sport_key)
if os.path.isdir(sport_data_dir) and glob.glob(os.path.join(sport_data_dir, "*.xlsx")):
    default_data_dir = sport_data_dir
else:
    default_data_dir = default_data_root_dir
presets_path = os.path.join(base_dir, "presets.json")

def load_presets(path):
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {}

def save_presets(path, presets):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(presets, f, ensure_ascii=False, indent=2)

def apply_preset(preset_files, all_filenames):
    for fname in all_filenames:
        st.session_state[f"chk_{fname}"] = fname in preset_files
    st.session_state.all_files_selected = (
        len(all_filenames) > 0 and all(f in preset_files for f in all_filenames)
    )
    # Sync Multiselect
    valid_files = [f for f in preset_files if f in all_filenames]
    st.session_state["files_multiselect"] = valid_files

if not os.path.exists(default_data_root_dir):
    os.makedirs(default_data_root_dir)

if (
    "folder_path" not in st.session_state
    or st.session_state.get("folder_path_sport_key") != selected_sport_key
):
    st.session_state.folder_path = default_data_dir
    st.session_state.folder_path_sport_key = selected_sport_key

folder_path = st.session_state.folder_path
folder_basename = os.path.basename(os.path.normpath(folder_path)).lower()
folder_is_selected_sport_dir = folder_basename == selected_sport_key.lower()

# 1. Scan for files first
if os.path.isdir(folder_path):
    found_files = glob.glob(os.path.join(folder_path, "*.xlsx"))
else:
    found_files = []

# Auto-recover if a stale custom path has no files for the active sport.
if not found_files and folder_path != default_data_dir and os.path.isdir(default_data_dir):
    st.session_state.folder_path = default_data_dir
    folder_path = default_data_dir
    found_files = glob.glob(os.path.join(folder_path, "*.xlsx"))

if not folder_is_selected_sport_dir:
    found_files = [
        f for f in found_files
        if detect_sport_from_filename(os.path.basename(f), fallback="unknown") == selected_sport_key
    ]

if not found_files and folder_path != default_data_dir and os.path.isdir(default_data_dir):
    st.session_state.folder_path = default_data_dir
    folder_path = default_data_dir
    folder_basename = os.path.basename(os.path.normpath(folder_path)).lower()
    folder_is_selected_sport_dir = folder_basename == selected_sport_key.lower()
    found_files = glob.glob(os.path.join(folder_path, "*.xlsx"))
    if not folder_is_selected_sport_dir:
        found_files = [
            f for f in found_files
            if detect_sport_from_filename(os.path.basename(f), fallback="unknown") == selected_sport_key
        ]

st.sidebar.markdown("### 🖥️ Dossier Local")
st.sidebar.caption(f"Dossier actif: `{folder_path}`")
if not found_files:
    st.sidebar.info("Aucun fichier local trouvé pour ce sport.")
    selected_file_paths = []
else:
    # 2. Let user select files
    st.sidebar.caption(f"{len(found_files)} fichiers locaux.")
    
    # Sort files to ensure consistency
    found_files.sort()
    
    # helper to build keys
    file_map = {os.path.basename(f): f for f in found_files}
    all_filenames = list(file_map.keys())

    presets = load_presets(presets_path)
    
    # "Select All" logic helper
    container = st.sidebar.container()
    
    # Toggle for Select All
    if "all_files_selected" not in st.session_state:
        st.session_state.all_files_selected = False

    def toggle_select_all():
        new_state = not st.session_state.all_files_selected
        st.session_state.all_files_selected = new_state
        # Force update all checkbox keys
        for fname in all_filenames:
            st.session_state[f"chk_{fname}"] = new_state
        
        # Sync Multiselect
        if new_state:
            st.session_state["files_multiselect"] = all_filenames
        else:
             st.session_state["files_multiselect"] = []
        
    select_all_btn = container.button(
        "Tout désélectionner" if st.session_state.all_files_selected else "Tout sélectionner", 
        on_click=toggle_select_all
    )
    
    selected_file_paths = []

    # Presets UI
    st.sidebar.markdown("### 💾 Presets")
    preset_names = sorted(presets.keys())
    preset_to_load = st.sidebar.selectbox(
        "Charger un preset",
        options=[""] + preset_names,
        index=0,
        help="Recharge une selection sauvegardee."
    )

    def on_load_preset():
        if not preset_to_load:
            return
        files = presets.get(preset_to_load, [])
        apply_preset(files, all_filenames)

    def on_save_preset():
        name = st.session_state.get("preset_name", "").strip()
        if not name:
            return
        
        mode = st.session_state.get("selection_mode", "Par Année (Cases)")
        if mode == "Liste (Multiselect)":
             current_selection = st.session_state.get("files_multiselect", [])
        else:
             current_selection = [
                fname for fname in all_filenames
                if st.session_state.get(f"chk_{fname}", False)
            ]
        presets[name] = current_selection
        save_presets(presets_path, presets)

    st.sidebar.button("Charger le preset", on_click=on_load_preset, disabled=not preset_to_load)
    st.sidebar.text_input("Nom du preset", key="preset_name")
    st.sidebar.button("Sauvegarder la selection", on_click=on_save_preset)
    
    st.sidebar.markdown("---")
    st.sidebar.markdown("**Fichiers locaux :**")
    
    # Mode Selection
    selection_mode = st.sidebar.radio(
        "Mode de sélection :",
        ["Par Année (Cases)", "Liste (Multiselect)"],
        index=0,
        key="selection_mode"
    )

    if selection_mode == "Liste (Multiselect)":
        # Multiselect Mode
        if "files_multiselect" not in st.session_state:
             st.session_state["files_multiselect"] = []
        
        selected_filenames = st.multiselect(
            "Sélectionner les fichiers :",
            options=all_filenames,
            key="files_multiselect",
            help="Sélectionnez plusieurs fichiers."
        )
        # Map back to paths
        selected_file_paths = [file_map[f] for f in selected_filenames]
        
    else:
        # Checkbox Mode (Grouped by Year)
        files_by_year = {}
        for f_path in found_files:
            f_name = os.path.basename(f_path)
            y = extract_year(f_name, selected_sport_key)
            if y not in files_by_year:
                files_by_year[y] = []
            files_by_year[y].append(f_path)
        
        sorted_years = sorted(files_by_year.keys(), reverse=True)
        
        for year in sorted_years:
            year_files = files_by_year[year]
            with st.sidebar.expander(f"{year} ({len(year_files)})", expanded=False):
                for f_path in year_files:
                    f_name = os.path.basename(f_path)
                    # Initialize state if not present
                    chk_key = f"chk_{f_name}"
                    if chk_key not in st.session_state:
                         st.session_state[chk_key] = False 
                    
                    # Checkbox controlling state
                    is_checked = st.checkbox(f_name, key=chk_key)
                    
                    if is_checked:
                        selected_file_paths.append(f_path)

    st.sidebar.markdown("---")
    st.sidebar.caption(f"{len(selected_file_paths)} fichier(s) sélectionné(s).")
    # Debug info (requested in plan)
    if len(selected_file_paths) > 10:
        st.sidebar.text(f"Debug: {len(selected_file_paths)} items selected")

# Advanced mode: Custom path
with st.sidebar.expander("Configuration Avancée (Chemin)"):
    st.caption("Recommandé: `checklists_clean/nba`, `checklists_clean/nfl`, `checklists_clean/soccer`, `checklists_clean/tennis`.")
    st.text_input("Chemin du dossier", value=folder_path, key="folder_path")

# --- CLOUD UPLOAD SUPPORT ---
st.sidebar.markdown("### ☁️ Upload (Cloud/Web)")
uploaded_files = st.sidebar.file_uploader(
    "Ajouter des fichiers Excel",
    type=['xlsx'],
    accept_multiple_files=True
)
st.sidebar.caption("Les fichiers doivent contenir un onglet 'Teams_clean'.")

if st.sidebar.button("🚀 Lancer l'analyse", type="primary"):
    st.session_state['scan_triggered'] = True
    # Merge local selected files AND uploaded files
    st.session_state['selected_files'] = selected_file_paths + (uploaded_files or [])

# --- Main Logic ---

def load_data(file_list, selected_sport_key, selected_sport_profile):
    if not file_list:
        return None, "Aucun fichier sélectionné.", []

    @st.cache_data
    def read_sheet(path, mtime, sheet_name):
        return pd.read_excel(path, sheet_name=sheet_name, engine="openpyxl")

    combined_data = []
    files_processed = 0
    error_files = []
    
    progress_bar = st.progress(0)
    status_text = st.empty()

    for i, file_obj in enumerate(file_list):
        # Handle difference between Local Path (str) and UploadedFile (object)
        if isinstance(file_obj, str):
            filename = os.path.basename(file_obj)
            source = file_obj # Path
        else:
            filename = file_obj.name
            source = file_obj # File Object
            
        if filename.startswith("~$"):
            error_files.append((filename, "Fichier temporaire Excel ignoré."))
            continue

        status_text.text(f"Lecture de : {filename}")
        try:
            guessed_sport_key = detect_sport_from_filename(filename, fallback=selected_sport_key)
            if guessed_sport_key != selected_sport_key:
                error_files.append(
                    (
                        filename,
                        f"Ignoré: le fichier semble être '{guessed_sport_key}' alors que le sport actif est '{selected_sport_key}'.",
                    )
                )
                continue

            file_sport_key = selected_sport_key
            file_sport_profile = selected_sport_profile

            team_aliases = file_sport_profile.get("team_aliases", {})
            sheet_names = file_sport_profile.get("sheet_names", ["Teams_clean"])

            # Extract Year from filename (sport-aware).
            box_year = extract_year(filename, selected_sport_key)
            
            try:
                df = None
                for sheet_name in sheet_names:
                    try:
                        if isinstance(source, str):
                            df = read_sheet(source, os.path.getmtime(source), sheet_name)
                        else:
                            source.seek(0)
                            df = pd.read_excel(source, sheet_name=sheet_name, engine="openpyxl")
                        break
                    except ValueError:
                        continue
                if df is None:
                    raise ValueError("Sheet not found")

                # Normalize column names to avoid missing-key errors from stray whitespace/casing.
                df.columns = [str(c).strip() for c in df.columns]
                lower_map = {c.lower(): c for c in df.columns}
                if "box type" in lower_map:
                    df = df.rename(columns={lower_map["box type"]: "Box Type"})
                elif "card type" in lower_map:
                    df = df.rename(columns={lower_map["card type"]: "Box Type"})
                elif "boxtype" in lower_map:
                    df = df.rename(columns={lower_map["boxtype"]: "Box Type"})

                if "player" in lower_map and "Player" not in df.columns:
                    df = df.rename(columns={lower_map["player"]: "Player"})
                if "team" in lower_map and "Team" not in df.columns:
                    df = df.rename(columns={lower_map["team"]: "Team"})

                missing_cols = [c for c in ["Player", "Team"] if c not in df.columns]
                if missing_cols:
                    error_files.append((filename, f"Colonnes manquantes: {', '.join(missing_cols)}. Colonnes trouvées: {list(df.columns)}"))
                    continue
                if "Box Type" not in df.columns:
                    df["Box Type"] = ""
                    error_files.append((filename, "Colonne 'Box Type' absente: ajoutée vide pour éviter l'erreur."))
            except ValueError:
                st.warning(f"{filename}: aucun onglet compatible trouvé ({', '.join(sheet_names)}).")
                continue
            
            # Clean data
            df = df.dropna(subset=['Player', 'Team'])
            
            # Remove trailing commas from names (common in new checklists)
            df['Player'] = (
                df['Player']
                .astype(str)
                .str.replace(r',$', '', regex=True)
                .str.strip()
            )
            df['Team'] = df['Team'].astype(str).str.strip()
            df['Team'] = df['Team'].apply(lambda t: normalize_team_name(t, team_aliases))

            
            # Add metadata
            df['Hits'] = 1
            df['File'] = filename # Track source file
            df['Year'] = box_year
            df['Product'] = extract_product(filename)
            df['Sport'] = file_sport_key
            if 'Numbering' not in df.columns:
                df['Numbering'] = ""
            if 'Box Type' not in df.columns:
                df['Box Type'] = ""

            # Fix older formats where "Box Type" ended up in Numbering
            box_empty = df['Box Type'].astype(str).str.strip().eq("") | df['Box Type'].isna()
            numbering_str = df['Numbering'].astype(str).str.strip()
            non_numeric = ~numbering_str.str.fullmatch(r"\d+(\.\d+)?")
            if box_empty.mean() > 0.8 and non_numeric.mean() > 0.5:
                df.loc[box_empty, 'Box Type'] = df.loc[box_empty, 'Numbering']
                df.loc[non_numeric, 'Numbering'] = ""
            
            combined_data.append(df)
            files_processed += 1
            
        except Exception as e:
            error_files.append((filename, str(e)))
        
        progress_bar.progress((i + 1) / len(file_list))

    status_text.empty()
    progress_bar.empty()
    
    if not combined_data:
        return None, "Aucun onglet 'Teams_clean' trouvé ou données valides extraites.", error_files
        
    df = pd.concat(combined_data, ignore_index=True)
    msg = f"{files_processed} fichiers traités • {len(df)} lignes"
    return df, msg, error_files

# --- Display ---

if 'scan_triggered' in st.session_state and st.session_state['scan_triggered']:
    # Use selected files from session state
    target_files = st.session_state.get('selected_files', [])
    df, msg, error_files = load_data(
        target_files,
        selected_sport_key=selected_sport_key,
        selected_sport_profile=sport_profile,
    )
    
    if df is not None:
        st.success(msg)
        st.caption(f"Sport actif pour l'analyse: {sport_profile.get('label', selected_sport_key)}")
        st.sidebar.markdown("---")
        st.sidebar.caption(f"{msg}")
        if error_files:
            st.sidebar.caption(f"{len(error_files)} fichier(s) ignoré(s).")
        if error_files:
            with st.expander(f"{len(error_files)} fichier(s) ignoré(s)"):
                for name, err in error_files:
                    st.write(f"- {name}: {err}")
        
        # --- Pre-processing for Multi-Values ---
        # Split and explode Players (separator '/')
        df_p = df.copy()
        df_p['Player'] = df_p['Player'].astype(str).str.split('/')
        df_p = df_p.explode('Player')
        df_p['Player'] = df_p['Player'].str.strip()
        
        # Split and explode Teams (separator '/')
        df_t = df.copy()
        df_t['Team'] = df_t['Team'].astype(str).str.split('/')
        df_t = df_t.explode('Team')
        df_t['Team'] = df_t['Team'].str.strip()
        
        # --- Navigation State Management ---
        if 'active_view' not in st.session_state:
            st.session_state['active_view'] = "🌍 Vue Globale"
            
        def update_view():
            st.session_state['active_view'] = st.session_state['nav_radio']
            
        def go_to_view(view_name):
            if st.session_state.get('active_view') != view_name:
                st.session_state['pending_view'] = view_name
                st.rerun()

        def get_selected_row(event_obj):
            if event_obj is None:
                return None
            selection = getattr(event_obj, "selection", None)
            if selection is None:
                return None
            rows = getattr(selection, "rows", None)
            if not rows:
                return None
            return rows[0]

        # Navigation Bar
        if 'pending_view' in st.session_state:
            st.session_state['nav_radio'] = st.session_state['pending_view']
            st.session_state['active_view'] = st.session_state['pending_view']
            del st.session_state['pending_view']

        # --- ROI & Hype Logic ---
        category_rules = sport_profile.get("category_rules", {})
        case_hit_keywords = category_rules.get("case_hit", [])
        auto_mem_keywords = category_rules.get("auto_mem", [])
        logoman_keywords = category_rules.get("logoman", [])
        top_rookies_by_year = sport_profile.get("top_rookies_by_year", {})
        hype_map = build_hype_map(sport_profile.get("hype_tiers", {}))
        enabled_views = sport_profile.get("enabled_views", {})

        views = ["🌍 Vue Globale"]
        if enabled_views.get("autos_patchs", True) and auto_mem_keywords:
            views.append("💎 Autos & Patchs")
        if enabled_views.get("logoman", True) and logoman_keywords:
            views.append("🔥 Logoman")
        if enabled_views.get("case_hits", True) and case_hit_keywords:
            views.append("✨ Case Hits")
        views.extend(["👥 Multi-Joueurs", "⚖️ Comparateur Joueurs"])
        if enabled_views.get("value_picks", True) and hype_map:
            views.append("🧠 Value Picks")
        if enabled_views.get("cost_by_pick", True):
            views.append("💸 Cost par Pick")
        if enabled_views.get("rookies", bool(top_rookies_by_year)):
            views.append("🧨 Rookies")
        if enabled_views.get("live_mode", True):
            views.append("⚡ Live Mode")
        views.extend([" Par Fichier", "🔍 Analyse Joueur", "🛡️ Analyse Équipe"])
        
        # Ensure current view is valid
        if st.session_state['active_view'] not in views:
             st.session_state['active_view'] = views[0]
             
        selection = st.radio("", views, index=views.index(st.session_state['active_view']), horizontal=True, key="nav_radio", on_change=update_view, label_visibility="collapsed")
        st.markdown("---")

        # --- Filters ---
        all_products = sorted(df['Product'].dropna().unique().tolist())
        selected_products = st.multiselect("Filtrer par produit :", all_products, default=all_products)
        if selected_products:
            df = df[df['Product'].isin(selected_products)]
            df_p = df_p[df_p['Product'].isin(selected_products)]
            df_t = df_t[df_t['Product'].isin(selected_products)]

        # De-duplicate projected multi-team rows to avoid over-counting multi-player cards.
        df, collapsed_multi_rows = dedupe_multiplayer_projection_rows(df)
        if collapsed_multi_rows > 0:
            st.caption(f"Info: {collapsed_multi_rows} ligne(s) multi-équipe fusionnée(s) pour éviter le surcomptage.")

        # --- Scoring prep ---
        sport_rule_map = {}
        if "Sport" in df.columns:
            for sk in df["Sport"].dropna().astype(str).unique().tolist():
                sport_rule_map[sk] = get_sport_profile(sk).get("category_rules", category_rules)
        if not sport_rule_map:
            sport_rule_map[selected_sport_key] = category_rules

        def resolve_rules_for_row(row):
            sk = str(row.get("Sport", selected_sport_key))
            return sport_rule_map.get(sk, category_rules)

        df['Category'] = df.apply(
            lambda row: categorize_card(row.get('Box Type', ''), resolve_rules_for_row(row)),
            axis=1,
        )
        df['Rarity Mult'] = df['Numbering'].apply(rarity_multiplier)
        df['Score'] = df['Category'].apply(calculate_score) * df['Rarity Mult']

        # Rebuild exploded frames after scoring/filtering
        df_p = df.copy()
        df_p['Player Raw'] = df_p['Player'].astype(str).str.strip()
        df_p['Team Raw'] = df_p['Team'].astype(str).str.strip()
        df_p['Is Multi-Player Card'] = df_p['Player Raw'].str.contains('/', na=False)
        df_p['Player List'] = df_p['Player Raw'].apply(split_slash_values)
        df_p['Team List'] = df_p['Team Raw'].apply(split_slash_values)
        df_p['Player Count'] = df_p['Player List'].apply(len)
        df_p['Team Count'] = df_p['Team List'].apply(len)
        df_p['Is Player-Team Aligned'] = (df_p['Player Count'] == df_p['Team Count']) & (df_p['Player Count'] > 1)
        df_p = df_p.reset_index(drop=True)
        df_p['Card Row Id'] = df_p.index
        df_p = df_p.explode('Player List')
        df_p['Player Position'] = df_p.groupby('Card Row Id').cumcount()
        df_p['Player'] = df_p['Player List'].astype(str).str.strip()
        df_p = df_p[df_p['Player'] != ""].copy()

        def resolve_player_team(row):
            team_list = row.get('Team List', [])
            player_pos = row.get('Player Position', 0)
            if isinstance(team_list, list) and row.get('Is Player-Team Aligned', False):
                if 0 <= player_pos < len(team_list):
                    return str(team_list[player_pos]).strip()
            return row.get('Team Raw', '')

        df_p['Team'] = df_p.apply(resolve_player_team, axis=1)

        df_t = df.copy()
        df_t['Team'] = df_t['Team'].astype(str).str.split('/')
        df_t = df_t.explode('Team')
        df_t['Team'] = df_t['Team'].str.strip()

        if selection == "🌍 Vue Globale":
            # --- Aggregation Global ---
            
            # Group by Player using Exploded DF
            player_stats = df_p.groupby('Player').agg({
                'Hits': 'sum'
            }).reset_index()
            
            # Group by Team using Exploded DF
            team_stats = df_t.groupby('Team').agg({
                'Hits': 'sum'
            }).reset_index()
            
            # --- Global Search ---
            all_players_global = sorted(player_stats['Player'].unique().tolist())
            search_player = st.selectbox("🔍 Recherche Rapide Joueur (Tous les joueurs) :", [""] + all_players_global, key="global_search")
            
            if search_player:
                st.session_state['target_player'] = search_player
                go_to_view("🔍 Analyse Joueur")

            # --- Top 15 Logic ---
            col1, col2 = st.columns(2)
            
            with col1:
                st.subheader("🏆 Classement Joueurs (Global)")
                st.markdown("*(Cliquez sur une ligne pour voir le détail)*")
                
                # Full sorted list for Table
                sorted_players = player_stats.sort_values(by='Hits', ascending=False)
                show_all_players = st.checkbox("Afficher tout", value=False, key="global_players_show_all")
                display_players = sorted_players if show_all_players else sorted_players.head(50)
                
                # Dataframe with selection
                event_p = st.dataframe(
                    display_players, 
                    use_container_width=True, 
                    selection_mode="single-row",
                    on_select="rerun",
                    key="global_players_table"
                )
                
                # Handle Selection
                row_idx = get_selected_row(event_p)
                if row_idx is not None:
                    selected_player_name = sorted_players.iloc[row_idx]['Player']
                    st.session_state['target_player'] = selected_player_name
                    go_to_view("🔍 Analyse Joueur")

                # Top 15 for Chart
                fig_p = px.bar(sorted_players.head(15), x='Player', y='Hits', title="Top 15 Joueurs", color='Hits')
                st.plotly_chart(fig_p, use_container_width=True)

            with col2:
                st.subheader("🛡️ Classement Équipes (Global)")
                st.markdown("*(Cliquez sur une ligne pour voir le détail)*")
                
                # Full sorted list for Table
                sorted_teams = team_stats.sort_values(by='Hits', ascending=False)
                show_all_teams = st.checkbox("Afficher tout", value=False, key="global_teams_show_all")
                display_teams = sorted_teams if show_all_teams else sorted_teams.head(50)
                
                # Dataframe with selection
                event_t = st.dataframe(
                    display_teams, 
                    use_container_width=True, 
                    selection_mode="single-row",
                    on_select="rerun",
                    key="global_teams_table"
                )

                # Handle Selection
                row_idx = get_selected_row(event_t)
                if row_idx is not None:
                    selected_team_name = sorted_teams.iloc[row_idx]['Team']
                    st.session_state['target_team'] = selected_team_name
                    go_to_view("🛡️ Analyse Équipe")
                
                # Top 15 for Chart
                fig_t = px.bar(sorted_teams.head(15), x='Team', y='Hits', title="Top 15 Équipes", color='Hits')
                st.plotly_chart(fig_t, use_container_width=True)

        elif selection == "💎 Autos & Patchs":
            st.subheader("Analyse Autographes & Memorabilia")
            st.info("Filtre sur les mots clés du sport sélectionné (auto/mem).")
            
            # Filter Dataframes
            df_p_filtered = df_p[df_p['Category'] == CATEGORY_AUTO_MEM]
            df_t_filtered = df_t[df_t['Category'] == CATEGORY_AUTO_MEM]
            
            # Group by Player
            player_stats_f = df_p_filtered.groupby('Player').agg({'Hits': 'sum'}).reset_index()
            # Group by Team
            team_stats_f = df_t_filtered.groupby('Team').agg({'Hits': 'sum'}).reset_index()
            
            col_f1, col_f2 = st.columns(2)
            
            with col_f1:
                st.subheader("✒️ Classement Joueurs (Autos/Mem)")
                st.markdown("*(Cliquez pour le détail)*")
                sorted_players_f = player_stats_f.sort_values(by='Hits', ascending=False)
                
                event_pf = st.dataframe(
                    sorted_players_f,
                    use_container_width=True,
                    selection_mode="single-row",
                    on_select="rerun",
                    key="auto_players_table"
                )
                
                row_idx = get_selected_row(event_pf)
                if row_idx is not None:
                    selected_player_name = sorted_players_f.iloc[row_idx]['Player']
                    st.session_state['target_player'] = selected_player_name
                    go_to_view("🔍 Analyse Joueur")
                    
                fig_pf = px.bar(sorted_players_f.head(15), x='Player', y='Hits', color='Hits')
                st.plotly_chart(fig_pf, use_container_width=True)
                
            with col_f2:
                st.subheader("🛡️ Classement Équipes (Autos/Mem)")
                st.markdown("*(Cliquez pour le détail)*")
                sorted_teams_f = team_stats_f.sort_values(by='Hits', ascending=False)
                
                event_tf = st.dataframe(
                    sorted_teams_f,
                    use_container_width=True,
                    selection_mode="single-row",
                    on_select="rerun",
                    key="auto_teams_table"
                )
                
                row_idx = get_selected_row(event_tf)
                if row_idx is not None:
                    selected_team_name = sorted_teams_f.iloc[row_idx]['Team']
                    st.session_state['target_team'] = selected_team_name
                    go_to_view("🛡️ Analyse Équipe")
                    
                fig_tf = px.bar(sorted_teams_f.head(15), x='Team', y='Hits', color='Hits')
                st.plotly_chart(fig_tf, use_container_width=True)

        elif selection == "🔥 Logoman":
            st.subheader("🔥 Analyse Logoman")
            st.info("Filtre sur les mots-clés logoman/logo patch du sport sélectionné.")
            
            # Filter Dataframes
            df_p_logoman = df_p[df_p['Category'] == CATEGORY_LOGOMAN]
            df_t_logoman = df_t[df_t['Category'] == CATEGORY_LOGOMAN]
            
            # Group by Player
            player_stats_l = df_p_logoman.groupby('Player').agg({'Hits': 'sum'}).reset_index()
            # Group by Team
            team_stats_l = df_t_logoman.groupby('Team').agg({'Hits': 'sum'}).reset_index()
            
            col_l1, col_l2 = st.columns(2)
            
            with col_l1:
                st.subheader("🔥 Classement Joueurs (Logoman)")
                st.markdown("*(Cliquez pour le détail)*")
                sorted_players_l = player_stats_l.sort_values(by='Hits', ascending=False)
                
                event_pl = st.dataframe(
                    sorted_players_l,
                    use_container_width=True,
                    selection_mode="single-row",
                    on_select="rerun",
                    key="logoman_players_table"
                )
                
                row_idx = get_selected_row(event_pl)
                if row_idx is not None:
                    selected_player_name = sorted_players_l.iloc[row_idx]['Player']
                    st.session_state['target_player'] = selected_player_name
                    go_to_view("🔍 Analyse Joueur")
                    
                fig_pl = px.bar(sorted_players_l.head(15), x='Player', y='Hits', color='Hits')
                st.plotly_chart(fig_pl, use_container_width=True)
                
            with col_l2:
                st.subheader("🔥 Classement Équipes (Logoman)")
                st.markdown("*(Cliquez pour le détail)*")
                sorted_teams_l = team_stats_l.sort_values(by='Hits', ascending=False)
                
                event_tl = st.dataframe(
                    sorted_teams_l,
                    use_container_width=True,
                    selection_mode="single-row",
                    on_select="rerun",
                    key="logoman_teams_table"
                )
                
                row_idx = get_selected_row(event_tl)
                if row_idx is not None:
                    selected_team_name = sorted_teams_l.iloc[row_idx]['Team']
                    st.session_state['target_team'] = selected_team_name
                    go_to_view("🛡️ Analyse Équipe")
                    
                fig_tl = px.bar(sorted_teams_l.head(15), x='Team', y='Hits', color='Hits')
                st.plotly_chart(fig_tl, use_container_width=True)

        elif selection == "✨ Case Hits":
            st.subheader("✨ Analyse Case Hits (Downtown, Kaboom, Color Blast, Manga...)")
            # Keywords display
            st.info("Filtre sur les mots-clés Case Hits configurés pour le sport sélectionné.")

            df_p_ch = df_p[df_p['Category'] == CATEGORY_CASE_HIT]
            df_t_ch = df_t[df_t['Category'] == CATEGORY_CASE_HIT]
            
            # Group by Player with details
            player_stats_ch = df_p_ch.groupby('Player').agg({
                'Hits': 'sum',
                'Box Type': lambda x: ', '.join(sorted(list(set(str(v) for v in x)))),
                'File': lambda x: ', '.join(sorted(list(set(str(v) for v in x))))
            }).reset_index()
            player_stats_ch.rename(columns={'Box Type': 'Variantes', 'File': 'Box / Checklist'}, inplace=True)
            
            # Group by Team with details
            team_stats_ch = df_t_ch.groupby('Team').agg({
                'Hits': 'sum',
                'Box Type': lambda x: ', '.join(sorted(list(set(str(v) for v in x)))),
                'File': lambda x: ', '.join(sorted(list(set(str(v) for v in x))))
            }).reset_index()
            team_stats_ch.rename(columns={'Box Type': 'Variantes', 'File': 'Box / Checklist'}, inplace=True)
            
            col_ch1, col_ch2 = st.columns(2)
            
            with col_ch1:
                st.subheader("✨ Classement Joueurs (Case Hits)")
                st.markdown("*(Cliquez pour le détail)*")
                sorted_players_ch = player_stats_ch.sort_values(by='Hits', ascending=False)
                
                event_pch = st.dataframe(
                    sorted_players_ch,
                    use_container_width=True,
                    selection_mode="single-row",
                    on_select="rerun",
                    key="ch_players_table"
                )
                
                row_idx = get_selected_row(event_pch)
                if row_idx is not None:
                    selected_player_name = sorted_players_ch.iloc[row_idx]['Player']
                    st.session_state['target_player'] = selected_player_name
                    go_to_view("🔍 Analyse Joueur")
                    
                if not sorted_players_ch.empty:
                    fig_pch = px.bar(sorted_players_ch.head(15), x='Player', y='Hits', color='Hits', title="Top Players - Case Hits")
                    st.plotly_chart(fig_pch, use_container_width=True)
                else:
                    st.info("Aucun Case Hit trouvé pour les joueurs.")
                
            with col_ch2:
                st.subheader("✨ Classement Équipes (Case Hits)")
                st.markdown("*(Cliquez pour le détail)*")
                sorted_teams_ch = team_stats_ch.sort_values(by='Hits', ascending=False)
                
                event_tch = st.dataframe(
                    sorted_teams_ch,
                    use_container_width=True,
                    selection_mode="single-row",
                    on_select="rerun",
                    key="ch_teams_table"
                )
                
                row_idx = get_selected_row(event_tch)
                if row_idx is not None:
                    selected_team_name = sorted_teams_ch.iloc[row_idx]['Team']
                    st.session_state['target_team'] = selected_team_name
                    go_to_view("🛡️ Analyse Équipe")
                    
                if not sorted_teams_ch.empty:
                    fig_tch = px.bar(sorted_teams_ch.head(15), x='Team', y='Hits', color='Hits', title="Top Teams - Case Hits")
                    st.plotly_chart(fig_tch, use_container_width=True)
                else:
                    st.info("Aucun Case Hit trouvé pour les équipes.")

        elif selection == "👥 Multi-Joueurs":
            st.subheader("👥 Analyse Multi-Joueurs / Dual / Triple")
            st.info("Liste des cartes comportant plusieurs joueurs (séparés par un '/')")
            
            # Filter original df for '/'
            multi_player_df = df[df['Player'].astype(str).str.contains('/', na=False)]
            
            # Extract unique players involved in these cards for the filter
            unique_multi_players = sorted(list(set([p.strip() for sublist in multi_player_df['Player'].str.split('/') for p in sublist])))
            
            # Filter Box
            selected_multi_player = st.selectbox("Filtrer par joueur inclus :", ["Tous"] + unique_multi_players)
            
            if selected_multi_player != "Tous":
                 # Filter rows where the selected player is present in the split list
                 multi_player_df = multi_player_df[multi_player_df['Player'].apply(lambda x: selected_multi_player in [p.strip() for p in x.split('/')])]

            st.markdown(f"**Nombre de cartes :** {len(multi_player_df)}")
            
            col_m1, col_m2 = st.columns([2, 1])
            
            with col_m1:
                st.dataframe(multi_player_df, use_container_width=True)
                
            with col_m2:
                st.markdown("#### Stats Rapides")
                # Count pairs/groups
                top_combinations = multi_player_df['Player'].value_counts().reset_index()
                top_combinations.columns = ['Combinaison', 'Hits']
                st.dataframe(top_combinations, use_container_width=True)
                
        elif selection == "⚖️ Comparateur Joueurs":
            st.subheader("⚖️ Comparateur de Joueurs")
            st.info("Sélectionnez plusieurs joueurs pour comparer leurs stats.")
            
            # Get list of players
            all_players_comp = sorted(df_p['Player'].unique().tolist())

            def parse_player_list(raw_text):
                if not raw_text:
                    return []
                parts = re.split(r"[,\n;]+", raw_text)
                return [p.strip() for p in parts if p.strip()]

            if "compare_list_active" not in st.session_state:
                st.session_state.compare_list_active = False
            if "compare_list_players" not in st.session_state:
                st.session_state.compare_list_players = []

            st.markdown("##### Comparer une liste")
            raw_list = st.text_area(
                "Colle ta liste (1 par ligne ou séparé par virgule)",
                key="compare_list_text"
            )
            col_cmp1, col_cmp2 = st.columns([1, 1])
            with col_cmp1:
                if st.button("Comparer la liste", key="compare_list_btn"):
                    parsed = parse_player_list(raw_list)
                    st.session_state.compare_list_players = parsed
                    st.session_state.compare_list_active = True
            with col_cmp2:
                if st.button("Revenir à la sélection", key="compare_list_reset"):
                    st.session_state.compare_list_active = False

            if st.session_state.compare_list_active:
                selected_players_comp = st.session_state.compare_list_players
                st.caption(f"{len(selected_players_comp)} joueur(s) collé(s).")
            else:
                selected_players_comp = st.multiselect("Choix des joueurs :", all_players_comp)

            if selected_players_comp:
                comparison_data = []
                
                for p in selected_players_comp:
                    # Filter data
                    p_data = df_p[df_p['Player'] == p].copy()
                    p_data['Rarity Mult'] = p_data['Numbering'].apply(rarity_multiplier)
                    
                    total = p_data['Hits'].sum()
                    cat_counts = p_data['Category'].value_counts()
                    logo = cat_counts.get("🔥 Logoman", 0)
                    case_hit = cat_counts.get("✨ Case Hit", 0)
                    auto = cat_counts.get("💎 Auto/Mem", 0)
                    base = cat_counts.get("📄 Base/Autre", 0)
                    score = (p_data['Category'].apply(calculate_score) * p_data['Rarity Mult']).sum()
                    
                    comparison_data.append({
                        "Joueur": p,
                        "Total Cartes": total,
                        "Score": round(score, 2),
                        "🔥 Logoman": logo,
                        "✨ Case Hit": case_hit,
                        "💎 Auto/Mem": auto,
                        "📄 Base/Autre": base
                    })
                
                comp_df = pd.DataFrame(comparison_data)
                
                # Sorting option? Default by Score
                st.dataframe(comp_df.sort_values(by="Score", ascending=False), use_container_width=True)
                
                total_row = {
                    "Joueur": "TOTAL",
                    "Total Cartes": comp_df["Total Cartes"].sum(),
                    "Score": round(comp_df["Score"].sum(), 2),
                    "🔥 Logoman": comp_df["🔥 Logoman"].sum(),
                    "✨ Case Hit": comp_df["✨ Case Hit"].sum(),
                    "💎 Auto/Mem": comp_df["💎 Auto/Mem"].sum(),
                    "📄 Base/Autre": comp_df["📄 Base/Autre"].sum(),
                }
                st.markdown("##### Total global")
                st.dataframe(pd.DataFrame([total_row]), use_container_width=True)
                col_tot1, col_tot2, col_tot3, col_tot4, col_tot5, col_tot6 = st.columns(6)
                col_tot1.metric("Total Cartes", total_row["Total Cartes"])
                col_tot2.metric("Score", total_row["Score"])
                col_tot3.metric("🔥 Logoman", total_row["🔥 Logoman"])
                col_tot4.metric("✨ Case Hit", total_row["✨ Case Hit"])
                col_tot5.metric("💎 Auto/Mem", total_row["💎 Auto/Mem"])
                col_tot6.metric("📄 Base/Autre", total_row["📄 Base/Autre"])

                missing = [p for p in selected_players_comp if p not in all_players_comp]
                if missing:
                    st.warning(f"Introuvable(s) dans les données: {', '.join(missing)}")

                # Chart
                fig_comp = px.bar(comp_df, x="Joueur", y=["🔥 Logoman", "✨ Case Hit", "💎 Auto/Mem", "📄 Base/Autre"], title="Comparaison Visuelle", barmode='stack')
                st.plotly_chart(fig_comp, use_container_width=True)


        elif selection == "🧠 Value Picks":
            st.subheader("🧠 Value Picks")
            st.info(
                "La note combine le type de carte (Logoman > Case Hit > Auto/Mem > Base) "
                "et la rareté (numérotation faible = bonus). "
                "Le Value Index = Score / Hype (moins hype = meilleur value)."
            )

            player_scores = df.groupby("Player").agg({
                "Hits": "sum",
                "Score": "sum",
            }).reset_index()
            player_scores["Hype"] = player_scores["Player"].apply(lambda x: get_hype_multiplier(x, hype_map))
            player_scores["Value Index"] = player_scores["Score"] / player_scores["Hype"].replace(0, 1)

            player_scores = player_scores.sort_values(by="Value Index", ascending=False)
            st.dataframe(player_scores.head(50), use_container_width=True)

            top20 = player_scores.head(20)
            csv_data = top20.to_csv(index=False).encode("utf-8")
            st.download_button("Exporter Top 20 (CSV)", data=csv_data, file_name="top20_value_picks.csv", mime="text/csv")

        elif selection == "💸 Cost par Pick":
            st.subheader("💸 Cost par Pick")
            st.info(
                "Renseigne le coût par équipe pour obtenir le meilleur rapport qualité/prix."
            )

            default_cost = st.number_input("Coût par spot (par équipe)", min_value=0.0, value=25.0, step=0.5)

            teams = sorted(df['Team'].dropna().unique().tolist())
            if "cost_by_team" not in st.session_state:
                st.session_state.cost_by_team = pd.DataFrame({
                    "Team": teams,
                    "Cost per spot": [default_cost] * len(teams),
                })
            else:
                for t in teams:
                    if t not in st.session_state.cost_by_team["Team"].tolist():
                        st.session_state.cost_by_team = pd.concat(
                            [
                                st.session_state.cost_by_team,
                                pd.DataFrame({"Team": [t], "Cost per spot": [default_cost]}),
                            ],
                            ignore_index=True,
                        )

            cost_df = st.data_editor(
                st.session_state.cost_by_team,
                use_container_width=True,
                hide_index=True,
                num_rows="fixed",
            )
            st.session_state.cost_by_team = cost_df

            cost_map = dict(zip(
                st.session_state.cost_by_team["Team"],
                st.session_state.cost_by_team["Cost per spot"],
            ))

            df_cost = df.copy()
            df_cost["Cost"] = df_cost["Team"].map(cost_map).fillna(default_cost)
            df_cost["Value per Cost"] = df_cost["Score"] / df_cost["Cost"].replace(0, 1)

            team_cost = df_cost.groupby("Team").agg({
                "Hits": "sum",
                "Score": "sum",
                "Cost": "sum",
            }).reset_index()
            team_cost["Value/€"] = team_cost["Score"] / team_cost["Cost"].replace(0, 1)
            team_cost = team_cost.sort_values(by="Value/€", ascending=False)
            st.subheader("🛡️ Équipes (meilleur value)")
            st.dataframe(team_cost.head(50), use_container_width=True)

        elif selection == "🧨 Rookies":
            st.subheader("🧨 Rookies en vue")
            st.info("Détection via 'RC' ou 'Rookie' dans le type de carte.")

            st.markdown("#### Top rookies hype par annee (draft)")
            if top_rookies_by_year:
                rookie_rows = [
                    {"Annee": year, "Top 6": ", ".join(names)}
                    for year, names in sorted(top_rookies_by_year.items())
                ]
                st.dataframe(pd.DataFrame(rookie_rows), use_container_width=True)
            else:
                st.caption("Pas de liste rookies configurée pour ce sport.")

            df_rookie = df[df['Box Type'].astype(str).str.contains(r"\brc\b|rookie", case=False, na=False)]
            if df_rookie.empty:
                st.info("Aucun rookie détecté sur ce filtre.")
            else:
                rookies = df_rookie.groupby("Player").agg({
                    "Hits": "sum",
                    "Score": "sum",
                }).reset_index()
                rookies = rookies.sort_values(by="Score", ascending=False)
                st.dataframe(rookies.head(50), use_container_width=True)

        elif selection == "⚡ Live Mode":
            st.subheader("⚡ Live Mode (Pick rapide)")
            st.info("Top picks instantanés basés sur le score.")

            player_scores = df.groupby("Player").agg({"Score": "sum"}).reset_index()
            team_scores = df.groupby("Team").agg({"Score": "sum"}).reset_index()
            top_players = player_scores.sort_values(by="Score", ascending=False).head(5)
            top_teams = team_scores.sort_values(by="Score", ascending=False).head(5)

            col_lp, col_lt = st.columns(2)
            with col_lp:
                st.markdown("#### Top 5 Joueurs")
                for _, row in top_players.iterrows():
                    st.metric(row["Player"], f"{row['Score']:.1f}")
            with col_lt:
                st.markdown("#### Top 5 Équipes")
                for _, row in top_teams.iterrows():
                    st.metric(row["Team"], f"{row['Score']:.1f}")

        elif selection == " Par Fichier":
            st.subheader("Analyse par Fichier")
            
            all_files = sorted(df['File'].unique().tolist())
            selected_file = st.selectbox("Choisir une checklist :", all_files)
            
            if selected_file:
                file_df = df[df['File'] == selected_file].copy()
                
                total_hits = file_df['Hits'].sum()
                cat_counts = file_df['Category'].value_counts()
                
                col_fa1, col_fa2, col_fa3, col_fa4, col_fa5 = st.columns(5)
                col_fa1.metric("Total Cartes", total_hits)
                col_fa2.metric("🔥 Logoman", cat_counts.get("🔥 Logoman", 0))
                col_fa3.metric("✨ Case Hit", cat_counts.get("✨ Case Hit", 0))
                col_fa4.metric("💎 Auto/Mem", cat_counts.get("💎 Auto/Mem", 0))
                col_fa5.metric("📄 Base/Autre", cat_counts.get("📄 Base/Autre", 0))
                
                st.markdown("---")
                
                col_fa6, col_fa7 = st.columns(2)
                with col_fa6:
                    player_stats_file = file_df.groupby('Player').agg({'Hits': 'sum'}).reset_index()
                    player_stats_file = player_stats_file.sort_values(by='Hits', ascending=False)
                    st.subheader("🏆 Joueurs (Fichier)")
                    st.dataframe(player_stats_file, use_container_width=True)
                
                with col_fa7:
                    team_stats_file = file_df.groupby('Team').agg({'Hits': 'sum'}).reset_index()
                    team_stats_file = team_stats_file.sort_values(by='Hits', ascending=False)
                    st.subheader("🛡️ Équipes (Fichier)")
                    st.dataframe(team_stats_file, use_container_width=True)
                
                st.markdown("---")
                st.subheader("Détail des cartes")
                max_serial = st.number_input("Filtre numérotation (<= /xx)", min_value=0, value=0, step=1, key="file_serial")
                display_file_df = file_df.copy()
                if max_serial > 0:
                    display_file_df = display_file_df[
                        display_file_df['Numbering'].apply(parse_numbering).fillna(0) <= max_serial
                    ]
                st.dataframe(display_file_df[['Player', 'Team', 'Box Type', 'Numbering', 'Category', 'Hits']], use_container_width=True)

        elif selection == "🔍 Analyse Joueur":
            st.subheader("Analyse détaillée par Joueur")
            
            # Get list of players from Exploded DF
            all_players = df_p['Player'].value_counts().index.tolist()
            
            # Check for pre-selected player from navigation
            default_index = 0
            if 'target_player' in st.session_state and st.session_state['target_player'] in all_players:
                default_index = all_players.index(st.session_state['target_player'])
            
            selected_player = st.selectbox("Rechercher un joueur :", all_players, index=default_index, key="player_selector")
            
            if selected_player:
                # Filter data for this player
                player_data = df_p[df_p['Player'] == selected_player]
                
                # Metrics
                total_hits = player_data['Hits'].sum()
                multi_hits = player_data.loc[player_data['Is Multi-Player Card'].fillna(False), 'Hits'].sum()
                
                # Breakdown counts
                cat_counts = player_data['Category'].value_counts()
                count_logoman = cat_counts.get("🔥 Logoman", 0)
                count_casehit = cat_counts.get("✨ Case Hit", 0)
                count_auto = cat_counts.get("💎 Auto/Mem", 0)
                count_base = cat_counts.get("📄 Base/Autre", 0)

                col1, col2, col3, col4, col5 = st.columns(5)
                col1.metric("Total Cartes", total_hits)
                col2.metric("🔥 Logoman", count_logoman)
                col3.metric("✨ Case Hit", count_casehit)
                col4.metric("💎 Auto/Mem", count_auto)
                col5.metric("📄 Base/Autre", count_base)
                if multi_hits > 0:
                    st.caption(f"Info: {int(multi_hits)} carte(s) proviennent de combos multi-joueurs.")
                
                st.markdown("---")
                
                # --- Charts & Filter ---
                col_c1, col_c2 = st.columns(2)
                
                with col_c1:
                    st.subheader("Répartition par Type")
                    fig_cat = px.pie(player_data, names='Category', values='Hits', title=f"Types de cartes : {selected_player}", hole=0.3)
                    st.plotly_chart(fig_cat, use_container_width=True)
                    
                with col_c2:
                    st.subheader("Répartition par Fichier")
                    # Group by File
                    file_dist = player_data.groupby('File').agg({'Hits': 'sum'}).reset_index()
                    fig_dist = px.pie(file_dist, names='File', values='Hits', title=f"Répartition par Checklist : {selected_player}")
                    st.plotly_chart(fig_dist, use_container_width=True)
                
                st.markdown("---")
                st.subheader("Détail des cartes")
                
                # Filter by Category for the table
                filter_cat = st.radio("Filtrer le tableau par type :", CATEGORY_FILTER_OPTIONS, horizontal=True)
                max_serial_p = st.number_input("Filtre numérotation (<= /xx)", min_value=0, value=0, step=1, key="player_serial")
                
                if filter_cat != "Tous":
                    display_df = player_data[player_data['Category'] == filter_cat]
                else:
                    display_df = player_data
                if max_serial_p > 0:
                    display_df = display_df[
                        display_df['Numbering'].apply(parse_numbering).fillna(0) <= max_serial_p
                    ]

                display_df_view = display_df.copy()
                display_df_view['Multi-Joueurs'] = display_df_view['Is Multi-Player Card'].fillna(False).map({True: "Oui", False: ""})
                display_df_view['Combo Joueurs'] = display_df_view['Player Raw'].where(display_df_view['Is Multi-Player Card'].fillna(False), "")

                st.dataframe(
                    display_df_view[['Category', 'Box Type', 'Multi-Joueurs', 'Combo Joueurs', 'Numbering', 'Team', 'Hits', 'File']],
                    use_container_width=True,
                )

        elif selection == "🛡️ Analyse Équipe":
             st.subheader("Analyse détaillée par Équipe")
            
             # Get list of teams from Exploded DF
             all_teams = df_t['Team'].value_counts().index.tolist()
             
             # Check for pre-selected team from navigation
             default_index_t = 0
             if 'target_team' in st.session_state and st.session_state['target_team'] in all_teams:
                 default_index_t = all_teams.index(st.session_state['target_team'])

             selected_team = st.selectbox("Rechercher une équipe :", all_teams, index=default_index_t, key="team_selector")
             
             if selected_team:
                 team_df_sub = df_t[df_t['Team'] == selected_team]
                 total_hits_t = len(team_df_sub)
                 
                 st.markdown(f"### {selected_team}")
                 st.markdown(f"**Total Cartes :** {total_hits_t}")
                 
                 # File Distribution
                 file_counts_t = team_df_sub['File'].value_counts().reset_index()
                 file_counts_t.columns = ['File', 'Count']
                 
                 col_t1, col_t2 = st.columns([1, 1])
                 
                 with col_t1:
                      st.markdown("#### Répartition par Fichier")
                      fig_pie_file_t = px.pie(file_counts_t, values='Count', names='File', title=f"Répartition par Fichier")
                      st.plotly_chart(fig_pie_file_t, use_container_width=True)
 
                 with col_t2:
                     st.markdown("#### Détail des cartes")
                     max_serial_t = st.number_input("Filtre numérotation (<= /xx)", min_value=0, value=0, step=1, key="team_serial")
                     display_team_df = team_df_sub.copy()
                     if max_serial_t > 0:
                         display_team_df = display_team_df[
                             display_team_df['Numbering'].apply(parse_numbering).fillna(0) <= max_serial_t
                         ]
                     st.dataframe(display_team_df[['Player', 'Box Type', 'Numbering', 'Hits', 'File']], use_container_width=True)


            
    else:
        st.error(msg)
        if error_files:
            with st.expander(f"{len(error_files)} fichier(s) ignoré(s)"):
                for name, err in error_files:
                    st.write(f"- {name}: {err}")

else:
    st.info("👈 Sélectionnez vos fichiers et cliquez sur 'Lancer l'analyse' pour commencer.")
    
    # Tutorial / Placeholder
    st.markdown("### Comment ça marche ?")
    st.markdown("""
    1.  Choisissez un sport dans la barre latérale (par défaut: **NBA/Basket**).
    2.  Placez vos fichiers par sport dans `checklists_clean/nba`, `checklists_clean/nfl`, `checklists_clean/soccer`.
    3.  Colonnes attendues : **Player**, **Team**, **Card Type**, **Numbering**.
    4.  Les alias équipes et règles de scoring s'adaptent au sport sélectionné.
    5.  Vous pouvez déposer des fichiers via l'upload cloud ou les mettre dans le dossier local.
    6.  Cliquez sur **Lancer l'analyse** pour voir les stats.
    """)
