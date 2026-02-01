import pandas as pd
import os
import glob
import re

# Configuration
base_dir = '/Users/fyrex/antiGravityCode/checklists_clean_shaks'
prix_joueurs_path = os.path.join(base_dir, 'PrixJoueurs.xlsx')

def normalize_name(name):
    if not isinstance(name, str):
        return ""
    # Remove trailing commas and spaces, uppercase
    return re.sub(r',$', '', name.strip()).upper()

def categorize_card(box_type):
    box_type_str = str(box_type).lower()
    
    # 1. Logoman (Top Priority)
    if "logoman" in box_type_str:
        return "Logoman"
    
    # 2. Case Hits
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
    if any(k in box_type_str for k in case_hits_keywords):
        return "Case Hit"

    # 3. Auto/Mem
    if any(k in box_type_str for k in ['auto', 'signature', 'patch', 'relic', 'mem', 'jersey']):
        return "Auto_Mem"
    
    return "Base_Other"

def main():
    print(f"Loading {prix_joueurs_path}...")
    try:
        df_target = pd.read_excel(prix_joueurs_path)
    except Exception as e:
        print(f"Error loading PrixJoueurs.xlsx: {e}")
        return

    # Normalize target player names for matching
    if 'joueur' not in df_target.columns:
        print("Error: 'joueur' column not found in PrixJoueurs.xlsx")
        print("Columns found:", df_target.columns.tolist())
        return

    # Create a mapping dictionary to aggregate stats
    # Key: Normalized Player Name -> Value: { 'Total': 0, 'Auto_Mem': 0, 'Case_Hit': 0, 'Logoman': 0 }
    player_stats = {}
    
    # Initialize logic
    # We want to fill stats for players IN the list, but maybe we discover new ones? 
    # The user asked: "pour chaques joueurs que tu trouveras dans l'excel: PrixJoueurs ... tu m'aggreges"
    # So we only care about players IN PrixJoueurs.
    
    target_players = set([normalize_name(p) for p in df_target['joueur'].unique() if normalize_name(p)])
    print(f"Found {len(target_players)} unique players in PrixJoueurs.xlsx to track.")

    # Initialize stats for these players
    for p in target_players:
        player_stats[p] = {'Total': 0, 'Auto_Mem': 0, 'Case_Hit': 0, 'Logoman': 0}

    # Scan checklist files
    checklist_files = glob.glob(os.path.join(base_dir, "*.xlsx"))
    checklist_files = [f for f in checklist_files if "PrixJoueurs.xlsx" not in f]
    
    print(f"Found {len(checklist_files)} checklist files to process.")

    for file_path in checklist_files:
        filename = os.path.basename(file_path)
        # Skip temp files
        if filename.startswith("~$"):
            continue
            
        print(f"Processing {filename}...")
        try:
            # Check sheet availability (optimization: just try read)
            # We assume app.py logic: 'Teams_clean' is the target sheet
            df = pd.read_excel(file_path, sheet_name="Teams_clean", engine='openpyxl')
            
            # Normalize Columns
            df.columns = [str(c).strip() for c in df.columns]
            lower_map = {c.lower(): c for c in df.columns}
            
            player_col = None
            if "player" in lower_map: player_col = lower_map["player"]
            elif "Player" in df.columns: player_col = "Player"
            
            box_col = None
            if "box type" in lower_map: box_col = lower_map["box type"]
            elif "card type" in lower_map: box_col = lower_map["card type"]
            elif "boxtype" in lower_map: box_col = lower_map["boxtype"]
            
            if not player_col:
                print(f"  Warning: No 'Player' column found in {filename}. Skipping.")
                continue
            
            if not box_col:
                # If no box type, we count as base
                df['Box Type'] = ""
                box_col = 'Box Type'
                
            # Drop rows with no player
            df = df.dropna(subset=[player_col])
            
            # Iterate rows
            for _, row in df.iterrows():
                raw_player = str(row[player_col])
                box_type = row[box_col]
                
                # Split multi-players
                players = raw_player.split('/')
                
                card_category = categorize_card(box_type)
                
                for p_raw in players:
                    p_norm = normalize_name(p_raw)
                    
                    if p_norm in player_stats:
                        stats = player_stats[p_norm]
                        stats['Total'] += 1
                        
                        if card_category == 'Logoman':
                            stats['Logoman'] += 1
                        elif card_category == 'Case Hit':
                            stats['Case_Hit'] += 1
                        elif card_category == 'Auto_Mem':
                            stats['Auto_Mem'] += 1
                            
        except ValueError:
            print(f"  Skipping {filename}: 'Teams_clean' sheet not found.")
        except Exception as e:
            print(f"  Error processing {filename}: {e}")

    # Update DataFrame
    print("Updating PrixJoueurs.xlsx data...")
    
    # Define mapping functions using the stats dict
    def get_stat(player_name, stat_key):
        p_norm = normalize_name(player_name)
        return player_stats.get(p_norm, {}).get(stat_key, 0)

    # Add new columns
    df_target['nb_cartes'] = df_target['joueur'].apply(lambda x: get_stat(x, 'Total'))
    df_target['nb_auto_memo'] = df_target['joueur'].apply(lambda x: get_stat(x, 'Auto_Mem'))
    df_target['nb_case_hit'] = df_target['joueur'].apply(lambda x: get_stat(x, 'Case_Hit'))
    df_target['nb_logoman'] = df_target['joueur'].apply(lambda x: get_stat(x, 'Logoman'))

    # Save
    try:
        df_target.to_excel(prix_joueurs_path, index=False)
        print(f"Successfully updated {prix_joueurs_path}")
        print("First 5 rows of updated file:")
        print(df_target.head().to_string())
    except Exception as e:
        print(f"Error saving file: {e}")

if __name__ == "__main__":
    main()
