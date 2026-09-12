import { Hint, Wash } from './frame';

/**
 * The world and its people: drawings for the atlas, the character roster, NPCs and factions, the
 * community, invites, the party stash, and a list that could not load. Coordinates are on the
 * 160 × 160 canvas in `frame.tsx`.
 */
export const WORLD = {
	/** Atlas before the first map: a folded map with a dashed route, and a rolled one beneath it. */
	'map-library': (
		<>
			<path d="M28 44l32-10 40 12 32-10v70l-32 10-40-12-32 10z" />
			<path d="M60 34v70M100 46v70M110 76l8 8M118 76l-8 8" />
			<Hint>
				<path d="M40 94c10-14 20-6 28-18s22-14 34-6" />
			</Hint>
			<Wash>
				<rect x="34" y="122" width="92" height="12" rx="6" />
			</Wash>
			<circle cx="40" cy="128" r="2" />
		</>
	),
	/** Characters before the first one joins: an empty portrait frame and a blank nameplate. */
	'characters-empty': (
		<>
			<ellipse cx="80" cy="76" rx="38" ry="48" />
			<path d="M72 26q8-8 16 0" />
			<Hint>
				<circle cx="80" cy="66" r="13" />
				<path d="M56 110c2-14 12-22 24-22s22 8 24 22" />
			</Hint>
			<Wash>
				<rect x="60" y="128" width="40" height="10" rx="2" />
			</Wash>
		</>
	),
	/** Story NPCs before one is introduced: a hooded stranger nobody has named yet. */
	'npcs-empty': (
		<>
			<Wash>
				<path d="M80 28c-20 0-32 18-32 38v62h64V66c0-20-12-38-32-38z" />
			</Wash>
			<path d="M66 70c0-10 6-16 14-16s14 6 14 16-6 22-14 22-14-12-14-22zM36 132h88" />
			<path d="M74 70h.01M86 70h.01" strokeWidth="4" />
			<Hint>
				<path d="M64 100l-4 28M96 100l4 28" />
			</Hint>
		</>
	),
	/** Story factions before one is founded: one banner raised, the second pole's banner still dashed. */
	'factions-empty': (
		<>
			<path d="M40 30v102M100 42v90M28 132h104" />
			<circle cx="40" cy="26" r="4" />
			<circle cx="100" cy="38" r="4" />
			<Wash>
				<path d="M40 38h36v46l-18-10-18 10z" />
			</Wash>
			<circle cx="58" cy="56" r="7" />
			<Hint>
				<path d="M100 50h36v46l-18-10-18 10" />
			</Hint>
		</>
	),
	/** Community with nothing to discover: a tavern sign over an empty bench. */
	'community-empty': (
		<>
			<path d="M26 26v106M26 34h94M26 58l24-24M54 34v14M110 34v14" />
			<rect x="42" y="48" width="80" height="52" rx="6" />
			<Wash>
				<path d="M68 64h20v26H68z" />
			</Wash>
			<path d="M88 70h6a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-6M66 64c0-6 7-8 11-3 3-5 11-4 11 3" />
			<Hint>
				<path d="M56 122h56M62 122v10M106 122v10" />
			</Hint>
		</>
	),
	/** Player invites before one is sent: a sealed envelope, ready to go. */
	'invites-empty': (
		<>
			<rect x="32" y="48" width="96" height="66" rx="4" />
			<path d="M34 52l46 36 46-36M34 110l32-26M126 110l-32-26" />
			<Wash>
				<circle cx="80" cy="88" r="9" />
			</Wash>
			<Hint>
				<path d="M14 66h10M10 80h14M16 94h8" />
			</Hint>
		</>
	),
	/** The party stash with nothing in it: a chest standing open and empty. */
	'inventory-empty': (
		<>
			<path d="M40 76l6-32c8-8 60-8 68 0l6 32M52 44l-4 32M108 44l4 32" />
			<rect x="34" y="76" width="92" height="52" rx="4" />
			<path d="M34 94h92" />
			<Wash>
				<rect x="73" y="88" width="14" height="16" rx="2" />
			</Wash>
			<path d="M80 94v4" />
			<Hint>
				<path d="M50 66h60" />
			</Hint>
		</>
	),
	/** A list that could not load from the network: two chain links pulled apart, sparks between. */
	'connection-lost': (
		<>
			<g transform="rotate(-35 46 104)">
				<Wash>
					<rect x="14" y="90" width="64" height="28" rx="14" />
				</Wash>
				<rect x="26" y="99" width="40" height="10" rx="5" />
			</g>
			<g transform="rotate(-35 114 56)">
				<Wash>
					<rect x="82" y="42" width="64" height="28" rx="14" />
				</Wash>
				<rect x="94" y="51" width="40" height="10" rx="5" />
			</g>
			<Hint>
				<path d="M72 86l16-12" />
			</Hint>
			<path d="M76 66l-2-8M66 72l-7-3M84 94l2 8M94 88l7 3" />
		</>
	),
};
