import os
import re
from copy import deepcopy


DEFAULT_CATEGORY_RULES = {
    "logoman": ["logoman"],
    "case_hit": [
        # Classic Case Hits
        "downtown",
        "kaboom",
        "color blast",
        "black color blast",
        "manga",
        # Mosaic
        "stained glass",
        "micro mosaic",
        "razzle dazzle",
        # Revolution
        "vortex",
        "shock wave",
        "supernova",
        # Prizm
        "fireworks",
        "fractal",
        "kaleidoscopic",
        "deep space",
        "prizmania",
        # Select
        "tiger eyes",
        "leopard",
        "zebra",
        # Court Kings
        "aurora",
        "la cinque",
        "le cinque",
        "blank slate",
        # Hoops
        "dreamcatchers",
        "funkadelic",
        # Donruss
        "snow globe",
        "night moves",
        "sublime",
        # One and One
        "fourth dimension",
        # Noir
        "ceremonial orange",
        # Autres SSP inserts
        "micro-etch",
        "micro etch",
        "photon",
        "genesis",
        "glass mosaic",
        "color wheel",
        "fanatical inserts",
        "ultra violet",
        "451",
        "radiating rookies",
        "advisory",
        "paradox",
        "let's go!",
        "glass canvas",
        "patented",
        "rock stars",
        "profile signatures",
    ],
    "auto_mem": [
        "auto",
        "autograph",
        "signature",
        "patch",
        "relic",
        "mem",
        "jersey",
        "signed",
        "ink",
        "material",
        "materials",
        "gear",
        "booklet",
        # Mem/relic naming conventions
        "swatch",
        "thread",
        "fabric",
        "signing",
        "laundry",
    ],
}

AUTO_SPORT_KEY = "auto"
AUTO_SPORT_LABEL = "Auto (détection par fichier)"

NBA_TEAM_ALIASES = {
    "atlanta": "Atlanta Hawks",
    "atlanta hawks": "Atlanta Hawks",
    "boston": "Boston Celtics",
    "boston celtics": "Boston Celtics",
    "brooklyn": "Brooklyn Nets",
    "brooklyn nets": "Brooklyn Nets",
    "charlotte": "Charlotte Hornets",
    "charlotte hornets": "Charlotte Hornets",
    "chicago": "Chicago Bulls",
    "chicago bulls": "Chicago Bulls",
    "cleveland": "Cleveland Cavaliers",
    "cleveland cavaliers": "Cleveland Cavaliers",
    "dallas": "Dallas Mavericks",
    "dallas mavericks": "Dallas Mavericks",
    "denver": "Denver Nuggets",
    "denver nuggets": "Denver Nuggets",
    "detroit": "Detroit Pistons",
    "detroit pistons": "Detroit Pistons",
    "golden state": "Golden State Warriors",
    "golden state warriors": "Golden State Warriors",
    "houston": "Houston Rockets",
    "houston rockets": "Houston Rockets",
    "indiana": "Indiana Pacers",
    "indiana pacers": "Indiana Pacers",
    "la clippers": "Los Angeles Clippers",
    "clippers": "Los Angeles Clippers",
    "los angeles clippers": "Los Angeles Clippers",
    "la lakers": "Los Angeles Lakers",
    "lakers": "Los Angeles Lakers",
    "los angeles lakers": "Los Angeles Lakers",
    "memphis": "Memphis Grizzlies",
    "memphis grizzlies": "Memphis Grizzlies",
    "miami": "Miami Heat",
    "miami heat": "Miami Heat",
    "milwaukee": "Milwaukee Bucks",
    "milwaukee bucks": "Milwaukee Bucks",
    "minnesota": "Minnesota Timberwolves",
    "minnesota timberwolves": "Minnesota Timberwolves",
    "new orleans": "New Orleans Pelicans",
    "new orleans pelicans": "New Orleans Pelicans",
    "new york": "New York Knicks",
    "new york knicks": "New York Knicks",
    "oklahoma city": "Oklahoma City Thunder",
    "oklahoma city thunder": "Oklahoma City Thunder",
    "orlando": "Orlando Magic",
    "orlando magic": "Orlando Magic",
    "philadelphia": "Philadelphia 76ers",
    "philadelphia 76ers": "Philadelphia 76ers",
    "phoenix": "Phoenix Suns",
    "phoenix suns": "Phoenix Suns",
    "portland": "Portland Trail Blazers",
    "portland trail blazers": "Portland Trail Blazers",
    "sacramento": "Sacramento Kings",
    "sacramento kings": "Sacramento Kings",
    "san antonio": "San Antonio Spurs",
    "san antonio spurs": "San Antonio Spurs",
    "toronto": "Toronto Raptors",
    "toronto raptors": "Toronto Raptors",
    "utah": "Utah Jazz",
    "utah jazz": "Utah Jazz",
    "washington": "Washington Wizards",
    "washington wizards": "Washington Wizards",
    # Legacy / relocated NBA franchises
    "seattle supersonics": "Oklahoma City Thunder",
    "new jersey nets": "Brooklyn Nets",
    "new orleans hornets": "New Orleans Pelicans",
    "new orleans/oklahoma city hornets": "New Orleans Pelicans",
    "charlotte bobcats": "Charlotte Hornets",
    "san diego clippers": "Los Angeles Clippers",
    "buffalo braves": "Los Angeles Clippers",
    "cincinnati royals": "Sacramento Kings",
    "kansas city kings": "Sacramento Kings",
    "kansas city-omaha kings": "Sacramento Kings",
    "rochester royals": "Sacramento Kings",
    "st. louis hawks": "Atlanta Hawks",
    "st louis hawks": "Atlanta Hawks",
    "milwaukee hawks": "Atlanta Hawks",
    "tri-cities blackhawks": "Atlanta Hawks",
    "philadelphia warriors": "Golden State Warriors",
    "san francisco warriors": "Golden State Warriors",
    "syracuse nationals": "Philadelphia 76ers",
    "new orleans jazz": "Utah Jazz",
    "washington bullets": "Washington Wizards",
    "fort wayne pistons": "Detroit Pistons",
    "minneapolis lakers": "Los Angeles Lakers",
    "vancouver grizzlies": "Memphis Grizzlies",
    # Frequent checklist variants / typos
    "portland trailblazers": "Portland Trail Blazers",
    "minnesota tmberwolves": "Minnesota Timberwolves",
}

