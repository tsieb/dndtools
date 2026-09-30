/**
 * RC-UX-1.2 ratchet for `no-literal-jsx-text`.
 *
 * Each entry is a file that still renders untranslated user-visible text, and the number of
 * strings it is allowed to keep. The rule fails when a file exceeds its number *and* when it
 * comes in under it — a migrated screen has to lower or delete its entry in the same commit, so
 * this list can only ever get shorter.
 *
 * Adding a file here is not a way to land new untranslated copy. New screens carry no entry, so
 * the first literal they render fails the gate.
 *
 * RC-UX-1.2 emptied this list: every file that renders user-visible text reads it out of
 * `apps/gm-react/src/i18n/messages`. It stays here as the ratchet's floor — the rule fails on the
 * first literal any file reintroduces, and nothing may be added back.
 *
 * The one exception is a widening of the rule itself. RC-ENG-10.1 taught it to read template
 * literals in `title`, `aria-label` and `alt` (`aria-label={`Remove ${tag}`}`), which surfaced
 * English that was already shipping in the files below. They are the old debt made visible, not
 * new copy, and they ratchet down like any other entry.
 */
export const allow = {
	'apps/gm-react/src/app/canvas/FlowBoard.tsx': 2,
	'apps/gm-react/src/app/charBuilder/steps/Abilities.tsx': 1,
	'apps/gm-react/src/app/charBuilder/ui.tsx': 2,
	'apps/gm-react/src/app/map/ToolOptionControls.tsx': 3,
	'apps/gm-react/src/app/map/canvas/MapMarkers.tsx': 1,
	'apps/gm-react/src/app/map/dock/LayersPanel.tsx': 1,
	'apps/gm-react/src/app/map/generate/ParamControls.tsx': 3,
	'apps/gm-react/src/app/widgets/SandboxHost.tsx': 1,
	'apps/gm-react/src/ds/components/condition/ConditionBadge.tsx': 1,
	'apps/gm-react/src/ds/components/domain/DiceResult.tsx': 1,
	'apps/gm-react/src/ds/components/domain/InitiativeRow.tsx': 1,
	'apps/gm-react/src/ds/components/forms/Slider.tsx': 2,
	'apps/gm-react/src/ds/components/map/LayerRow.tsx': 5,
	'apps/gm-react/src/ds/components/map/POIMarker.tsx': 1,
	'apps/gm-react/src/ds/components/map/POIPopover.tsx': 3,
	'apps/gm-react/src/screens/characters/sheet/SpellsPanel.tsx': 1,
};
