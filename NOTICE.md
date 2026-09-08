# Third-Party Content Notices

## System Reference Document 5.1 (bundled compendium data)

The bundled compendium dataset at `apps/gm-react/src/assets/srd/` includes material taken
from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available
at <https://dnd.wizards.com/resources/systems-reference-document>. The SRD 5.1 is licensed
under the Creative Commons Attribution 4.0 International License, available at
<https://creativecommons.org/licenses/by/4.0/legalcode>.

The dataset was retrieved via the Open5e API (<https://api.open5e.com>), filtered to the
SRD 5.1 document only. Content fetched at runtime from the Open5e API is filtered to the
SRD document by default; other documents load only behind an explicit user opt-in that
displays each source's own license.

This attribution is also shown in-app on the Compendium surface.

## Bundled audio starter pack

The ambience loops at `apps/gm-react/public/audio/starter/` are dedicated to the public domain
under CC0 1.0 Universal (<https://creativecommons.org/publicdomain/zero/1.0/>). No attribution is
required to use, modify, or redistribute them.

They contain no third-party recordings. Each loop is synthesised from
`apps/gm-react/scripts/generate-starter-audio.mjs`, which is deterministic — re-running it
reproduces the committed bytes, so the licence claim can be audited rather than taken on trust.

| Track             | File                    | Licence |
| ----------------- | ----------------------- | ------- |
| Wind over stone   | `wind-over-stone.wav`   | CC0 1.0 |
| Hearth and embers | `hearth-and-embers.wav` | CC0 1.0 |
| Cavern drone      | `cavern-drone.wav`      | CC0 1.0 |

`public/audio/starter/manifest.json` is the machine-readable form of this table, and the pack's
installer refuses to install any track whose manifest entry does not declare a cleared licence
(and, for `cc-by`, an attribution). A track added to the folder without a manifest entry is not
installed either — see `apps/gm-react/src/runtime/audio-starter-pack.ts`.
