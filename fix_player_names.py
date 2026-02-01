import pandas as pd
import os
import glob
import re
import difflib

base_dir = '/Users/fyrex/antiGravityCode/checklists_clean_shaks'
prix_joueurs_path = os.path.join(base_dir, 'PrixJoueurs.xlsx')

def strict_normalize(name):
    # Removes all non-alphanumeric characters, converts to upper case
    if not isinstance(name, str): return ""
    # Keep only letters and numbers
    clean = re.sub(r'[^a-zA-Z0-9]', '', name)
    return clean.upper()

def main():
    print("--- 1. Loading Checklists to build Master Roster ---")
    checklist_files = glob.glob(os.path.join(base_dir, "*.xlsx"))
    checklist_files = [f for f in checklist_files if "PrixJoueurs.xlsx" not in f]

    # Map: strictly_normalized_name -> official_name (Counter to find most common capitalization if duplicates exist)
    # Actually just taking the first or strict set is fine.
    
    master_roster = {} # Key: StrictNorm, Value: OfficialName
    all_official_names = set()

    for file_path in checklist_files:
        try:
            df = pd.read_excel(file_path, sheet_name="Teams_clean", engine='openpyxl')
            # normalize cols
            df.columns = [str(c).strip() for c in df.columns]
            lower_map = {c.lower(): c for c in df.columns}
            
            if 'player' in lower_map:
                col = lower_map['player']
                names = df[col].dropna().astype(str).tolist()
                for n in names:
                    parts = n.split('/')
                    for p in parts:
                        p = p.strip()
                        # Clean up trailing comma if exists (sometimes in checklist too)
                        p = re.sub(r',$', '', p)
                        
                        s_norm = strict_normalize(p)
                        if s_norm:
                            # Prefer name with more punctuation/length usually? 
                            # Or just overwrite. Checklists are usually consistent.
                            if s_norm not in master_roster:
                                master_roster[s_norm] = p
                            all_official_names.add(p)
        except Exception as e:
            # print(f"Error reading {file_path}: {e}")
            pass
            
    print(f"Master Roster built: {len(master_roster)} unique normalized players.")
    
    print("\n--- 2. Processing PrixJoueurs.xlsx ---")
    df_target = pd.read_excel(prix_joueurs_path)
    
    original_names = df_target['joueur'].astype(str).tolist()
    new_names = []
    
    changes = []
    
    for original in original_names:
        s_norm = strict_normalize(original)
        
        match = None
        match_type = ""
        
        # Strategy 1: Strict Match (matches ignoring punctuation/spaces/case)
        if s_norm in master_roster:
            match = master_roster[s_norm]
            if match != original:
                match_type = "Strict (Format)"
        
        # Strategy 2: Fuzzy Match (if no strict match)
        else:
            # Use strict keys for fuzzy matching? No, use official names
            # Get close matches returns list
            candidates = difflib.get_close_matches(original, all_official_names, n=1, cutoff=0.7)
            if candidates:
                match = candidates[0]
                match_type = "Fuzzy"
        
        if match:
            # Only update if different
            # Note: exact string comparison
            if match != original:
                # Heuristic: Don't replace if it looks completely different?
                # Cutoff 0.7 is decent. 
                # Let's log it
                changes.append(f"{original} -> {match} ({match_type})")
                new_names.append(match)
            else:
                new_names.append(original)
        else:
            print(f"No match found for: {original}")
            new_names.append(original)

    df_target['joueur'] = new_names
    
    print(f"\n--- Saving {len(changes)} changes ---")
    for c in changes:
        print(c)
        
    df_target.to_excel(prix_joueurs_path, index=False)
    print("Done.")

if __name__ == "__main__":
    main()
