# Beckett Sheet Hit Type Backfill

- Generated: `2026-07-30T10:15:57.442113+00:00`
- Sport: `nba`
- Master: `parquet_master/nba.parquet`
- Applied: `True`
- Backup: `backups/parquet_master/nba/beckett-sheet-20260730-101556.parquet`

## Summary

- Source files discovered: 213
- Source files with Auto/Memo sheet signals: 140
- Source checklists with signals: 127
- Source signal rows: 85245
- Matched master rows: 13440
- Changed rows: 598
- Changed checklists: 11

## Change Counts

- `auto_mem->mem`: 252
- `none->auto`: 247
- `none->mem`: 99

## Hit Type Counts Before

- `none`: 77129
- `auto`: 44159
- `mem`: 20440
- `auto_mem`: 13276

## Hit Type Counts After

- `none`: 76783
- `auto`: 44406
- `mem`: 20791
- `auto_mem`: 13024

## Top Changes

| Rows | Checklist | Old -> New | Box Type | Examples |
|---:|---|---|---|---|
| 87 | `2023-24-panini-national-treasures-basketball-checklist` | `none->auto` | `Personalized Treasures` | Kobe Bufkin, Larry Bird, Larry Bird, Larry Bird, Kevin Garnett |
| 73 | `2024-25-panini-immaculate-basketball-checklist` | `auto_mem->mem` | `Sneak Peek - Laces` | Zaccharie Risacher, Dominique Wilkins, Baylor Scheierman, Jayson Tatum, Larry Bird |
| 50 | `2023-24-panini-immaculate-basketball-checklist` | `auto_mem->mem` | `The Standard` | Trae Young, Jayson Tatum, Jaylen Brown, Mikal Bridges, Brandon Miller |
| 36 | `2024-25-panini-immaculate-basketball-checklist` | `auto_mem->mem` | `The Standard` | Zaccharie Risacher, Jaylen Brown, Jayson Tatum, LaMelo Ball, Tidjane Salaun |
| 35 | `2024-25-panini-totally-certified-basketball-checklist` | `none->mem` | `Certified Gamers` | Trae Young, Jayson Tatum, Jaylen Brown, Cameron Johnson, LaMelo Ball |
| 34 | `2025-26-panini-donruss-basketball-checklist` | `none->auto` | `Pen Pals` | Hugo Gonzalez, Ryan Kalkbrenner, Sion James, Noa Essengue, Lachlan Olbrich |
| 32 | `2023-24-panini-nba-hoops-basketball-checklist` | `auto_mem->mem` | `Rookie Sweaters` | Kobe Bufkin, Dariq Whitehead, Noah Clowney, Brandon Miller, James Nnaji |
| 31 | `2024-25-panini-nba-hoops-basketball-checklist` | `auto_mem->mem` | `Rookie Sweaters` | Zaccharie Risacher, Tidjane Salaun, Matas Buzelis, Jaylon Tyson, DaRon Holmes II |
| 26 | `2024-25-panini-immaculate-basketball-checklist` | `none->mem` | `Insignias` | Kevin McHale, Larry Bird, Alonzo Mourning, Derrick Rose, Harrison Barnes |
| 20 | `2023-24-panini-immaculate-basketball-checklist` | `none->auto` | `Immaculate Legends` | Dominique Wilkins, Bob Cousy, Kevin McHale, Alonzo Mourning, Dirk Nowitzki |
| 19 | `2023-24-panini-immaculate-basketball-checklist` | `none->auto` | `Immaculate Rookie Introductions` | Jalen Wilson, Vasilije Micic, Julian Phillips, Dereck Lively II, Olivier-Maxence Prosper |
| 18 | `2023-24-panini-immaculate-basketball-checklist` | `none->mem` | `Insignias` | Larry Bird, Robert Parish, Kevin McHale, Alonzo Mourning, Dennis Rodman |
| 17 | `2023-24-panini-national-treasures-basketball-checklist` | `auto_mem->mem` | `Tremendous Treasures` | Trae Young, Jayson Tatum, Payton Pritchard, Cameron Thomas, DeMar DeRozan |
| 15 | `2023-24-panini-immaculate-basketball-checklist` | `none->auto` | `Tiltle Winners` | Bob Cousy, Dirk Nowitzki, Nikola Jokic, Ben Wallace, Stephen Curry |
| 13 | `2023-24-panini-immaculate-basketball-checklist` | `auto_mem->mem` | `Team Slogans` | Brandon Miller, LeBron James, Ausar Thompson, John Wall, Kawhi Leonard |
| 11 | `2023-24-panini-national-treasures-basketball-checklist` | `none->mem` | `Highly Treasured` | Jayson Tatum, Brandon Miller, Luka Doncic, Nikola Jokic, Ausar Thompson |
| 10 | `2023-24-panini-immaculate-basketball-checklist` | `none->auto` | `Immaculate All-Star Lineage` | Donovan Mitchell, Luka Doncic, Klay Thompson, Chris Paul, Ja Morant |
| 10 | `2023-24-panini-immaculate-basketball-checklist` | `none->auto` | `Immaculate Award Winners` | Luka Doncic, Nikola Jokic, Klay Thompson, Giannis Antetokounmpo, Paolo Banchero |
| 10 | `2023-24-panini-immaculate-basketball-checklist` | `none->auto` | `Immaculate Championship Runs` | Paul Pierce, Nikola Jokic, Jamal Murray, Klay Thompson, Shaquille O'Neal |
| 10 | `2023-24-panini-noir-basketball-checklist` | `none->auto` | `Capstones` | Luka Doncic, Nikola Jokic, Isiah Thomas, Stephen Curry, Kareem Abdul-Jabbar |
| 10 | `2023-24-panini-noir-basketball-checklist` | `none->auto` | `Ceremonial Orange` | Paul Pierce, Dirk Nowitzki, Pau Gasol, Shaquille O'Neal, Dwyane Wade |
| 10 | `2024-25-panini-noir-basketball-checklist` | `none->auto` | `Capstones` | Larry Bird, Derrick Rose, Luka Doncic, Stephen Curry, Jeremy Lin |
| 9 | `2023-24-panini-immaculate-basketball-checklist` | `none->auto` | `Immaculate Milestones` | Trae Young, Luka Doncic, Stephen Curry, James Harden, Russell Westbrook |
| 9 | `2024-25-panini-national-treasures-basketball-checklist` | `none->mem` | `Highly Treasured` | Zaccharie Risacher, Jayson Tatum, Luka Doncic, Reed Sheppard, Dalton Knecht |
| 3 | `2023-24-panini-revolution-basketball-checklist` | `none->auto` | `2023-24 Calligraphy` | Ausar Thompson, Cason Wallace, Keyonte George |
