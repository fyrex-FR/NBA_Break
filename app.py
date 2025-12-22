import streamlit as st
import pandas as pd
import os
import glob
import plotly.express as px
import re

def extract_year(filename):
    match = re.search(r"(\d{4}-\d{2})", filename)
    return match.group(1) if match else "Inconnue"

def extract_product(filename):
    name = os.path.splitext(filename)[0]
    name = re.sub(r"\d{4}-\d{2}", "", name)
    name = re.sub(r"checklist", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s+", " ", name)
    return name.strip(" -_")

# API Key Config (Removed as requested)
# OPENAI_API_KEY = st.secrets["OPENAI_API_KEY"]

st.set_page_config(page_title="Check list optimizer", page_icon="🏀", layout="wide")

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

# Centered Header with Flexbox for alignment
st.markdown("""
    <div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin-bottom: 20px;">
        <img src="https://upload.wikimedia.org/wikipedia/en/thumb/0/03/National_Basketball_Association_logo.svg/315px-National_Basketball_Association_logo.svg.png" width="60">
        <h1 style="margin: 0; display: inline-block;">Check list optimizer</h1>
    </div>
    <div style="text-align: center; margin-bottom: 40px;">
        Optimisez vos choix de <b>Pick Your Player</b> et <b>Pick Your Team</b> en analysant vos checklists.
    </div>
""", unsafe_allow_html=True)

# --- Sidebar: Configuration ---
st.sidebar.header("📁 Configuration")

# Setup default data folder for mobile ease-of-use
base_dir = os.getcwd()
default_data_dir = os.path.join(base_dir, "checklists_clean")

if not os.path.exists(default_data_dir):
    os.makedirs(default_data_dir)

if "folder_path" not in st.session_state:
    st.session_state.folder_path = default_data_dir

folder_path = st.session_state.folder_path

# 1. Scan for files first
if os.path.isdir(folder_path):
    found_files = glob.glob(os.path.join(folder_path, "*.xlsx"))
else:
    found_files = []

st.sidebar.markdown("### 🖥️ Dossier Local")
if not found_files:
    st.sidebar.info("Aucun fichier local trouvé.")
    selected_file_paths = []
else:
    # 2. Let user select files
    st.sidebar.caption(f"{len(found_files)} fichiers locaux.")
    
    # Sort files to ensure consistency
    found_files.sort()
    
    # helper to build keys
    file_map = {os.path.basename(f): f for f in found_files}
    all_filenames = list(file_map.keys())
    
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
        
    select_all_btn = container.button(
        "Tout désélectionner" if st.session_state.all_files_selected else "Tout sélectionner", 
        on_click=toggle_select_all
    )
    
    selected_file_paths = []
    
    st.sidebar.markdown("---")
    st.sidebar.markdown("**Fichiers locaux :**")
    
    # Group by Year
    files_by_year = {}
    for f_path in found_files:
        f_name = os.path.basename(f_path)
        y = extract_year(f_name)
        if y not in files_by_year:
            files_by_year[y] = []
        files_by_year[y].append(f_path)
    
    # Sort years descending (newest first)
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

# Advanced mode: Custom path
with st.sidebar.expander("Configuration Avancée (Chemin)"):
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

def load_data(file_list):
    if not file_list:
        return None, "Aucun fichier sélectionné.", []

    @st.cache_data
    def read_teams_clean(path):
        return pd.read_excel(path, sheet_name="Teams_clean", engine="openpyxl")

    team_names = {
        "atlanta hawks", "atlanta",
        "boston celtics", "boston",
        "brooklyn nets", "brooklyn",
        "charlotte hornets", "charlotte",
        "chicago bulls", "chicago",
        "cleveland cavaliers", "cleveland",
        "dallas mavericks", "dallas",
        "denver nuggets", "denver",
        "detroit pistons", "detroit",
        "golden state warriors", "golden state",
        "houston rockets", "houston",
        "indiana pacers", "indiana",
        "los angeles clippers", "la clippers", "clippers",
        "los angeles lakers", "la lakers", "lakers",
        "memphis grizzlies", "memphis",
        "miami heat", "miami",
        "milwaukee bucks", "milwaukee",
        "minnesota timberwolves", "minnesota",
        "new orleans pelicans", "new orleans",
        "new york knicks", "new york",
        "oklahoma city thunder", "oklahoma city",
        "orlando magic", "orlando",
        "philadelphia 76ers", "philadelphia",
        "phoenix suns", "phoenix",
        "portland trail blazers", "portland",
        "sacramento kings", "sacramento",
        "san antonio spurs", "san antonio",
        "toronto raptors", "toronto",
        "utah jazz", "utah",
        "washington wizards", "washington",
    }
    box_keywords = [
        "base", "set", "auto", "autograph", "signature", "patch", "relic",
        "mem", "jersey", "logoman", "rookie", "insert", "variation", "parallel"
    ]

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
            # Extract Year from filename (e.g. "2023-24")
            year_match = re.search(r"(\d{4}-\d{2})", filename)
            box_year = year_match.group(1) if year_match else "Inconnue"
            
            try:
                if isinstance(source, str):
                    df = read_teams_clean(source)
                else:
                    df = pd.read_excel(source, sheet_name="Teams_clean", engine="openpyxl")
                df = df.rename(columns={"Card Type": "Box Type"})
            except ValueError:
                st.warning(f"{filename}: onglet 'Teams_clean' introuvable. Merci d'utiliser un fichier nettoye.")
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
            df['Team'] = df['Team'].apply(lambda t: t.title())

            
            # Add metadata
            df['Hits'] = 1
            df['File'] = filename # Track source file
            df['Year'] = box_year
            df['Product'] = extract_product(filename)
            if 'Numbering' not in df.columns:
                df['Numbering'] = ""
            
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
    df, msg, error_files = load_data(target_files)
    
    if df is not None:
        st.success(msg)
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

        views = [
            "🌍 Vue Globale",
            "💎 Autos & Patchs",
            "🔥 Logoman",
            "✨ Case Hits",
            "👥 Multi-Joueurs",
            "⚖️ Comparateur Joueurs",
            "🧠 Value Picks",
            "💸 Cost par Pick",
            "🧨 Rookies",
            "⚡ Live Mode",
            " Par Fichier",
            "🔍 Analyse Joueur",
            "🛡️ Analyse Équipe",
        ]
        
        # Ensure current view is valid
        if st.session_state['active_view'] not in views:
             st.session_state['active_view'] = views[0]
             
        selection = st.radio("", views, index=views.index(st.session_state['active_view']), horizontal=True, key="nav_radio", on_change=update_view, label_visibility="collapsed")
        st.markdown("---")
        
        # --- ROI & Hype Logic ---
        
        # 1. Hype Data (Hardcoded as requested)
        HYPE_DATA = {
            "Tier S": ["Victor Wembanyama", "LeBron James", "Stephen Curry", "Luka Doncic", "Anthony Edwards", "Giannis Antetokounmpo", "Nikola Jokic", "Jayson Tatum", "Ja Morant", "LaMelo Ball"],
            "Tier A": ["Trae Young", "Zion Williamson", "Kevin Durant", "Joel Embiid", "Shai Gilgeous-Alexander", "Tyrese Haliburton", "Paolo Banchero", "Chet Holmgren", "Scoot Henderson", "Brandon Miller", "Damian Lillard", "Devin Booker"],
            "Tier B": ["Cade Cunningham", "Jalen Green", "Scottie Barnes", "Evan Mobley", "Josh Giddey", "Franz Wagner", "Amen Thompson", "Ausar Thompson", "Keyonte George", "Bilal Coulibaly", "Donovan Mitchell", "Kyrie Irving"]
        }

        TOP_ROOKIES_BY_YEAR = {
            2015: ["Karl-Anthony Towns", "D'Angelo Russell", "Kristaps Porzingis", "Devin Booker", "Myles Turner", "Terry Rozier"],
            2016: ["Ben Simmons", "Brandon Ingram", "Jaylen Brown", "Buddy Hield", "Jamal Murray", "Pascal Siakam"],
            2017: ["Jayson Tatum", "Lonzo Ball", "Donovan Mitchell", "De'Aaron Fox", "Bam Adebayo", "Lauri Markkanen"],
            2018: ["Luka Doncic", "Trae Young", "Deandre Ayton", "Jaren Jackson Jr.", "Shai Gilgeous-Alexander", "Michael Porter Jr."],
            2019: ["Zion Williamson", "Ja Morant", "RJ Barrett", "Darius Garland", "Tyler Herro", "De'Andre Hunter"],
            2020: ["Anthony Edwards", "LaMelo Ball", "Tyrese Haliburton", "James Wiseman", "Isaac Okoro", "Patrick Williams"],
            2021: ["Cade Cunningham", "Evan Mobley", "Scottie Barnes", "Jalen Green", "Jalen Suggs", "Franz Wagner"],
            2022: ["Paolo Banchero", "Chet Holmgren", "Jabari Smith Jr.", "Keegan Murray", "Jaden Ivey", "Bennedict Mathurin"],
            2023: ["Victor Wembanyama", "Scoot Henderson", "Brandon Miller", "Amen Thompson", "Ausar Thompson", "Bilal Coulibaly"],
            2024: ["Zaccharie Risacher", "Alex Sarr", "Reed Sheppard", "Stephon Castle", "Matas Buzelis", "Rob Dillingham"],
        }
        
        # Invert for easier lookup
        PLAYER_HYPE_MAP = {}
        for player in HYPE_DATA["Tier S"]: PLAYER_HYPE_MAP[player] = 10.0
        for player in HYPE_DATA["Tier A"]: PLAYER_HYPE_MAP[player] = 5.0
        for player in HYPE_DATA["Tier B"]: PLAYER_HYPE_MAP[player] = 2.0
        
        def get_hype_multiplier(player_name):
            return PLAYER_HYPE_MAP.get(player_name, 1.0) # Default Tier C = 1.0

        # 2. Scoring Helper
        def calculate_score(row):
            # Weights: Logoman=1000, Case Hit=500, Auto/Mem=20, Base=1
            score = 0
            if "🔥 Logoman" == row['Category']:
                score = 1000
            elif "✨ Case Hit" == row['Category']:
                score = 500
            elif "💎 Auto/Mem" == row['Category']:
                score = 20
            else:
                score = 1
            return score

        def rarity_multiplier(numbering):
            try:
                num = int(float(numbering))
            except (ValueError, TypeError):
                return 1.0
            if num <= 0:
                return 1.0
            mult = 1.0 + (100.0 / num)
            return min(mult, 10.0)

        def parse_numbering(value):
            try:
                return int(float(value))
            except (ValueError, TypeError):
                return None

        # ... (Existing categorize_card helper is above) ...
        def categorize_card(box_type):
            box_type_str = str(box_type).lower()
            
            # 1. Logoman (Top Priority)
            if "logoman" in box_type_str:
                return "🔥 Logoman"
            
            # 2. Case Hits (New Priority)
            case_hits_keywords = [
                'downtown', 'micro', 'micro mosaic',
                'stained glass', 'strined glass', 'color blast', 'kaboom',
                'manga', 'sublime', 'night moves',
                'profile', 'micro-etch', 'photon', 'vortex',
                'genesis', 'glass mosaic', 'color wheel',
                'fanatical inserts', 'ultra violet', '451', 'radiating rookies',
                'advisory', 'paradox', "let's go!", 'glass canvas',
                'patented', 'finals', 'rock stars'
            ] # Expanded common case hits + typos
            if any(k in box_type_str for k in case_hits_keywords):
                return "✨ Case Hit"

            # 3. Auto/Mem
            elif any(k in box_type_str for k in ['auto', 'signature', 'patch', 'relic', 'mem', 'jersey']):
                return "💎 Auto/Mem"
            else:
                return "📄 Base/Autre"

        # --- Filters ---
        all_products = sorted(df['Product'].dropna().unique().tolist())
        selected_products = st.multiselect("Filtrer par produit :", all_products, default=all_products)
        if selected_products:
            df = df[df['Product'].isin(selected_products)]
            df_p = df_p[df_p['Product'].isin(selected_products)]
            df_t = df_t[df_t['Product'].isin(selected_products)]

        # --- Scoring prep ---
        df['Category'] = df['Box Type'].apply(categorize_card)
        df['Rarity Mult'] = df['Numbering'].apply(rarity_multiplier)
        df['Score'] = df.apply(calculate_score, axis=1) * df['Rarity Mult']

        # Rebuild exploded frames after scoring/filtering
        df_p = df.copy()
        df_p['Player'] = df_p['Player'].astype(str).str.split('/')
        df_p = df_p.explode('Player')
        df_p['Player'] = df_p['Player'].str.strip()

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
            st.info("Filtre sur les mots clés : Auto, Signature, Patch, Relic, Mem, Jersey")
            
            # Keywords for filtering
            keywords = ['auto', 'signature', 'patch', 'relic', 'mem', 'jersey']
            pattern = '|'.join(keywords)
            
            # Filter Dataframes
            # We filter the exploded dataframes
            df_p_filtered = df_p[df_p['Box Type'].astype(str).str.contains(pattern, case=False, na=False)]
            df_t_filtered = df_t[df_t['Box Type'].astype(str).str.contains(pattern, case=False, na=False)]
            
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
            st.info("Filtre sur le mot clé : Logoman")
            
            # Filter Dataframes
            df_p_logoman = df_p[df_p['Box Type'].astype(str).str.contains("logoman", case=False, na=False)]
            df_t_logoman = df_t[df_t['Box Type'].astype(str).str.contains("logoman", case=False, na=False)]
            
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
            st.info("Filtre sur : DOWNTOWN, KABOOM, COLOR BLAST, MANGA, SUBLIME, GENESIS, VORTEX...")
            
            # Filter Dataframes by category (relies on categorization done previously/on-the-fly? No, we filter by box_type string to be safe or re-use helper)
            # To be consistent with other blocks, let's filter by string content, BUT leveraging the categorize_card function logic is better.
            # However, other blocks do str.contains. Let's stick to the pattern used in categorize_card
            
            case_hits_keywords = [
                'downtown', 'micro', 'micro mosaic',
                'stained glass', 'strined glass', 'color blast', 'kaboom',
                'manga', 'sublime', 'night moves',
                'profile', 'micro-etch', 'photon', 'vortex',
                'genesis', 'glass mosaic', 'color wheel',
                'fanatical inserts', 'ultra violet', '451', 'radiating rookies',
                'advisory', 'paradox', "let's go!", 'glass canvas',
                'patented', 'finals', 'rock stars'
            ]
            pattern = '|'.join(case_hits_keywords)
            
            df_p_ch = df_p[df_p['Box Type'].astype(str).str.contains(pattern, case=False, na=False)]
            df_t_ch = df_t[df_t['Box Type'].astype(str).str.contains(pattern, case=False, na=False)]
            
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
            
            selected_players_comp = st.multiselect("Choix des joueurs :", all_players_comp)
            
            if selected_players_comp:
                comparison_data = []
                
                for p in selected_players_comp:
                    # Filter data
                    p_data = df_p[df_p['Player'] == p].copy()
                    p_data['Category'] = p_data['Box Type'].apply(categorize_card)
                    p_data['Rarity Mult'] = p_data['Numbering'].apply(rarity_multiplier)
                    
                    total = p_data['Hits'].sum()
                    cat_counts = p_data['Category'].value_counts()
                    logo = cat_counts.get("🔥 Logoman", 0)
                    case_hit = cat_counts.get("✨ Case Hit", 0)
                    auto = cat_counts.get("💎 Auto/Mem", 0)
                    base = cat_counts.get("📄 Base/Autre", 0)
                    score = (p_data.apply(calculate_score, axis=1) * p_data['Rarity Mult']).sum()
                    
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
            player_scores["Hype"] = player_scores["Player"].apply(get_hype_multiplier)
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
            rookie_rows = [
                {"Annee": year, "Top 6": ", ".join(names)}
                for year, names in sorted(TOP_ROOKIES_BY_YEAR.items())
            ]
            st.dataframe(pd.DataFrame(rookie_rows), use_container_width=True)

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
                file_df['Category'] = file_df['Box Type'].apply(categorize_card)
                
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
                
                # --- Categorization Logic (Using Helper) ---
                player_data['Category'] = player_data['Box Type'].apply(categorize_card)
                
                # Metrics
                total_hits = player_data['Hits'].sum()
                
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
                filter_cat = st.radio("Filtrer le tableau par type :", ["Tous", "🔥 Logoman", "✨ Case Hit", "💎 Auto/Mem", "📄 Base/Autre"], horizontal=True)
                max_serial_p = st.number_input("Filtre numérotation (<= /xx)", min_value=0, value=0, step=1, key="player_serial")
                
                if filter_cat != "Tous":
                    display_df = player_data[player_data['Category'] == filter_cat]
                else:
                    display_df = player_data
                if max_serial_p > 0:
                    display_df = display_df[
                        display_df['Numbering'].apply(parse_numbering).fillna(0) <= max_serial_p
                    ]

                st.dataframe(display_df[['Category', 'Box Type', 'Numbering', 'Team', 'Hits', 'File']], use_container_width=True)

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
    1.  Utilisez des fichiers Excel contenant un onglet **'Teams_clean'**.
    2.  Colonnes attendues : **Player**, **Team**, **Card Type**, **Numbering**.
    3.  Vous pouvez déposer des fichiers via l'upload cloud ou les mettre dans le dossier local.
    4.  Cliquez sur **Lancer l'analyse** pour voir les stats.
    """)
