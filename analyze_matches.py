import pandas as pd
import os
import glob
import re

base_dir = '/Users/fyrex/antiGravityCode/checklists_clean_shaks'
prix_joueurs_path = os.path.join(base_dir, 'PrixJoueurs.xlsx')

def normalize_key(name):
    # Strict normalization for matching logic
    # Remove dots, commas, extra spaces, upper case
    if not isinstance(name, str): return ""
    clean = re.sub(r'[.,]', '', name)
    return re.sub(r'\s+', ' ', clean).strip().upper()

def main():
    print("--- Loading Data ---")
    df_target = pd.read_excel(prix_joueurs_path)
    target_names = df_target['joueur'].dropna().astype(str).tolist()
    
    print(f"Loaded {len(target_names)} players from PrixJoueurs.xlsx")

    # Gather ALL checklist players
    checklist_players = set()
    checklist_files = glob.glob(os.path.join(base_dir, "*.xlsx"))
    checklist_files = [f for f in checklist_files if "PrixJoueurs.xlsx" not in f]

    print(f"Scanning {len(checklist_files)} checklist files...")
    
    raw_checklist_names = set()

    for file_path in checklist_files:
        try:
            df = pd.read_excel(file_path, sheet_name="Teams_clean", engine='openpyxl')
            
            # Find player column
            lower_map = {str(c).lower().strip(): c for c in df.columns}
            if 'player' in lower_map:
                col = lower_map['player']
                names = df[col].dropna().astype(str).tolist()
                for n in names:
                    # Handle multiple players "Player A / Player B"
                    parts = n.split('/')
                    for p in parts:
                        raw_checklist_names.add(p.strip())
                        checklist_players.add(normalize_key(p))
        except:
            pass
            
    print(f"Found {len(raw_checklist_names)} unique raw player names in checklists.")
    
    # Check mismatches
    unmatched = []
    for name in target_names:
        norm = normalize_key(name)
        if norm not in checklist_players:
            unmatched.append(name)
            
    print(f"\n--- Analysis: {len(unmatched)} players in PrixJoueurs NOT strictly found in checklists ---")
    print("(Top 20 unmatched)")
    for u in unmatched[:20]:
        print(f"MISSING: '{u}'")

    # Suggest matches for "JR" vs "JR."
    print("\n--- Potential 'JR' Fixes ---")
    # Dictionary of normalized_no_suffix -> full_name_in_checklist
    # To detect if 'Smith Jr' matches 'Smith Jr.'
    
    # Let's try to find fuzzy matches for the missing ones
    # specifically targeting the suffix issue user mentioned
    
    import difflib
    
    checklist_list = list(raw_checklist_names)
    
    for u in unmatched:
        # 1. Check dot removal explicitly if not handled by normalize
        # My normalize_key REMOVES dots. So if it didn't match, it means even without dots they are different.
        # Wait, if Checklist has "Trey Murphy III" and Target has "Trey Murphy", that's a diff issue.
        # If Checklist has "Kenyon Martin Jr." -> Norm: "KENYON MARTIN JR"
        # If Target has "Kenyon Martin Jr" -> Norm: "KENYON MARTIN JR"
        # They SHOULD have matched if my normalize matches.
        
        # If the user says they didn't match, maybe my previous script didn't normalize dots?
        # My previous script: re.sub(r',$', '', name.strip()).upper() -> ONLY REMOVED TRAILING COMMA.
        # It kept dots. So "Smith Jr." != "SMITH JR"
        
        # Let's see what close matches exist
        matches = difflib.get_close_matches(u, checklist_list, n=1, cutoff=0.8)
        if matches:
            print(f"'{u}'  could be  '{matches[0]}'")

if __name__ == "__main__":
    main()
