# Beckett Sheet Hit Type Backfill

- Generated: `2026-07-30T09:50:33.287043+00:00`
- Sport: `nba`
- Master: `parquet_master/nba.parquet`
- Applied: `True`
- Backup: `backups/parquet_master/nba/beckett-sheet-20260730-095031.parquet`

## Summary

- Source files discovered: 163
- Source files with Auto/Memo sheet signals: 102
- Source checklists with signals: 89
- Source signal rows: 56875
- Matched master rows: 7917
- Changed rows: 1062
- Changed checklists: 17

## Change Counts

- `auto_mem->auto`: 592
- `auto_mem->mem`: 470

## Hit Type Counts Before

- `none`: 77129
- `auto`: 43567
- `mem`: 19970
- `auto_mem`: 14338

## Hit Type Counts After

- `none`: 77129
- `auto`: 44159
- `mem`: 20440
- `auto_mem`: 13276

## Top Changes

| Rows | Checklist | Old -> New | Box Type | Examples |
|---:|---|---|---|---|
| 99 | `2022-23-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `The Standard` | Trae Young, Dejounte Murray, Onyeka Okongwu, John Collins, Robert Williams III |
| 92 | `2020-21-panini-immaculate-basketball-checklist` | `auto_mem->mem` | `The Standard` | Onyeka Okongwu, Dennis Johnson, Payton Pritchard, Pete Maravich, Larry Bird |
| 74 | `2021-22-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `The Standard` | Trae Young, John Collins, Jayson Tatum, Jaylen Brown, Dennis Johnson |
| 72 | `2020-21-panini-immaculate-basketball-checklist` | `auto_mem->mem` | `Sneak Peek - Laces` | Onyeka Okongwu, Dominique Wilkins, Aaron Nesmith, Evan Fournier, Payton Pritchard |
| 43 | `2021-22-panini-national-treasures-basketball-checklist` | `auto_mem->auto` | `Lasting Legacies` | Grant Williams, Robert Parish, Enes Freedom, Kelly Oubre Jr., Kirk Hinrich |
| 38 | `2022-23-panini-court-kings-basketball-checklist` | `auto_mem->auto` | `Masterstrokes` | Kevin Willis, Jalen Johnson, Al Horford, Derrick White, Robert Williams III |
| 33 | `2021-22-panini-nba-hoops-basketball-checklist` | `auto_mem->mem` | `Rookie Sweaters` | Jalen Johnson, Cameron Thomas, Day'Ron Sharpe, Kai Jones, James Bouknight |
| 33 | `2022-23-panini-nba-hoops-basketball-checklist` | `auto_mem->mem` | `Rookie Sweaters` | AJ Griffin, Mark Williams, Dalen Terry, Christian Braun, Peyton Watson |
| 30 | `2020-21-panini-absolute-memorabilia-basketball-checklist` | `auto_mem->mem` | `Veteran Tools of the Trade Level 1` | Marcus Smart, James Harden, Cody Zeller, Otto Porter Jr., Kevin Love |
| 30 | `2020-21-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `Immaculate Rookie Introductions` | Nathan Knight, Onyeka Okongwu, Aaron Nesmith, Reggie Perry, LaMelo Ball |
| 29 | `2021-22-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `Immaculate Rookie Introductions` | James Bouknight, Ayo Dosunmu, Bones Hyland, Cade Cunningham, Isaiah Livers |
| 29 | `2022-23-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `Immaculate Rookie Introductions` | AJ Griffin, Mark Williams, Dalen Terry, Jaden Hardy, Christian Braun |
| 29 | `2022-23-panini-national-treasures-basketball-checklist` | `auto_mem->mem` | `Tremendous Treasures` | Trae Young, John Collins, De'Andre Hunter, Jaylen Brown, Ben Simmons |
| 27 | `2020-21-panini-impeccable-basketball-checklist` | `auto_mem->auto` | `Canvas Creations` | Spud Webb, John Collins, Trae Young, Larry Bird, Robert Parish |
| 25 | `2020-21-panini-immaculate-basketball-checklist` | `auto_mem->mem` | `Team Slogans` | John Collins, Joe Harris, LaMelo Ball, Kevin Love, Isaac Okoro |
| 25 | `2021-22-panini-flawless-basketball-checklist` | `auto_mem->mem` | `Fully Endorsed` | Trae Young, Jayson Tatum, Kevin Durant, Kyrie Irving, LaMelo Ball |
| 25 | `2022-23-panini-court-kings-basketball-checklist` | `auto_mem->auto` | `Brush Strokes` | Grant Williams, Derrick White, Ayo Dosunmu, Alex Caruso, Spencer Dinwiddie |
| 25 | `2022-23-panini-flawless-basketball-checklist` | `auto_mem->mem` | `Fully Endorsed` | Trae Young, Jayson Tatum, Kevin Durant, LaMelo Ball, Luka Doncic |
| 25 | `2023-24-panini-flawless-basketball-checklist` | `auto_mem->mem` | `Fully Endorsed` | Brandon Miller, Luka Doncic, Dereck Lively II, Nikola Jokic, Ausar Thompson |
| 21 | `2023-24-panini-crown-royale-basketball-checklist` | `auto_mem->auto` | `Silhouettes` | Onyeka Okongwu, Jrue Holiday, Joakim Noah, Jalen Duren, Jaden Ivey |
| 20 | `2020-21-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `Immaculate Award Winners` | Spud Webb, Paul Pierce, Jason Kidd, Luka Doncic, Ben Wallace |
| 20 | `2021-22-panini-immaculate-basketball-checklist` | `auto_mem->mem` | `Team Slogans` | John Collins, James Bouknight, LaMelo Ball, Evan Mobley, Darius Garland |
| 20 | `2022-23-panini-immaculate-basketball-checklist` | `auto_mem->mem` | `Team Slogans` | Trae Young, LaMelo Ball, Darius Garland, Jaden Ivey, Jalen Duren |
| 19 | `2022-23-panini-crown-royale-basketball-checklist` | `auto_mem->auto` | `Silhouettes` | Paul Pierce, Vince Carter, Mike Miller, Adrian Dantley, Jonathan Kuminga |
| 18 | `2020-21-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `Immaculate Hall of Fame Inductions` | Robert Parish, Dino Radja, Dikembe Mutombo, Grant Hill, Isiah Thomas |
| 18 | `2020-21-panini-national-treasures-basketball-checklist` | `auto_mem->auto` | `Personalized` | Trae Young, Jayson Tatum, Kevin Durant, LaMelo Ball, Luka Doncic |
| 18 | `2022-23-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `Immaculate Legends` | Larry Bird, Nate Archibald, Robert Parish, Bob Cousy, Larry Johnson |
| 17 | `2021-22-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `Immaculate Legends` | Dominique Wilkins, Larry Bird, Bob Cousy, Robert Parish, Dirk Nowitzki |
| 15 | `2021-22-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `Immaculate Award Winners` | Bob Cousy, Larry Bird, Dirk Nowitzki, Nikola Jokic, Dennis Rodman |
| 15 | `2022-23-panini-flawless-basketball-checklist` | `auto_mem->mem` | `Mastercraft` | Jayson Tatum, Luka Doncic, Dirk Nowitzki, Nikola Jokic, Stephen Curry |
| 15 | `2023-24-panini-flawless-basketball-checklist` | `auto_mem->mem` | `Mastercraft` | Jayson Tatum, Luka Doncic, Nikola Jokic, Stephen Curry, Kawhi Leonard |
| 10 | `2021-22-panini-flawless-basketball-checklist` | `auto_mem->mem` | `Mastercraft` | Jayson Tatum, Larry Bird, Kevin Durant, LaMelo Ball, Luka Doncic |
| 10 | `2022-23-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `Immaculate Championship Runs` | Bob Cousy, Toni Kukoc, Steve Kerr, Rasheed Wallace, Stephen Curry |
| 9 | `2022-23-panini-contenders-basketball-checklist` | `auto_mem->auto` | `Veteran Season Ticket` | Paul Pierce, Jayson Tatum, Luka Doncic, Hakeem Olajuwon, Ja Morant |
| 9 | `2022-23-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `Immaculate Award Winners` | Larry Bird, Stephen Curry, Hakeem Olajuwon, Ja Morant, Kareem Abdul-Jabbar |
| 8 | `2020-21-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `Immaculate Milestones` | Trae Young, LaMelo Ball, Luka Doncic, Nikola Jokic, Stephen Curry |
| 8 | `2021-22-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `Immaculate Milestones` | Luka Doncic, Nikola Jokic, Stephen Curry, Jalen Green, Ja Morant |
| 8 | `2022-23-panini-immaculate-basketball-checklist` | `auto_mem->auto` | `Immaculate Milestones` | Paul Pierce, Luka Doncic, Nikola Jokic, Stephen Curry, Josh Giddey |
| 1 | `2022-23-panini-immaculate-basketball-checklist` | `auto_mem->mem` | `All-Time` | LeBron James |
