#!/usr/bin/env python3
"""PDF checklist Topps -> CSV avec Box Type et `Section` (base/insert/auto/mem/auto_mem), pour l'import.

Usage: python3 scripts/parse_topps_pdf_sections.py <checklist.pdf> <equipes.txt> <sortie.csv> [--sport nba]
  <equipes.txt> : une équipe par ligne (sert à couper « Joueur Équipe » quand l'équipe est sur la même ligne).
Les en-têtes INSERT / AUTOGRAPH / RELIC... changent la section courante ; les autres titres en MAJUSCULES sont des sets.
Sortie: Player, Team, Box Type, Section, Rookie + un résumé par section (comptes seulement). Aucune écriture R2.
Dépendance: pymupdf (`uv run --with pymupdf python3 ...`)."""
import csv, re, sys, collections
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.services.section_kind import marker_kind, KIND_BASE

CODE = re.compile(r'^[A-Z]{1,5}-[A-Z0-9]{1,4}$')
NUM = re.compile(r'^(\d+) (.+)$')


def parse(text, teams):
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    teams = sorted(set(teams), key=len, reverse=True)
    def split_team(s):
        for t in teams:
            if s.endswith(' ' + t): return s[:-len(t) - 1], t
        return s, None
    rows, kind, box, i = [], KIND_BASE, None, 0
    while i < len(lines):
        l = lines[i]
        mk = marker_kind(l)
        if mk: kind = mk; i += 1; continue
        if l.isupper() and not CODE.match(l) and not NUM.match(l) and len(l) < 80 and l != 'ROOKIE':
            box = l.title().replace("'S", "'s"); i += 1; continue
        m = NUM.match(l)
        code = l if CODE.match(l) else ''
        if CODE.match(l): player = lines[i + 1]; i += 2
        elif m: player = m.group(2); i += 1
        else: i += 1; continue
        p2, t2 = split_team(player)
        if t2: player, team = p2, t2
        else: team = lines[i]; i += 1
        rookie = i < len(lines) and lines[i] == 'Rookie'
        if rookie: i += 1
        rows.append({'Player': player, 'Team': team, 'Box Type': box, 'Section': kind, 'Rookie': int(rookie), '_code': code})
    return merge_duals(rows)


def merge_duals(rows):
    """Un code répété par signataire (duals) = UNE carte `A/B` ; équipe du premier signataire (convention Hoops).
    Seuls les codes consécutifs d'un même set sont fusionnés ; un code répété ailleurs (cartes distinctes) reste."""
    out = []
    for r in rows:
        prev = out[-1] if out else None
        if prev and r['_code'] and prev['_code'] == r['_code'] and prev['Box Type'] == r['Box Type']:
            prev['Player'] += '/' + r['Player']; prev['Rookie'] = max(prev['Rookie'], r['Rookie']); continue
        out.append(dict(r))
    for r in out: r.pop('_code', None)
    return out


def main():
    import fitz
    pdf, teams_file, out = sys.argv[1:4]
    text = '\n'.join(p.get_text() for p in fitz.open(pdf))
    rows = parse(text, Path(teams_file).read_text().split('\n'))
    with open(out, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['Player', 'Team', 'Box Type', 'Section', 'Rookie']); w.writeheader(); w.writerows(rows)
    per = collections.defaultdict(lambda: collections.Counter())
    for r in rows: per[r['Section']][r['Box Type']] += 1
    print(len(rows), 'cartes')
    for k, c in per.items(): print(f'  {k}: {sum(c.values())} cartes, {len(c)} sets')
    # contrôle: un set présent dans deux sections = ambigu, à regarder avant import
    seen = collections.defaultdict(set)
    for r in rows: seen[r['Box Type']].add(r['Section'])
    amb = {b: sorted(s) for b, s in seen.items() if len(s) > 1}
    print('sets dans plusieurs sections:', amb or 'aucun')

if __name__ == '__main__': main()
