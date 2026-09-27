# RC-POL-1.3 lossless PNG budget evidence

Before: 34660358 bytes. After: 33549556 bytes. Cap: 33554432 bytes.
Recompressed 102 PNGs using Python zlib level 9, largest savings first.
Only IDAT compression and CRC/length framing changed. Concatenated, inflated IDAT
bytes and every non-IDAT chunk were asserted identical before each write.
No pixels, dimensions, palettes, profiles, thresholds, or budget limits changed.
These companion-path edits make room for retained scene-editor acceptance captures.

| Baseline relative to tests/visual/**screenshots**    | Bytes saved |
| ---------------------------------------------------- | ----------: |
| `visual-desktop/graph-selected--dungeon.png`         |       23013 |
| `visual-desktop/graph-selected--scholar.png`         |       22837 |
| `visual-desktop/graph-selected--tavern.png`          |       22691 |
| `visual-desktop/graph-empty--tavern.png`             |       22177 |
| `visual-desktop/graph-empty--dungeon.png`            |       21267 |
| `visual-desktop/graph-empty--scholar.png`            |       20811 |
| `visual-desktop/graph--high-contrast.png`            |       20803 |
| `visual-desktop/graph--scholar.png`                  |       20785 |
| `visual-desktop/graph--tavern.png`                   |       20337 |
| `visual-desktop/graph--dungeon.png`                  |       20208 |
| `visual-desktop/graph-selected--high-contrast.png`   |       19851 |
| `visual-desktop/characters--high-contrast.png`       |       19515 |
| `visual-desktop/graph-empty--high-contrast.png`      |       18817 |
| `visual-rail/characters--high-contrast.png`          |       18602 |
| `visual-rail/characters--parchment.png`              |       17776 |
| `visual-desktop/characters--tavern.png`              |       17104 |
| `visual-rail/characters--tavern.png`                 |       16445 |
| `visual-desktop/characters--parchment.png`           |       16380 |
| `visual-desktop/graph-selected--parchment.png`       |       15596 |
| `visual-desktop/graph--parchment.png`                |       15430 |
| `visual-desktop/graph-empty--parchment.png`          |       15115 |
| `visual-phone/command-center--parchment.png`         |       13721 |
| `visual-rail/graph-selected--tavern.png`             |       13315 |
| `visual-rail/graph-selected--dungeon.png`            |       13216 |
| `visual-phone/command-center--tavern.png`            |       13101 |
| `visual-rail/graph-empty--high-contrast.png`         |       12950 |
| `visual-rail/graph-selected--high-contrast.png`      |       12767 |
| `visual-rail/graph-empty--dungeon.png`               |       12310 |
| `visual-desktop/audio-presets--high-contrast.png`    |       12297 |
| `visual-rail/graph-empty--tavern.png`                |       12297 |
| `visual-desktop/settings--high-contrast.png`         |       12023 |
| `visual-rail/play--high-contrast.png`                |       11736 |
| `visual-rail/graph-selected--scholar.png`            |       11414 |
| `visual-rail/graph--high-contrast.png`               |       11268 |
| `visual-rail/graph-empty--scholar.png`               |       11227 |
| `visual-desktop/play--high-contrast.png`             |       11034 |
| `visual-rail/play--tavern.png`                       |       10931 |
| `visual-desktop/player--high-contrast.png`           |       10867 |
| `visual-rail/play--parchment.png`                    |       10655 |
| `visual-phone/graph-empty--dungeon.png`              |       10494 |
| `visual-desktop/command-center--parchment.png`       |       10018 |
| `visual-phone/graph-empty--scholar.png`              |        9984 |
| `visual-phone/graph-empty--tavern.png`               |        9916 |
| `visual-desktop/command-center--tavern.png`          |        9905 |
| `visual-desktop/audio-loading--high-contrast.png`    |        9858 |
| `visual-rail/extensions--high-contrast.png`          |        9593 |
| `visual-desktop/extensions--high-contrast.png`       |        9534 |
| `visual-desktop/audio-automation--high-contrast.png` |        9459 |
| `visual-desktop/audio-playback--high-contrast.png`   |        9381 |
| `visual-desktop/play--tavern.png`                    |        9339 |
| `visual-desktop/command-center--high-contrast.png`   |        9230 |
| `visual-rail/settings--high-contrast.png`            |        9195 |
| `visual-desktop/audio-error--high-contrast.png`      |        9109 |
| `visual-rail/graph--tavern.png`                      |        9100 |
| `visual-rail/graph--dungeon.png`                     |        8963 |
| `visual-rail/command-center--high-contrast.png`      |        8881 |
| `visual-phone/characters--high-contrast.png`         |        8812 |
| `visual-desktop/play--parchment.png`                 |        8768 |
| `visual-rail/graph--scholar.png`                     |        8705 |
| `visual-rail/player--high-contrast.png`              |        8608 |
| `visual-desktop/scene-editor--high-contrast.png`     |        8560 |
| `visual-rail/command-center--parchment.png`          |        8516 |
| `visual-phone/graph-empty--high-contrast.png`        |        8435 |
| `visual-rail/graph-empty--parchment.png`             |        8373 |
| `visual-desktop/graph-repair--high-contrast.png`     |        8279 |
| `visual-rail/graph-selected--parchment.png`          |        8245 |
| `visual-desktop/extensions--tavern.png`              |        8238 |
| `visual-rail/command-center--tavern.png`             |        7991 |
| `visual-desktop/campaign--high-contrast.png`         |        7954 |
| `visual-phone/characters--tavern.png`                |        7656 |
| `visual-rail/extensions--tavern.png`                 |        7591 |
| `visual-desktop/extensions--parchment.png`           |        7558 |
| `visual-rail/extensions--dungeon.png`                |        7551 |
| `visual-desktop/extensions--scholar.png`             |        7548 |
| `visual-rail/extensions--scholar.png`                |        7374 |
| `visual-phone/characters--parchment.png`             |        7365 |
| `visual-rail/graph--parchment.png`                   |        7271 |
| `visual-rail/extensions--parchment.png`              |        7264 |
| `visual-desktop/extensions--dungeon.png`             |        7221 |
| `visual-phone/play--high-contrast.png`               |        7155 |
| `visual-phone/graph--high-contrast.png`              |        6908 |
| `visual-phone/command-center--high-contrast.png`     |        6837 |
| `visual-desktop/campaign--tavern.png`                |        6743 |
| `visual-desktop/scene-editor--tavern.png`            |        6627 |
| `visual-desktop/player--tavern.png`                  |        6538 |
| `visual-desktop/graph-repair--tavern.png`            |        6422 |
| `visual-rail/audio-presets--high-contrast.png`       |        6381 |
| `visual-phone/graph--dungeon.png`                    |        6188 |
| `visual-rail/campaign--high-contrast.png`            |        6158 |
| `visual-desktop/graph-repair--scholar.png`           |        6033 |
| `visual-desktop/audio-presets--scholar.png`          |        6006 |
| `visual-rail/graph-repair--tavern.png`               |        5933 |
| `visual-desktop/audio-delete--scholar.png`           |        5865 |
| `visual-desktop/graph-repair--dungeon.png`           |        5865 |
| `visual-rail/audio-error--high-contrast.png`         |        5842 |
| `visual-desktop/settings--parchment.png`             |        5837 |
| `visual-desktop/audio-presets--tavern.png`           |        5830 |
| `visual-rail/campaign--tavern.png`                   |        5825 |
| `visual-phone/play--tavern.png`                      |        5823 |
| `visual-desktop/scene-editor--parchment.png`         |        5822 |
| `visual-desktop/settings--tavern.png`                |        5820 |
| `visual-phone/graph--scholar.png`                    |        5813 |

## Reproduce the lossless check

From the committed candidate root, this compares every modified existing PNG to the
reviewed starting candidate. New captures and deleted glyphs are intentionally excluded.

```python
import struct
import subprocess
import zlib
from pathlib import Path


def content(data):
    offset, chunks, image_data = 8, [], []
    while offset < len(data):
        size = struct.unpack('>I', data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        value = data[offset + 8:offset + 8 + size]
        offset += size + 12
        if kind == b'IDAT':
            image_data.append(value)
        else:
            chunks.append((kind, value))
    return chunks, zlib.decompress(b''.join(image_data))


base = '86d1a36b6aad24d31ea43a29ae2051b3ce1535d7'
paths = subprocess.check_output([
    'git', 'diff', '--name-only', '--diff-filter=M', base, 'HEAD', '--', '*.png',
]).decode().splitlines()
assert len(paths) == 102
for path in paths:
    original = subprocess.check_output(['git', 'show', f'{base}:{path}'])
    assert content(original) == content(Path(path).read_bytes()), path
print('102 existing baselines retain identical image data and metadata')
```