NFL_TEAM_ALIASES = {
    "arizona": "Arizona Cardinals",
    "arizona cardinals": "Arizona Cardinals",
    "atlanta": "Atlanta Falcons",
    "atlanta falcons": "Atlanta Falcons",
    "baltimore": "Baltimore Ravens",
    "baltimore ravens": "Baltimore Ravens",
    "buffalo": "Buffalo Bills",
    "buffalo bills": "Buffalo Bills",
    "carolina": "Carolina Panthers",
    "carolina panthers": "Carolina Panthers",
    "chicago": "Chicago Bears",
    "chicago bears": "Chicago Bears",
    "cincinnati": "Cincinnati Bengals",
    "cincinnati bengals": "Cincinnati Bengals",
    "cleveland": "Cleveland Browns",
    "cleveland browns": "Cleveland Browns",
    "dallas": "Dallas Cowboys",
    "dallas cowboys": "Dallas Cowboys",
    "denver": "Denver Broncos",
    "denver broncos": "Denver Broncos",
    "detroit": "Detroit Lions",
    "detroit lions": "Detroit Lions",
    "green bay": "Green Bay Packers",
    "green bay packers": "Green Bay Packers",
    "houston": "Houston Texans",
    "houston texans": "Houston Texans",
    "indianapolis": "Indianapolis Colts",
    "indianapolis colts": "Indianapolis Colts",
    "jacksonville": "Jacksonville Jaguars",
    "jacksonville jaguars": "Jacksonville Jaguars",
    "kansas city": "Kansas City Chiefs",
    "kansas city chiefs": "Kansas City Chiefs",
    "las vegas": "Las Vegas Raiders",
    "las vegas raiders": "Las Vegas Raiders",
    "la chargers": "Los Angeles Chargers",
    "los angeles chargers": "Los Angeles Chargers",
    "chargers": "Los Angeles Chargers",
    "la rams": "Los Angeles Rams",
    "los angeles rams": "Los Angeles Rams",
    "rams": "Los Angeles Rams",
    "miami": "Miami Dolphins",
    "miami dolphins": "Miami Dolphins",
    "minnesota": "Minnesota Vikings",
    "minnesota vikings": "Minnesota Vikings",
    "new england": "New England Patriots",
    "new england patriots": "New England Patriots",
    "new orleans": "New Orleans Saints",
    "new orleans saints": "New Orleans Saints",
    "new york giants": "New York Giants",
    "ny giants": "New York Giants",
    "new york jets": "New York Jets",
    "ny jets": "New York Jets",
    "philadelphia": "Philadelphia Eagles",
    "philadelphia eagles": "Philadelphia Eagles",
    "pittsburgh": "Pittsburgh Steelers",
    "pittsburgh steelers": "Pittsburgh Steelers",
    "san francisco": "San Francisco 49ers",
    "san francisco 49ers": "San Francisco 49ers",
    "seattle": "Seattle Seahawks",
    "seattle seahawks": "Seattle Seahawks",
    "tampa bay": "Tampa Bay Buccaneers",
    "tampa bay buccaneers": "Tampa Bay Buccaneers",
    "tennessee": "Tennessee Titans",
    "tennessee titans": "Tennessee Titans",
    "washington": "Washington Commanders",
    "washington commanders": "Washington Commanders",
    # Legacy / relocated NFL franchises
    "oakland raiders": "Las Vegas Raiders",
    "los angeles raiders": "Las Vegas Raiders",
    "san diego chargers": "Los Angeles Chargers",
    "st. louis rams": "Los Angeles Rams",
    "st louis rams": "Los Angeles Rams",
    "houston oilers": "Tennessee Titans",
    "tennessee oilers": "Tennessee Titans",
    "st. louis cardinals": "Arizona Cardinals",
    "st louis cardinals": "Arizona Cardinals",
    "phoenix cardinals": "Arizona Cardinals",
    "baltimore colts": "Indianapolis Colts",
    "washington redskins": "Washington Commanders",
    "washington football team": "Washington Commanders",
    "boston patriots": "New England Patriots",
}

