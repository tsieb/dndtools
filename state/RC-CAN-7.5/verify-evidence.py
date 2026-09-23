"""Check the frozen ARIA controls against the parity matrix; no browser or writes."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = Path(__file__).resolve().parent
ROLES = r'button|link|textbox|combobox|spinbutton|checkbox|radio|switch|slider|tab|menuitem|menuitemcheckbox|menuitemradio|option|treeitem|searchbox'
CONTROL = re.compile(r'^\s*- (' + ROLES + r')\b')


def controls():
    return {(p.name, n): line.strip()
            for p in sorted((EVIDENCE / 'aria').glob('*.yaml'))
            for n, line in enumerate(p.read_text().splitlines(), 1)
            if CONTROL.match(line)}


def main():
    matrix = (ROOT / 'docs/planning/SCREENS_PARITY.md').read_text()
    rows = re.findall(r'^\|\s*((?:CC|BD|SE)-\d+)\s*\|', matrix, re.M)
    assert len(rows) == len(set(rows)), f'Duplicate matrix IDs: {[r for r in rows if rows.count(r) > 1]}'
    row_ids = set(rows)
    manifest = json.loads((EVIDENCE / 'control-coverage.json').read_text())
    actual = controls()
    mapped = {}
    for record in manifest['controls']:
        assert record['row'] in row_ids, record
        for occurrence in record['occurrences']:
            filename, number = occurrence.rsplit(':', 1)
            key = filename, int(number)
            assert key not in mapped, f'Duplicate mapping: {key}'
            mapped[key] = record['control']
    assert actual == mapped, f'Unmapped/changed controls: {set(actual.items()) ^ set(mapped.items())}'
    for filename, digest in manifest['aria_sha256'].items():
        assert hashlib.sha256((EVIDENCE / 'aria' / filename).read_bytes()).hexdigest() == digest, filename
    assert set(manifest['aria_sha256']) == {p.name for p in (EVIDENCE / 'aria').glob('*.yaml')}
    for route in ('home', 'board', 'session'):
        for tier in ('desktop', 'rail', 'phone'):
            for theme in ('tavern', 'parchment', 'high-contrast'):
                p = EVIDENCE / 'screens' / f'{route}-{tier}-{theme}.webp'
                data = p.read_bytes()
                assert data[:4] == b'RIFF' and data[8:12] == b'WEBP', p
    # Reviewed omissions are explicit assertions, not merely checks against a frozen manifest.
    refreshed = ('home', 'board', 'board-gallery', 'board-gallery-empty',
                 'session', 'session-active', 'session-call', 'session-adjust',
                 'capture-filter', 'capture-continuity',
                 'session-combat-conditional', 'session-combat-hp-sheet', 'session-combat-preview',
                 'board-combat-live', 'board-combat-preview', 'board-combat-edit',
                 'board-combat-tray', 'board-combat-hp-sheet')
    phone_only = {'board-combat-tray', 'board-combat-hp-sheet'}
    required = {
        'capture-filter': ('combobox "Archived session"', 'textbox "Filter": zzzz-no-match', '[checked]'),
        'capture-continuity': ('button "Create"', 'button "Not now"', 'group "1 name mentioned without notes"'),
        'home': ('button "Open scene"',),
        'board': ('button "Edit layout"',),
        'board-gallery': ('searchbox "Search widgets"', 'group "Filter by category"',
                          'button "Generate with assistant"', 'button "Build your own"'),
        'board-gallery-empty': ('No widgets match that search.',),
        'session': ('radiogroup "Session phase"',),
        'session-active': ('button "Roll for initiative"',),
        'session-call': ('button "Start round 1"', 'Awaiting roll'),
        'session-adjust': ('spinbutton "Initiative for ', 'button "Set"', 'button "Add condition"'),
        # Review of 29841dec: live conditional combat controls and the phone board's live tile.
        'session-combat-conditional': ('button "Clear Poisoned"', 'Death saves 0 of 3 kept',
                                       'button "Record a death save success for Reed Stalker"',
                                       'button "Record a death save failure for Reed Stalker"',
                                       'Concentration check, DC 10',
                                       'button "Keep concentration for Bog Lurker"',
                                       'button "Drop concentration for Bog Lurker"', 'img "DM only"'),
        'session-combat-hp-sheet': ('dialog "Hit points — Bog Lurker"', 'button "Digit 0"',
                                    'button "Delete last digit"', 'button "Temp" [disabled]'),
        'session-combat-preview': ('button "Record a death save success for Reed Stalker" [disabled]',
                                   'button "Keep concentration for Bog Lurker" [disabled]',
                                   'button "Unknown creature"'),
        'board-combat-live': ('button "Next turn"',),
        'board-combat-preview': ('Only the DM can arrange it.',),
        'board-combat-edit': ('button "Actions for Initiative Tracker"',),
        'board-combat-tray': ('group "Quick actions — Bog Lurker"', 'button "Hide Bog Lurker from players"',
                              'button "Close quick actions — Bog Lurker"'),
        'board-combat-hp-sheet': ('dialog "Hit points — Bog Lurker"', 'button "Digit 5"'),
    }
    phone_tile = ('button "Adjust hit points — Reed Stalker"', 'button "More actions — Marsh Wisp"',
                  'Swipe a row left for quick actions.')
    screenshots = 0
    for state in refreshed:
        for tier in ('phone',) if state in phone_only else ('desktop', 'rail', 'phone'):
            for theme in ('tavern', 'parchment', 'high-contrast'):
                name = f'refresh-{state}-{tier}-{theme}'
                snapshot = (EVIDENCE / 'aria' / f'{name}.yaml').read_text()
                for control in required[state]:
                    assert control in snapshot, (name, control)
                if state in ('board-combat-live', 'board-combat-edit', 'board-combat-tray'):
                    # The live phone tile is a different body; desk/rail keep the summary readout.
                    for control in phone_tile:
                        assert (control in snapshot) == (tier == 'phone'), (name, control)
                if state == 'board-combat-edit' and tier == 'phone':
                    assert 'button "More actions — Bog Lurker" [disabled]' in snapshot, name
                if state == 'board-combat-edit':
                    assert 'button "Next turn"' not in snapshot, name
                if state == 'board-gallery' and tier == 'phone':
                    assert 'dialog "Add widget"' in snapshot and 'button "Done"' in snapshot
                data = (EVIDENCE / 'screens' / f'{name}.webp').read_bytes()
                assert data[:4] == b'RIFF' and data[8:12] == b'WEBP', name
                screenshots += 1
    for gap, story in [('G-01', '5.1'), ('G-02', '5.2'), ('G-03', '5.3'), ('G-04', '5.4'),
                       ('G-05', '5.6'), ('G-06', '5.9'), ('G-07', '5.7'), ('G-08', '5.8'), ('G-09', '5.10'), ('G-10', '5.11'),
                       ('G-11', '5.12')]:
        assert re.search(r'^\|\s*' + gap + r'\s*\|.*WID-' + re.escape(story) + r'\b', matrix, re.M), gap
    print(f'PASS: {len(actual)} control occurrences, {len(manifest["controls"])} distinct mapped controls, '
          f'{len(manifest["aria_sha256"])} unchanged ARIA captures, 27 historical baseline + {screenshots} refresh screenshots, 11 assigned gaps.')


if __name__ == '__main__':
    main()
