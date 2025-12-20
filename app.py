import streamlit as st
import pandas as pd
import os
import glob
import plotly.express as px
import re
import openai

def extract_year(filename):
    match = re.search(r"(\d{4}-\d{2})", filename)
    return match.group(1) if match else "Inconnue"

# API Key Config (Provided by User)
# Note: In production, use st.secrets or environment variables
OPENAI_API_KEY = st.secrets["OPENAI_API_KEY"]

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
    <div style="display: flex; justify-content: center; align_items: center; gap: 20px; margin-bottom: 20px;">
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
default_data_dir = os.path.join(base_dir, "checklists")

if not os.path.exists(default_data_dir):
    os.makedirs(default_data_dir)

# Advanced mode: Custom path
with st.sidebar.expander("Configuration Avancée (Chemin)"):
    folder_path = st.text_input("Chemin du dossier", value=default_data_dir)

# 1. Scan for files first
if os.path.isdir(folder_path):
    found_files = glob.glob(os.path.join(folder_path, "*.xlsx"))
else:
    found_files = []

# --- CLOUD UPLOAD SUPPORT ---
st.sidebar.markdown("### ☁️ Upload (Cloud/Web)")
uploaded_files = st.sidebar.file_uploader(
    "Ajouter des fichiers Excel", 
    type=['xlsx'], 
    accept_multiple_files=True
)

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
        st.session_state.all_files_selected = True

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
                     st.session_state[chk_key] = True 
                
                # Checkbox controlling state
                is_checked = st.checkbox(f_name, key=chk_key)
                
                if is_checked:
                    selected_file_paths.append(f_path)

if st.sidebar.button("🚀 Lancer l'analyse", type="primary"):
    st.session_state['scan_triggered'] = True
    # Merge local selected files AND uploaded files
    st.session_state['selected_files'] = selected_file_paths + uploaded_files

# --- Main Logic ---

def load_data(file_list):
    if not file_list:
        return None, "Aucun fichier sélectionné."

    combined_data = []
    files_processed = 0
    
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
            
        status_text.text(f"Lecture de : {filename}")
        try:
            # Extract Year from filename (e.g. "2023-24")
            year_match = re.search(r"(\d{4}-\d{2})", filename)
            box_year = year_match.group(1) if year_match else "Inconnue"
            
            # Read Excel
            try:
                # Try standard format first: C=Player, D=Team, F=Box Type
                df = pd.read_excel(source, sheet_name='Teams', usecols="C,D,F", engine='openpyxl')
                df.columns = ["Player", "Team", "Box Type"]
            except ValueError:
                # Fallback for formats with fewer columns (e.g. 2025-26): A=Box Type, C=Player, D=Team
                # Use header=None because these files often lack headers or have them on row 1 which gets consumed
                df = pd.read_excel(source, sheet_name='Teams', usecols="A,C,D", header=None, engine='openpyxl')
                df.columns = ["Box Type", "Player", "Team"]
                # Reorder to standard
                df = df[["Player", "Team", "Box Type"]]
            
            # Clean data
            df = df.dropna(subset=['Player', 'Team'])
            
            # Remove trailing commas from names (common in new checklists)
            df['Player'] = df['Player'].astype(str).str.replace(r',$', '', regex=True)

            
            # Add metadata
            df['Hits'] = 1
            df['File'] = filename # Track source file
            df['Year'] = box_year
            
            combined_data.append(df)
            files_processed += 1
            
        except Exception as e:
            st.warning(f"Erreur sur {filename}: {e}")
        
        progress_bar.progress((i + 1) / len(file_list))

    status_text.empty()
    progress_bar.empty()
    
    if not combined_data:
        return None, "Aucun onglet 'Teams' trouvé ou données valides extraites."
        
    return pd.concat(combined_data, ignore_index=True), f"{files_processed} fichiers traités."

# --- Display ---