SPORT_PROFILES = {
    "nba": {
        "label": "NBA (Basket)",
        "page_icon": "🏀",
        "header_logo_url": "https://upload.wikimedia.org/wikipedia/en/thumb/0/03/National_Basketball_Association_logo.svg/315px-National_Basketball_Association_logo.svg.png",
        "header_title": "Check list optimizer",
        "header_subtitle": "Optimisez vos choix de <b>Pick Your Player</b> et <b>Pick Your Team</b> en analysant vos checklists.",
        "sheet_names": ["Teams_clean"],
        "team_aliases": NBA_TEAM_ALIASES,
        "category_rules": {
            **DEFAULT_CATEGORY_RULES,
            "logoman": ["logoman", "nba logoman"],
            "auto_mem": DEFAULT_CATEGORY_RULES["auto_mem"] + ["silhouette"],
        },
        "hype_tiers": {
            "Tier S": [
                "Victor Wembanyama",
                "LeBron James",
                "Stephen Curry",
                "Luka Doncic",
                "Anthony Edwards",
                "Giannis Antetokounmpo",
                "Nikola Jokic",
                "Jayson Tatum",
                "Ja Morant",
                "LaMelo Ball",
            ],
            "Tier A": [
                "Trae Young",
                "Zion Williamson",
                "Kevin Durant",
                "Joel Embiid",
                "Shai Gilgeous-Alexander",
                "Tyrese Haliburton",
                "Paolo Banchero",
                "Chet Holmgren",
                "Scoot Henderson",
                "Brandon Miller",
                "Damian Lillard",
                "Devin Booker",
            ],
            "Tier B": [
                "Cade Cunningham",
                "Jalen Green",
                "Scottie Barnes",
                "Evan Mobley",
                "Josh Giddey",
                "Franz Wagner",
                "Amen Thompson",
                "Ausar Thompson",
                "Keyonte George",
                "Bilal Coulibaly",
                "Donovan Mitchell",
                "Kyrie Irving",
            ],
        },
        "top_rookies_by_year": {
            2015: ["Karl-Anthony Towns", "D'Angelo Russell", "Kristaps Porzingis", "Devin Booker", "Myles Turner", "Terry Rozier"],
            2016: ["Ben Simmons", "Brandon Ingram", "Jaylen Brown", "Buddy Hield", "Jamal Murray", "Pascal Siakam"],
            2017: ["Jayson Tatum", "Lonzo Ball", "Donovan Mitchell", "De'Aaron Fox", "Bam Adebayo", "Lauri Markkanen"],
            2018: ["Luka Doncic", "Trae Young", "Deandre Ayton", "Jaren Jackson Jr.", "Shai Gilgeous-Alexander", "Michael Porter Jr."],
            2019: ["Zion Williamson", "Ja Morant", "RJ Barrett", "Darius Garland", "Tyler Herro", "De'Andre Hunter"],
            2020: ["Anthony Edwards", "LaMelo Ball", "Tyrese Haliburton", "James Wiseman", "Isaac Okoro", "Patrick Williams"],
            2021: ["Cade Cunningham", "Evan Mobley", "Scottie Barnes", "Jalen Green", "Jalen Suggs", "Franz Wagner"],
            2022: ["Paolo Banchero", "Chet Holmgren", "Jabari Smith Jr.", "Keegan Murray", "Jaden Ivey", "Bennedict Mathurin"],
            2023: ["Victor Wembanyama", "Scoot Henderson", "Brandon Miller", "Amen Thompson", "Ausar Thompson", "Bilal Coulibaly"],
            2024: ["Zaccharie Risacher", "Alex Sarr", "Reed Sheppard", "Stephon Castle", "Jared McCain", "Matas Buzelis"],
        },
        "enabled_views": {
            "autos_patchs": True,
            "logoman": True,
            "case_hits": True,
            "value_picks": True,
            "cost_by_pick": True,
            "rookies": True,
            "live_mode": True,
        },
        "filename_hints": [
            "basket",
            "basketball",
            "nba",
            "donruss basketball",
            "prizm basketball",
            "optic basketball",
            "select basketball",
            "revolution basketball",
            "recon basketball",
        ],
    },
    "nfl": {
        "label": "NFL (Football US)",
        "page_icon": "🏈",
        "header_logo_url": "https://upload.wikimedia.org/wikipedia/en/thumb/a/a2/National_Football_League_logo.svg/240px-National_Football_League_logo.svg.png",
        "header_title": "Check list optimizer",
        "header_subtitle": "Analysez vos checklists NFL pour optimiser vos picks joueurs et équipes.",
        "sheet_names": ["Teams_clean"],
        "team_aliases": NFL_TEAM_ALIASES,
        "category_rules": {
            **DEFAULT_CATEGORY_RULES,
            "logoman": ["nfl shield", "shield logo", "team logo patch", "logo patch"],
            "case_hit": DEFAULT_CATEGORY_RULES["case_hit"] + ["color wheel", "downtown", "kaboom"],
        },
        "hype_tiers": {
            "Tier S": ["Patrick Mahomes", "Josh Allen", "Lamar Jackson", "Joe Burrow", "Justin Jefferson"],
            "Tier A": ["C.J. Stroud", "Jayden Daniels", "Dak Prescott", "Jalen Hurts", "Brock Purdy"],
            "Tier B": ["Caleb Williams", "Drake Maye", "Bijan Robinson", "Puka Nacua", "Amon-Ra St. Brown"],
        },
        "top_rookies_by_year": {
            2022: ["Kenny Pickett", "Garrett Wilson", "Chris Olave", "Breece Hall", "Aidan Hutchinson", "Sauce Gardner"],
            2023: ["C.J. Stroud", "Bryce Young", "Will Anderson Jr.", "Bijan Robinson", "Anthony Richardson", "Puka Nacua"],
            2024: ["Caleb Williams", "Jayden Daniels", "Drake Maye", "Marvin Harrison Jr.", "Malik Nabers", "Brock Bowers"],
        },
        "enabled_views": {
            "autos_patchs": True,
            "logoman": True,
            "case_hits": True,
            "value_picks": True,
            "cost_by_pick": True,
            "rookies": True,
            "live_mode": True,
        },
        "filename_hints": [
            "nfl",
            "football",
            "donruss football",
            "prizm football",
            "optic football",
            "contenders football",
            "mosaic football",
            "select football",
        ],
    },
    "soccer": {
        "label": "Football (Soccer)",
        "page_icon": "⚽",
        "header_logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Soccerball.svg/240px-Soccerball.svg.png",
        "header_title": "Check list optimizer",
        "header_subtitle": "Analysez vos checklists football pour optimiser vos décisions de breaks et picks.",
        "sheet_names": ["Teams_clean"],
        "team_aliases": {},
        "category_rules": {
            **DEFAULT_CATEGORY_RULES,
            "logoman": ["badge patch", "club crest", "logo patch"],
        },
        "hype_tiers": {
            "Tier S": ["Kylian Mbappe", "Erling Haaland", "Jude Bellingham", "Lamine Yamal", "Vinicius Junior"],
            "Tier A": ["Cole Palmer", "Bukayo Saka", "Pedri", "Jamal Musiala", "Florian Wirtz"],
            "Tier B": ["Endrick", "Warren Zaire-Emery", "Arda Guler", "Kobbie Mainoo", "Xavi Simons"],
        },
        "top_rookies_by_year": {},
        "enabled_views": {
            "autos_patchs": True,
            "logoman": True,
            "case_hits": True,
            "value_picks": True,
            "cost_by_pick": True,
            "rookies": False,
            "live_mode": True,
        },
        "filename_hints": [
            "soccer",
            "uefa",
            "fifa",
            "merlin",
            "premier league",
            "la liga",
            "serie a",
            "bundesliga",
            "futera",
        ],
    },
    "tennis": {
        "label": "Tennis",
        "page_icon": "🎾",
        "header_logo_url": "",
        "header_title": "Check list optimizer",
        "header_subtitle": "Analysez vos checklists tennis pour optimiser vos picks joueurs et nationalités.",
        "sheet_names": ["Teams_clean"],
        "team_aliases": {},
        "category_rules": {
            **DEFAULT_CATEGORY_RULES,
            "logoman": ["logo patch", "crest patch"],
            "case_hit": DEFAULT_CATEGORY_RULES["case_hit"] + ["hidden gems", "helix", "let's go"],
        },
        "hype_tiers": {
            "Tier S": ["Carlos Alcaraz", "Jannik Sinner", "Novak Djokovic", "Iga Swiatek", "Coco Gauff"],
            "Tier A": ["Aryna Sabalenka", "Daniil Medvedev", "Alexander Zverev", "Jessica Pegula", "Elena Rybakina"],
            "Tier B": ["Ben Shelton", "Mirra Andreeva", "Qinwen Zheng", "Holger Rune", "Jack Draper"],
        },
        "top_rookies_by_year": {},
        "enabled_views": {
            "autos_patchs": True,
            "logoman": True,
            "case_hits": True,
            "value_picks": True,
            "cost_by_pick": True,
            "rookies": False,
            "live_mode": True,
        },
        "filename_hints": [
            "tennis",
            "atp",
            "wta",
            "grand slam",
            "us open",
            "roland garros",
            "wimbledon",
            "australian open",
            "topps chrome tennis",
        ],
    },
}

