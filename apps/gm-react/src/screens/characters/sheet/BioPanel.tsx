import { Icon } from '../../../ds';
import { Panel } from '../../../app/screen-kit';
import { type CharacterView, type SearchHit } from '@dndtools/core';
import { T } from '../../../app/screen-kit';
import { useI18n } from '../../../i18n';

/** The character's bio and the notes that mention it (the same actor-filtered full-text read the
 * command palette uses). Extracted from Characters.tsx unchanged (RC-STB-2.6). */
export function BioPanel({
	view,
	mentions,
	onOpenMention,
}: {
	view: CharacterView;
	mentions: SearchHit[];
	onOpenMention: (hit: SearchHit) => void;
}) {
	const { t } = useI18n();
	return (
		<>
			{typeof view.data.bio === 'string' && view.data.bio.trim() !== '' && (
				<Panel title={t('characters.bio')}>
					<div style={{ font: `13px/1.6 ${T.sans}`, color: T.sub }}>{String(view.data.bio)}</div>
				</Panel>
			)}

			{mentions.length > 0 && (
				<Panel title={t('characters.mentionedIn')}>
					{mentions.map((hit) => (
						<button
							key={`${hit.type}:${hit.id}`}
							type="button"
							onClick={() => onOpenMention(hit)}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								padding: '6px 0',
								width: '100%',
								border: 'none',
								background: 'transparent',
								textAlign: 'left',
								cursor: 'pointer',
								font: `12.5px ${T.sans}`,
								color: T.acc,
							}}
							onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
							onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
						>
							<Icon
								name={hit.type === 'note' ? 'knowledge-book' : 'flag'}
								size={14}
								color={T.ter}
							/>
							<span
								style={{
									flex: 1,
									minWidth: 0,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
								}}
							>
								{hit.title}
							</span>
							<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
								{hit.type === 'note' ? 'Note' : 'Story entry'}
							</span>
						</button>
					))}
				</Panel>
			)}
		</>
	);
}
