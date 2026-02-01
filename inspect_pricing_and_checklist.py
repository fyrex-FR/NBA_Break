import pandas as pd
import os

base_dir = '/Users/fyrex/antiGravityCode/checklists_clean_shaks'
prix_joueurs_path = os.path.join(base_dir, 'PrixJoueurs.xlsx')
checklist_path = os.path.join(base_dir, '2023-24-Donruss-Optic-Basketball-Checklist.xlsx')

try:
    print(f"--- Inspecting {prix_joueurs_path} ---")
    df_prix = pd.read_excel(prix_joueurs_path)
    print("Columns:", df_prix.columns.tolist())
    print("First 5 rows:")
    print(df_prix.head().to_string())
except Exception as e:
    print(f"Error reading PrixJoueurs.xlsx: {e}")

try:
    print(f"\n--- Inspecting {checklist_path} ---")
    df_check = pd.read_excel(checklist_path)
    print("Columns:", df_check.columns.tolist())
    print("First 5 rows:")
    print(df_check.head().to_string())
except Exception as e:
    print(f"Error reading checklist file: {e}")