BASE_EXACT_CATEGORY_BY_SPORT = {
    "nba": {
        "auto_mem": [
            "Autographed Gold Logoman Relics",
            "Gold Logoman Relics",
        ],
        "case_hit": [
            "Fanatical",
            "Helix",
        ],
    },
}

DEFAULT_SPORT_KEY = "nba"
AUTO_SPORT_PROFILE = {
    "label": AUTO_SPORT_LABEL,
    "page_icon": "🏟️",
    "header_logo_url": "",
    "header_title": "Check list optimizer",
    "header_subtitle": "Détection automatique du sport à partir des fichiers sélectionnés.",
}


def _normalized_exact_list(values):
    if not isinstance(values, list):
        return []
    output = []
    seen = set()
    for raw in values:
        text = "" if raw is None else str(raw).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        output.append(text)
    return output


def get_base_exact_category_by_sport():
    output = {}
    for sk in SPORT_PROFILES:
        sport_base = BASE_EXACT_CATEGORY_BY_SPORT.get(sk, {})
        if not isinstance(sport_base, dict):
            sport_base = {}
        output[sk] = {
            "auto_mem": _normalized_exact_list(sport_base.get("auto_mem", [])),
            "case_hit": _normalized_exact_list(sport_base.get("case_hit", [])),
        }
    return output