if 'scan_triggered' in st.session_state and st.session_state['scan_triggered']:
    # Use selected files from session state
    target_files = st.session_state.get('selected_files', [])
    df, msg = load_data(target_files)
    
    if df is not None:
        st.success(msg)
        
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

        # Navigation Bar
        views = ["🌍 Vue Globale", "💎 Autos & Patchs", "🔥 Logoman", "✨ Case Hits", "👥 Multi-Joueurs", "⚖️ Comparateur Joueurs", "📤 Export & Analyse AI", "📂 Par Fichier", "🔍 Analyse Joueur", "🛡️ Analyse Équipe"]
        
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

        # ... (Existing categorize_card helper is above) ...
        def categorize_card(box_type):
            box_type_str = str(box_type).lower()
            
            # 1. Logoman (Top Priority)
            if "logoman" in box_type_str:
                return "🔥 Logoman"
            
            # 2. Case Hits (New Priority)
            case_hits_keywords = ['downtown', 'micro', 'stained glass', 'strined glass', 'manga', 'sublime', 'kaboom', 'color blast'] # Added common valid case hits + user typos
            if any(k in box_type_str for k in case_hits_keywords):
                return "✨ Case Hit"

            # 3. Auto/Mem
            elif any(k in box_type_str for k in ['auto', 'signature', 'patch', 'relic', 'mem', 'jersey']):
                return "💎 Auto/Mem"
            else:
                return "📄 Base/Autre"

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
                st.session_state['active_view'] = "🔍 Analyse Joueur"
                st.rerun()

            # --- Top 15 Logic ---
            col1, col2 = st.columns(2)
            
            with col1:
                st.subheader("🏆 Classement Joueurs (Global)")
                st.markdown("*(Cliquez sur une ligne pour voir le détail)*")
                
                # Full sorted list for Table
                sorted_players = player_stats.sort_values(by='Hits', ascending=False)
                
                # Dataframe with selection
                event_p = st.dataframe(
                    sorted_players, 
                    use_container_width=True, 
                    selection_mode="single-row", 
                    on_select="rerun",
                    key="global_players_table"
                )
                
                # Handle Selection
                if len(event_p.selection.rows) > 0:
                    row_idx = event_p.selection.rows[0]
                    selected_player_name = sorted_players.iloc[row_idx]['Player']
                    st.session_state['target_player'] = selected_player_name
                    st.session_state['active_view'] = "🔍 Analyse Joueur"
                    st.rerun()

                # Top 15 for Chart
                fig_p = px.bar(sorted_players.head(15), x='Player', y='Hits', title="Top 15 Joueurs", color='Hits')
                st.plotly_chart(fig_p, use_container_width=True)

            with col2:
                st.subheader("🛡️ Classement Équipes (Global)")
                st.markdown("*(Cliquez sur une ligne pour voir le détail)*")
                
                # Full sorted list for Table
                sorted_teams = team_stats.sort_values(by='Hits', ascending=False)
                
                # Dataframe with selection
                event_t = st.dataframe(
                    sorted_teams, 
                    use_container_width=True, 
                    selection_mode="single-row", 
                    on_select="rerun",
                    key="global_teams_table"
                )

                # Handle Selection
                if len(event_t.selection.rows) > 0:
                    row_idx = event_t.selection.rows[0]
                    selected_team_name = sorted_teams.iloc[row_idx]['Team']
                    st.session_state['target_team'] = selected_team_name
                    st.session_state['active_view'] = "🛡️ Analyse Équipe"
                    st.rerun()
                
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
                
                if len(event_pf.selection.rows) > 0:
                    row_idx = event_pf.selection.rows[0]
                    selected_player_name = sorted_players_f.iloc[row_idx]['Player']
                    st.session_state['target_player'] = selected_player_name
                    st.session_state['active_view'] = "🔍 Analyse Joueur"
                    st.rerun()
                    
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
                
                if len(event_tf.selection.rows) > 0:
                    row_idx = event_tf.selection.rows[0]
                    selected_team_name = sorted_teams_f.iloc[row_idx]['Team']
                    st.session_state['target_team'] = selected_team_name
                    st.session_state['active_view'] = "🛡️ Analyse Équipe"
                    st.rerun()
                    
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
                
                if len(event_pl.selection.rows) > 0:
                    row_idx = event_pl.selection.rows[0]
                    selected_player_name = sorted_players_l.iloc[row_idx]['Player']
                    st.session_state['target_player'] = selected_player_name
                    st.session_state['active_view'] = "🔍 Analyse Joueur"
                    st.rerun()
                    
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
                
                if len(event_tl.selection.rows) > 0:
                    row_idx = event_tl.selection.rows[0]
                    selected_team_name = sorted_teams_l.iloc[row_idx]['Team']
                    st.session_state['target_team'] = selected_team_name
                    st.session_state['active_view'] = "🛡️ Analyse Équipe"
                    st.rerun()
                    
                fig_tl = px.bar(sorted_teams_l.head(15), x='Team', y='Hits', color='Hits')
                st.plotly_chart(fig_tl, use_container_width=True)

        elif selection == "✨ Case Hits":
            st.subheader("✨ Analyse Case Hits (Downtown, Manganese, Stained Glass...)")
            # Keywords display
            st.info("Filtre sur : DOWNTOWN, MICRO MOSAIC, STAINED GLASS, MANGA, SUBLIME")
            
            # Filter Dataframes by category (relies on categorization done previously/on-the-fly? No, we filter by box_type string to be safe or re-use helper)
            # To be consistent with other blocks, let's filter by string content, BUT leveraging the categorize_card function logic is better.
            # However, other blocks do str.contains. Let's stick to the pattern used in categorize_card
            
            case_hits_keywords = ['downtown', 'micro', 'stained glass', 'strined glass', 'manga', 'sublime', 'kaboom', 'color blast']
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
                
                if len(event_pch.selection.rows) > 0:
                    row_idx = event_pch.selection.rows[0]
                    selected_player_name = sorted_players_ch.iloc[row_idx]['Player']
                    st.session_state['target_player'] = selected_player_name
                    st.session_state['active_view'] = "🔍 Analyse Joueur"
                    st.rerun()
                    
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
                
                if len(event_tch.selection.rows) > 0:
                    row_idx = event_tch.selection.rows[0]
                    selected_team_name = sorted_teams_ch.iloc[row_idx]['Team']
                    st.session_state['target_team'] = selected_team_name
                    st.session_state['active_view'] = "🛡️ Analyse Équipe"
                    st.rerun()
                    
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
                    
                    total = p_data['Hits'].sum()
                    cat_counts = p_data['Category'].value_counts()
                    logo = cat_counts.get("🔥 Logoman", 0)
                    case_hit = cat_counts.get("✨ Case Hit", 0)
                    auto = cat_counts.get("💎 Auto/Mem", 0)
                    base = cat_counts.get("📄 Base/Autre", 0)
                    
                    comparison_data.append({
                        "Joueur": p,
                        "Total Cartes": total,
                        "🔥 Logoman": logo,
                        "✨ Case Hit": case_hit,
                        "💎 Auto/Mem": auto,
                        "📄 Base/Autre": base
                    })
                
                comp_df = pd.DataFrame(comparison_data)
                
                # Sorting option? Default by Total
                st.dataframe(comp_df.sort_values(by="Total Cartes", ascending=False), use_container_width=True)
                
                # Chart
                fig_comp = px.bar(comp_df, x="Joueur", y=["🔥 Logoman", "✨ Case Hit", "💎 Auto/Mem", "📄 Base/Autre"], title="Comparaison Visuelle", barmode='stack')
                st.plotly_chart(fig_comp, use_container_width=True)

        elif selection == "📤 Export & Analyse AI":
            st.subheader("🤖 Analyse AI (GPT-4o-mini)")
            st.info("L'intelligence artificielle analyse vos checklists pour trouver les meilleures opportunités.")
            
            # Prepare Export Data
            df_export = df_p.copy()
            df_export['Category'] = df_export['Box Type'].apply(categorize_card)
            
            # --- HARDCODED ROOKIE LOGIC (To help AI) ---
            # --- HARDCODED ROOKIE LOGIC (To help AI) ---
            ROOKIE_DB = {
                "2023-24": ["Victor Wembanyama", "Brandon Miller", "Scoot Henderson", "Amen Thompson", "Ausar Thompson", "Jaime Jaquez Jr", "Brandin Podziemski"],
                "2024-25": ["Zaccharie Risacher", "Alex Sarr", "Reed Sheppard", "Stephon Castle", "Ron Holland", "Tidjane Salaun", "Rob Dillingham", "Zach Edey"],
                "2022-23": ["Paolo Banchero", "Chet Holmgren", "Jabari Smith Jr", "Keegan Murray", "Jaden Ivey"],
                "2021-22": ["Cade Cunningham", "Jalen Green", "Evan Mobley", "Scottie Barnes", "Josh Giddey", "Franz Wagner"],
                "2020-21": ["Anthony Edwards", "LaMelo Ball", "Tyrese Haliburton", "Tyrese Maxey"]
            }
            
            def get_rookie_status(row):
                year = row['Year']
                player = row['Player']
                box_type = str(row['Box Type']).lower()
                
                status = "❌ Vet / Minor" # Default
                
                # 1. Dynamic Detection (User Request)
                # If the card name explicitly says "Rookie", "RC", "Rated Rookie"...
                if "rookie" in box_type or " rc" in box_type or "rated rookie" in box_type:
                    status = "✅ ROOKIE (Detected)"

                # 2. DB Validation (Overrules/Refines)
                if year in ROOKIE_DB:
                    for r_name in ROOKIE_DB[year]:
                        if r_name.lower() in player.lower():
                            status = "✅ ROOKIE (Star)"
                            break
                            
                return status

            df_export['Rookie_Status'] = df_export.apply(get_rookie_status, axis=1)
            
            # Select relevant columns for Manual Export
            final_export = df_export[['Year', 'File', 'Team', 'Player', 'Rookie_Status', 'Category', 'Box Type']]
            
            # --- AGGREGATION TO SAVE TOKENS ---
            # Instead of sending every single row, we group identical cards
            # This massively reduces token usage (e.g. 50 base cards = 1 row)
            df_ai_summary = df_export.groupby(
                ['Year', 'Team', 'Player', 'Rookie_Status', 'Category']
            ).size().reset_index(name='Card_Count')
            
            # Sort by "Critical" cards first to ensure they are in the context window
            # Order: Category (Logoman/Auto) -> Rookie Status -> Count
            df_ai_summary['Priority'] = df_ai_summary['Category'].map({"🔥 Logoman": 4, "✨ Case Hit": 3, "💎 Auto/Mem": 2, "📄 Base/Autre": 1})
            df_ai_summary = df_ai_summary.sort_values(by=['Priority', 'Card_Count'], ascending=[False, False]).drop(columns=['Priority'])

            col_ai1, col_ai2 = st.columns([1, 1])
            
            with col_ai1:
                st.markdown("#### 1. Données à analyser (Agrégées)")
                st.dataframe(df_ai_summary.head(10), use_container_width=True)
                st.caption(f"Données compressées : {len(df_ai_summary)} lignes envoyées (au lieu de {len(df_export)}).")

            with col_ai2:
                st.markdown("#### 2. Contexte & Prix")
                user_context = st.text_area(
                    "Indiquez ici les prix des spots.",
                    height=150,
                    placeholder="Exemple:\nLakers: 200$\nSpurs: 350$\nWarriors: 120$\n\nQuel est le meilleur rapport qualité/prix ?"
                )
                
                analyze_btn = st.button("✨ Lancer l'analyse GPT-4o", type="primary")

            if analyze_btn:
                if not user_context:
                    st.warning("Merci d'indiquer des prix ou un contexte pour guider l'IA.")
                else:
                    with st.spinner("Compression des données et Analyse IA en cours..."):
                        try:
                            # 1. Convert Data to CSV String (Use the SUMMARY dataframe)
                            csv_data = df_ai_summary.to_csv(index=False)
                            
                            # 2. Construct Prompt
                            prompt = f"""
                            Tu es un expert mondial en investissement sur les cartes NBA.
                            
                            --- DONNÉES SYNTHÉTISÉES ---
                            Je t'ai mâché une partie du travail (colonne 'Rookie_Status') :
                            - '✅ ROOKIE (Star)' = Confirmé par ma base de données.
                            - '✅ ROOKIE (Detected)' = Le mot "Rookie" est écrit sur la carte.
                            - '❌ Vet / Minor' = Vétéran ou joueur mineur.
                            
                            ⚠️ TÂCHE EXPERTE SUPPLÉMENTAIRE :
                            Mes données ne sont pas parfaites. UTILISE TON SAVOIR pour identifier les "Rookie Stars" qui seraient seulement notées "Detected" ou "Unchecked".
                            Exemple : Si tu vois "Zach Edey" ou "Reed Sheppard" en 2024-25, considère-les comme des STARS même si je ne l'ai pas explicitement dit.
                            
                            CSV :
                            {csv_data}
                            
                            PRIX DES SPOTS (Donnés par l'utilisateur) :
                            {user_context}
                            
                            --- MISSION ---
                            Trouve les meilleurs ratios (Valeur Totale Estimée / Prix du Spot).
                            
                            Calcul Mental Indicatif (Score) :
                            - Logoman = 1000 pts
                            - Case Hit (Downtown, etc.) = 500 pts
                            - Auto/Mem (Star/Rookie Star) = 100 pts
                            - Auto/Mem (Rookie mineur) = 20 pts
                            - Base (Star Rookie) = 10 pts
                            
                            Rapport :
                            1. 🏆 TOP 3 RENTABILITÉ : Spots sous-cotés (Undervalued).
                            2. 🛑 ATTENTION aux faux amis : Spots chers avec que du 'Vet / Minor'.
                            """
                            
                            client = openai.OpenAI(api_key=OPENAI_API_KEY)
                            
                            response = client.chat.completions.create(
                                model="gpt-4o-mini",
                                messages=[
                                    {"role": "system", "content": "Tu es un assistant expert en Trading Cards NBA."},
                                    {"role": "user", "content": prompt}
                                ],
                                max_tokens=1500
                            )
                            
                            analysis = response.choices[0].message.content
                            
                            st.success("Analyse terminée !")
                            st.markdown("### 🧠 Rapport de l'IA")
                            st.markdown(analysis)
                            
                        except Exception as e:
                            st.error(f"Erreur lors de l'appel AI : {e}")

            st.markdown("---")
            st.subheader("📥 Export Manuel")
            csv = final_export.to_csv(index=False).encode('utf-8')
            st.download_button(
                label="Télécharger le fichier CSV",
                data=csv,
                file_name='card_optimizer_export.csv',
                mime='text/csv',
            )

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
                
                if filter_cat != "Tous":
                    display_df = player_data[player_data['Category'] == filter_cat]
                else:
                    display_df = player_data

                st.dataframe(display_df[['Category', 'Box Type', 'Team', 'Hits', 'File']], use_container_width=True)

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
                     st.dataframe(team_df_sub, use_container_width=True)


            
    else:
        st.error(msg)

else:
    st.info("👈 Entrez le chemin du dossier et cliquez sur 'Scanner le dossier' pour commencer.")
    
    # Tutorial / Placeholder
    st.markdown("### Comment ça marche ?")
    st.markdown("""
    1.  Assurez-vous que vos fichiers Excel sont dans un dossier.
    2.  Chaque fichier doit avoir un onglet nommé **'Teams'**.
    3.  L'app lit les colonnes **C (Joueur)**, **D (Équipe)** et **F (Tirage)**.
    4.  Cliquez sur **Scanner** pour voir les stats !
    """)
