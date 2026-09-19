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
    row_ids = set(re.findall(r'^\|\s*((?:CC|BD|SE)-\d+)\s*\|', matrix, re.M))
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
                 'session', 'session-active', 'session-call', 'session-adjust')
    required = {
        'home': ('button "Open scene"',),
        'board': ('button "Edit layout"',),
        'board-gallery': ('searchbox "Search widgets"', 'group "Filter by category"',
                          'button "Generate with assistant"', 'button "Build your own"'),
        'board-gallery-empty': ('No widgets match that search.',),
        'session': ('radiogroup "Session phase"',),
        'session-active': ('button "Roll for initiative"',),
        'session-call': ('button "Start round 1"', 'Awaiting roll'),
        'session-adjust': ('spinbutton "Initiative for ', 'button "Set"', 'button "Add condition"'),
    }
    for state in refreshed:
        for tier in ('desktop', 'rail', 'phone'):
            for theme in ('tavern', 'parchment', 'high-contrast'):
                name = f'refresh-{state}-{tier}-{theme}'
                snapshot = (EVIDENCE / 'aria' / f'{name}.yaml').read_text()
                for control in required[state]:
                    assert control in snapshot, (name, control)
                if state == 'board-gallery' and tier == 'phone':
                    assert 'dialog "Add widget"' in snapshot and 'button "Done"' in snapshot
                data = (EVIDENCE / 'screens' / f'{name}.webp').read_bytes()
                assert data[:4] == b'RIFF' and data[8:12] == b'WEBP', name
    for gap, story in [('G-01', '5.1'), ('G-02', '5.2'), ('G-03', '5.3'), ('G-04', '5.4'),
                       ('G-05', '5.6'), ('G-06', '5.9'), ('G-07', '5.7'), ('G-08', '5.8'), ('G-09', '5.10'), ('G-10', '5.11')]:
        assert re.search(r'^\|\s*' + gap + r'\s*\|.*WID-' + re.escape(story) + r'\b', matrix, re.M), gap
    print(f'PASS: {len(actual)} control occurrences, {len(manifest["controls"])} distinct mapped controls, '
          f'{len(manifest["aria_sha256"])} unchanged ARIA captures, 27 historical baseline + 72 refresh screenshots, 10 assigned gaps.')


if __name__ == '__main__':
    main()