def get_effective_exact_category_by_sport(keyword_overrides_root):
    root = keyword_overrides_root if isinstance(keyword_overrides_root, dict) else {}
    by_sport = root.get("exact_category_by_sport", {})
    legacy_auto = root.get("auto_mem_exact_by_sport", {})

    if not isinstance(by_sport, dict):
        by_sport = {}
    if not isinstance(legacy_auto, dict):
        legacy_auto = {}

    effective = get_base_exact_category_by_sport()
    all_sport_keys = set(effective.keys()) | set(by_sport.keys()) | set(legacy_auto.keys())

    for sk in sorted(all_sport_keys):
        sport_base = effective.get(sk, {"auto_mem": [], "case_hit": []})
        sport_runtime = by_sport.get(sk, {})
        if not isinstance(sport_runtime, dict):
            sport_runtime = {}

        runtime_auto = sport_runtime.get("auto_mem", None)
        runtime_case = sport_runtime.get("case_hit", None)
        legacy_values = legacy_auto.get(sk, [])

        auto_values = runtime_auto if isinstance(runtime_auto, list) else sport_base.get("auto_mem", [])
        case_values = runtime_case if isinstance(runtime_case, list) else sport_base.get("case_hit", [])

        if isinstance(legacy_values, list):
            auto_values = list(auto_values) + legacy_values

        effective[sk] = {
            "auto_mem": _normalized_exact_list(auto_values),
            "case_hit": _normalized_exact_list(case_values),
        }

    return effective


