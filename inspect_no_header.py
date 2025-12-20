
import pandas as pd
import os

file_path = "checklists/2025-26-Topps-Chrome-Basketball-Checklist.xlsx"

try:
    if os.path.exists(file_path):
        print(f"Reading {file_path} with header=None...")
        df = pd.read_excel(file_path, sheet_name='Teams', header=None, engine='openpyxl')
        print("First 5 rows:")
        print(df.head())
        
        print("\nChecking columns C and D (indices 2 and 3) for Player/Team content...")
        print(df[[0, 2, 3]].head())
    else:
        print(f"File {file_path} not found.")
except Exception as e:
    print(f"Error: {e}")
