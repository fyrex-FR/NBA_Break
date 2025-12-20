
import pandas as pd
import os

file_path = "checklists/2025-26-Topps-Chrome-Basketball-Checklist.xlsx"

try:
    if os.path.exists(file_path):
        print(f"Reading {file_path}...")
        df = pd.read_excel(file_path, sheet_name='Teams', engine='openpyxl')
        print("Columns:", df.columns.tolist())
        print("Shape:", df.shape)
        print("First 5 rows:")
        print(df.head())
    else:
        print(f"File {file_path} not found.")
except Exception as e:
    print(f"Error: {e}")
