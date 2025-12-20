
import pandas as pd
import os

file_path = "checklists/2025-26-Topps-Chrome-Basketball-Checklist.xlsx"

try:
    if os.path.exists(file_path):
        print(f"Reading {file_path}...")
        # Read without header first to see raw structure if needed, but let's try to match the app logic
        # App logic fallback: usecols="A,C,D"
        df = pd.read_excel(file_path, sheet_name='Teams', usecols="A,C,D", engine='openpyxl')
        df.columns = ["Box Type", "Player", "Team"]
        
        print("Searching for 'Auto' or 'Patch' in 'Box Type' column...")
        
        # Filter rows containing keywords
        keywords = ['auto', 'signature', 'patch', 'relic', 'mem', 'jersey']
        pattern = '|'.join(keywords)
        
        matches = df[df['Box Type'].astype(str).str.contains(pattern, case=False, na=False)]
        
        print(f"Found {len(matches)} matches.")
        if not matches.empty:
            print("Sample matches:")
            print(matches.head())
            print("\nUnique values in 'Box Type' that match:")
            print(matches['Box Type'].unique())
        else:
            print("No matches found in 'Box Type' column (Column A).")
            print("Checking all columns for keywords...")
            # detailed scan of raw
            df_raw = pd.read_excel(file_path, sheet_name='Teams', engine='openpyxl')
            for col in df_raw.columns:
                mask = df_raw[col].astype(str).str.contains(pattern, case=False, na=False)
                if mask.any():
                    print(f"Found keywords in column '{col}':")
                    print(df_raw.loc[mask, col].unique()[:5])

    else:
        print(f"File {file_path} not found.")
except Exception as e:
    print(f"Error: {e}")
