
import pandas as pd
import os

file_path = "checklists/2025-26-Topps-Chrome-Basketball-Checklist.xlsx"

try:
    if os.path.exists(file_path):
        # Use header=None to be safe
        df = pd.read_excel(file_path, sheet_name='Teams', header=None, usecols="A,C,D", engine='openpyxl')
        df.columns = ["Box Type", "Player", "Team"]
        
        # Filter for keywords in Box Type
        keywords = ['auto', 'signature', 'patch', 'relic', 'mem', 'jersey']
        pattern = '|'.join(keywords)
        
        matches = df[df['Box Type'].astype(str).str.contains(pattern, case=False, na=False)]
        
        print(f"Found {len(matches)} Auto/Mem rows.")
        print("Checking first 10 for NaN/Empty Player or Team:")
        print(matches.head(10))
        
        # Check specific NaN
        nans = matches[matches['Player'].isna() | matches['Team'].isna()]
        if not nans.empty:
            print(f"\nFound {len(nans)} rows with NaN Player/Team in Auto group:")
            print(nans.head())
        else:
            print("\nNo NaN Player/Team found in Auto group.")
            
        # Check if Player looks valid
        print("\nSample Players in Auto group:")
        print(matches['Player'].unique()[:10])

    else:
        print(f"File {file_path} not found.")
except Exception as e:
    print(f"Error: {e}")
