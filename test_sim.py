import pandas as pd
from backend.services.break_engine import build_default_spots, SIM_METHOD_PLAYER_LETTER

df = pd.DataFrame({"Team List": [["Lakers"]], "Player List": [["LeBron"]]})
res = build_default_spots(df, "player_letter", ["John Cena"])
print(f"Result for player_letter: {res}")

res2 = build_default_spots(df, "player_letter")
print(f"Result with no extract: {res2}")

if not res:
    print("WARNING: EMPTY SPOTS RETURNED!")
else:
    print(f"Count: {len(res)}")
