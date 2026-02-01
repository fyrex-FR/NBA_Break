import pandas as pd
import os

base_dir = '/Users/fyrex/antiGravityCode/checklists_clean_shaks'
checklist_path = os.path.join(base_dir, '2023-24-Donruss-Optic-Basketball-Checklist.xlsx')

try:
    xls = pd.ExcelFile(checklist_path)
    print(f"Sheet names in {checklist_path}: {xls.sheet_names}")
    
    if "Teams_clean" in xls.sheet_names:
        df = pd.read_excel(checklist_path, sheet_name="Teams_clean")
        print("\n--- Inspecting Teams_clean sheet ---")
        print("Columns:", df.columns.tolist())
        print("First 5 rows:")
        print(df.head().to_string())
    else:
        print("\n'Teams_clean' sheet NOT found.")

except Exception as e:
    print(f"Error reading checklist file: {e}")