def get_sport_profile(sport_key):
    if sport_key == AUTO_SPORT_KEY:
        return deepcopy(AUTO_SPORT_PROFILE)
    key = sport_key if sport_key in SPORT_PROFILES else DEFAULT_SPORT_KEY
    return deepcopy(SPORT_PROFILES[key])


def get_sport_labels(include_auto=False):
    labels = [SPORT_PROFILES[key]["label"] for key in SPORT_PROFILES]
    if include_auto:
        return [AUTO_SPORT_LABEL] + labels
    return labels


def get_sport_label(sport_key):
    if sport_key == AUTO_SPORT_KEY:
        return AUTO_SPORT_LABEL
    return get_sport_profile(sport_key)["label"]


def sport_key_from_label(label):
    if label == AUTO_SPORT_LABEL:
        return AUTO_SPORT_KEY
    for key, profile in SPORT_PROFILES.items():
        if profile["label"] == label:
            return key
    return DEFAULT_SPORT_KEY


def detect_sport_from_filename(filename, fallback=DEFAULT_SPORT_KEY):
    normalized = re.sub(r"\s+", " ", os.path.basename(filename).lower())
    tennis_strong = ["tennis", "atp", "wta", "wimbledon", "roland garros", "australian open", "us open"]
    soccer_strong = ["soccer", "uefa", "fifa", "premier league", "la liga", "serie a", "bundesliga", "merlin"]
    nfl_strong = ["nfl", "football", "super bowl", "draft picks"]
    nba_strong = ["nba", "basket", "basketball", "hoops"]

    if any(h in normalized for h in tennis_strong):
        return "tennis"
    if any(h in normalized for h in soccer_strong):
        return "soccer"
    if any(h in normalized for h in nba_strong):
        return "nba"
    if any(h in normalized for h in nfl_strong):
        return "nfl"

    best_key = None
    best_score = 0
    for key, profile in SPORT_PROFILES.items():
        hints = profile.get("filename_hints", [])
        score = sum(1 for hint in hints if hint in normalized)
        if score > best_score:
            best_score = score
            best_key = key

    return best_key if best_key else fallback
