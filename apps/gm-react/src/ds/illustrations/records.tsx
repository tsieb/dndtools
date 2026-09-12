import { Hint, Wash } from './frame';

/**
 * The written record: drawings for knowledge, journals, the story (quests, calendar, timeline), the
 * graph, publishing, and a search that found nothing. Coordinates are on the 160 × 160 canvas in
 * `frame.tsx`.
 */
export const RECORDS = {
	/** Knowledge before the first page: an open book with blank lines and a quill laid on it. */
	'knowledge-empty': (
		<>
			<path d="M24 62v50c20-8 38-8 56 0 18-8 36-8 56 0V62" />
			<path d="M28 106V56c18-8 36-8 52 0v50c-16-8-34-8-52 0zM80 56c16-8 34-8 52 0v50c-18-8-36-8-52 0" />
			<Hint>
				<path d="M92 68h28M92 78h28M92 88h18" />
			</Hint>
			<Wash>
				<path d="M104 24c-14 6-26 20-32 36 12-6 24-18 32-36z" />
			</Wash>
			<path d="M72 60 56 92" />
		</>
	),
	/** A search or filter that matched nothing: a magnifier over an empty dashed line. */
	'search-none': (
		<>
			<circle cx="70" cy="68" r="32" />
			<path d="M52 56a20 20 0 0 1 14-10" />
			<Wash>
				<path d="M93 91l31 31a5 5 0 0 1-7 7L86 98z" />
			</Wash>
			<Hint>
				<path d="M56 68h28" />
			</Hint>
			<path d="M34 118h.01M44 128h.01M28 132h.01" strokeWidth="4" />
		</>
	),
	/** The player journal before the first entry: a closed notebook with a blank label and ribbon. */
	'journal-empty': (
		<>
			<rect x="42" y="26" width="76" height="104" rx="6" />
			<path d="M56 26v104" />
			<rect x="68" y="44" width="38" height="22" rx="3" />
			<Hint>
				<path d="M68 84h38M68 96h26" />
			</Hint>
			<Wash>
				<path d="M100 130v14l5-5 5 5v-14z" />
			</Wash>
		</>
	),
	/** Story quests before one starts: a sealed scroll with nothing written yet. */
	'quests-empty': (
		<>
			<rect x="38" y="30" width="84" height="14" rx="7" />
			<rect x="38" y="116" width="84" height="14" rx="7" />
			<path d="M48 44v72M112 44v72" />
			<Hint>
				<path d="M58 60h44M58 72h44M58 84h24" />
			</Hint>
			<Wash>
				<circle cx="96" cy="94" r="9" />
			</Wash>
			<path d="M91 101l-4 12M101 101l4 12" />
		</>
	),
	/** A calendar with no events: a page showing the moon waxing from new to full. */
	'calendar-empty': (
		<>
			<rect x="34" y="38" width="92" height="88" rx="6" />
			<path d="M34 58h92M58 30v16M102 30v16" />
			<Hint>
				<circle cx="54" cy="84" r="8" />
				<path d="M46 108h68" />
			</Hint>
			<circle cx="80" cy="84" r="8" />
			<Wash>
				<path d="M80 76a8 8 0 0 1 0 16z" />
				<circle cx="106" cy="84" r="8" />
			</Wash>
		</>
	),
	/** A timeline before anything happens: one flag planted, and the road ahead still dashed. */
	'timeline-empty': (
		<>
			<path d="M24 118c28 0 28-28 56-28M80 85V50" />
			<Hint>
				<path d="M80 90c28 0 28-28 51-28" />
				<circle cx="136" cy="62" r="5" />
			</Hint>
			<Wash>
				<circle cx="24" cy="118" r="5" />
				<circle cx="80" cy="90" r="5" />
				<path d="M80 50l24 8-24 8z" />
			</Wash>
		</>
	),
	/** The graph before any links exist: three nodes, and dashed links and nodes still to be made. */
	'graph-empty': (
		<>
			<path d="M73 62 50 90M87 62l23 28" />
			<Hint>
				<path d="M54 98h52M91 47l20-10M80 64v44" />
				<circle cx="118" cy="32" r="8" />
				<circle cx="80" cy="116" r="8" />
			</Hint>
			<Wash>
				<circle cx="80" cy="52" r="12" />
			</Wash>
			<circle cx="44" cy="98" r="10" />
			<circle cx="116" cy="98" r="10" />
		</>
	),
	/** Nothing published yet: a ribboned bundle of pages, and the dashed way up it has not taken. */
	'publish-empty': (
		<>
			<path d="M48 72v-8h80v60h-8" />
			<rect x="36" y="72" width="84" height="58" rx="4" />
			<path d="M78 72v58M36 100h84" />
			<Wash>
				<path d="M78 100c-6-10-18-12-18-4s12 8 18 4z" />
				<path d="M78 100c6-10 18-12 18-4s-12 8-18 4z" />
			</Wash>
			<Hint>
				<path d="M78 56V24M66 36l12-12 12 12" />
			</Hint>
		</>
	),
};
