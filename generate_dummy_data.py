import pandas as pd
import random

# Create dummy data
players = ["LeBron James", "Stephen Curry", "Kevin Durant", "Giannis Antetokounmpo", "Luka Doncic", 
           "Jayson Tatum", "Joel Embiid", "Nikola Jokic", "Ja Morant", "Trae Young",
           "Victor Wembanyama", "Anthony Edwards", "Devin Booker", "Jimmy Butler", "Damian Lillard",
           "Zion Williamson", "LaMelo Ball", "Tyrese Haliburton", "Shai Gilgeous-Alexander", "Donovan Mitchell"]

teams = ["Lakers", "Warriors", "Suns", "Bucks", "Mavericks", 
         "Celtics", "Sixers", "Nuggets", "Grizzlies", "Hawks",
         "Spurs", "Timberwolves", "Suns", "Heat", "Bucks",
         "Pelicans", "Hornets", "Pacers", "Thunder", "Cavaliers"]

data = []
for _ in range(100):
    idx = random.randint(0, len(players)-1)
    player = players[idx]
    team = teams[idx] # Simplified: player always matches index team for consistency in dummy data
    count = random.choice([10, 25, 49, 99, 199, '/'])
    box_type = random.choice(["Base", "Autograph", "Jersey", "Insert", "Parallel", "Rookie"])
    
    # Structure based on screenshot: Col A=Box Type, Col C=Player, D=Team, F=Count
    row = [box_type, None, player, team, None, count]
    data.append(row)

df = pd.DataFrame(data)

# Write to Excel
with pd.ExcelWriter("dummy_cards.xlsx") as writer:
    df.to_excel(writer, sheet_name="Teams", header=False, index=False)

print("Created dummy_cards.xlsx")
