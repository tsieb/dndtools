import { Hint, Wash } from './frame';

/**
 * At the table: drawings for the surfaces a GM runs a session from (board, scenes, combat, dice,
 * audio, spells) and for the player view. Coordinates are on the 160 × 160 canvas in `frame.tsx`.
 */
export const TABLE = {
	/** Board with no tiles: the table and the dashed slots a first tile would fill. */
	'session-board-empty': (
		<>
			<rect x="24" y="36" width="112" height="80" rx="8" />
			<path d="M46 116l-6 16M114 116l6 16" />
			<Hint>
				<rect x="36" y="48" width="42" height="28" rx="4" />
				<rect x="86" y="48" width="38" height="18" rx="4" />
				<rect x="86" y="74" width="38" height="30" rx="4" />
				<rect x="36" y="84" width="42" height="20" rx="4" />
			</Hint>
			<path d="M57 56v12M51 62h12" />
		</>
	),
	/** A note tile with nothing written on it: a pinned card and a pencil waiting beside it. */
	'note-tile-empty': (
		<>
			<g transform="rotate(-5 80 82)">
				<rect x="42" y="34" width="76" height="92" rx="6" />
				<Hint>
					<path d="M54 62h52M54 76h52M54 90h34" />
				</Hint>
			</g>
			<Wash>
				<circle cx="76" cy="38" r="6" />
				<path d="M107 127l26-26 6 6-26 26z" />
			</Wash>
			<path d="M107 127l-3 9 9-3M128 106l6 6" />
		</>
	),
	/** Scenes before the first one: an empty stage under a dashed spotlight. */
	'scenes-empty': (
		<>
			<path d="M26 128V46a12 12 0 0 1 12-12h84a12 12 0 0 1 12 12v82" />
			<path d="M26 48c12 10 24 10 36 0c12 10 24 10 36 0c12 10 24 10 36 0" />
			<Wash>
				<path d="M26 50C30 76 34 102 28 128h16C46 100 42 72 40 58c-6-1-10-4-14-8z" />
				<path d="M134 50C130 76 126 102 132 128h-16C114 100 118 72 120 58c6-1 10-4 14-8z" />
			</Wash>
			<path d="M31 94l11 2M129 94l-11 2M16 128h128M24 136h112" />
			<Hint>
				<ellipse cx="80" cy="116" rx="24" ry="6" />
			</Hint>
		</>
	),
	/** No combat running: a shield at rest with the sword laid down in front of it. */
	'combat-idle': (
		<>
			<Wash>
				<path d="M80 26c14 8 28 10 38 8v32c0 24-16 40-38 50-22-10-38-26-38-50V34c10 2 24 0 38-8z" />
			</Wash>
			<circle cx="80" cy="68" r="8" />
			<Hint>
				<path d="M80 36v24M80 76v30" />
			</Hint>
			<path d="M60 128h60l8 5-8 5H60zM60 121v24M60 133H42" />
			<circle cx="37" cy="133" r="5" />
		</>
	),
	/** Random tables before one exists: a d20 over a table with empty rows. */
	'tables-empty': (
		<>
			<Wash>
				<path d="M80 24l24 14v28L80 80 56 66V38z" />
			</Wash>
			<path d="M68 46h24l-12 20zM80 24 68 46M80 24l12 22M56 38l12 8M104 38l-12 8M56 66l12-20M104 66 92 46M56 66h48M80 80V66" />
			<rect x="36" y="94" width="88" height="40" rx="4" />
			<path d="M36 106h88M58 106v28" />
			<Hint>
				<path d="M68 116h44M68 126h32M46 116h4M46 126h4" />
			</Hint>
		</>
	),
	/** The player view waiting for the table to open: an hourglass running beside a lit candle. */
	'play-waiting': (
		<>
			<path d="M40 36h48M40 128h48" />
			<path d="M46 36c0 26 18 34 18 46s-18 20-18 46M82 36c0 26-18 34-18 46s18 20 18 46" />
			<Wash>
				<path d="M52 52h24c-2 10-8 16-12 20-4-4-10-10-12-20z" />
				<path d="M50 128c2-12 8-18 14-18s12 6 14 18z" />
			</Wash>
			<Hint>
				<path d="M64 76v30" />
			</Hint>
			<rect x="104" y="88" width="16" height="40" rx="2" />
			<path d="M96 128h32M112 84v4" />
			<Wash>
				<path d="M112 62c-6 8-6 16 0 20 6-4 6-12 0-20z" />
			</Wash>
		</>
	),
	/** Audio before any sound is added: a lute, and dashed waves where the music would be. */
	'audio-empty': (
		<>
			<Wash>
				<path d="M60 130c-18 0-26-18-20-32s22-22 36-14 18 28 6 38c-6 5-12 8-22 8z" />
			</Wash>
			<circle cx="62" cy="106" r="7" />
			<path d="M74 88l34-42M82 94l34-42M108 46l8-10 8 8-8 8M54 116l58-67" />
			<Hint>
				<path d="M124 78c5 5 5 13 0 18M134 70c10 10 10 24 0 34" />
			</Hint>
		</>
	),
	/** No spells or slots: a focus crystal, with a spark still to come. */
	'spells-empty': (
		<>
			<Wash>
				<path d="M80 28l24 32-24 66-24-66z" />
			</Wash>
			<path d="M56 60h48M70 60l10-32 10 32M70 60l10 66 10-66M122 30v16M114 38h16" />
			<Hint>
				<path d="M38 88v12M32 94h12" />
				<ellipse cx="80" cy="132" rx="26" ry="4" />
			</Hint>
		</>
	),
};
