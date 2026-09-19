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
    for gap, story in [('G-01', '5.1'), ('G-02', '5.2'), ('G-03', '5.3'), ('G-04', '5.4'),
                       ('G-05', '5.6'), ('G-06', '5.9'), ('G-07', '5.7'), ('G-08', '5.8'), ('G-09', '5.10'), ('G-10', '5.11')]:
        assert re.search(r'^\|\s*' + gap + r'\s*\|.*WID-' + re.escape(story) + r'\b', matrix, re.M), gap
    print(f'PASS: {len(actual)} control occurrences, {len(manifest["controls"])} distinct mapped controls, '
          f'{len(manifest["aria_sha256"])} unchanged ARIA captures, 27 route/theme/tier screenshots, 10 assigned gaps.')


if __name__ == '__main__':
    main()
