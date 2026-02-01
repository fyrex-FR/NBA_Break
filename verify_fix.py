import pandas as pd
import os

base_dir = '/Users/fyrex/antiGravityCode/checklists_clean_shaks'
prix_joueurs_path = os.path.join(base_dir, 'PrixJoueurs.xlsx')

def main():
    print("--- Verifying Fixes ---")
    df = pd.read_excel(prix_joueurs_path)
    
    # List of players we know were problematic
    targets = [
        "De'Aaron Fox", 
        "Karl-Anthony Towns", 
        "Trayce Jackson-Davis",
        "Wendell Carter Jr.",
        "Tyrese Haliburton",
        "Trey Murphy III"
    ]
    
    print(f"{'Player':<25} | {'Cards':<6} | {'Status'}")
    print("-" * 50)
    
    for t in targets:
        # Check if name exists now
        row = df[df['joueur'] == t]
        if not row.empty:
            count = row.iloc[0]['nb_cartes']
            status = "OK" if count > 0 else "ZERO"
            print(f"{t:<25} | {count:<6} | {status}")
        else:
            # Check if maybe case sensitivity issue or name mismatch
            # Try finding substring
            matches = df[df['joueur'].astype(str).str.contains(t, case=False)]
            if not matches.empty:
                 found_name = matches.iloc[0]['joueur']
                 count = matches.iloc[0]['nb_cartes']
                 print(f"{t:<25} | {count:<6} | FOUND AS '{found_name}'")
            else:
                 print(f"{t:<25} | MISS   | NOT FOUND")

if __name__ == "__main__":
    main()
