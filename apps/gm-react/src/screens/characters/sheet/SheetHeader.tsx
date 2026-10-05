import { Avatar, Badge, IconButton, Input, Stat, VisibilityChip } from '../../../ds';
import type { DSChangeEvent, DSKeyboardEvent } from '../../../ds';
import { T, srOnly } from '../../../app/screen-kit';
import { type AdvancementState, type CharacterView } from '@dndtools/core';
import { BackBar, KIND_LABEL, KIND_TONE, subtitleOf, visChip } from '../shared';
import { useI18n } from '../../../i18n';

/** The `/characters/:id` frame around the shared sheet body: the back bar, the frame's live regions
 * and the identity header (portrait, name + rename, kind/visibility chips, AC and level). Rename is
 * an owner-or-DM `character.edit-field`, so it is offered only for `canRename`. */
export function SheetHeader({
	view,
	canRename,
	advancement,
	note,
	error,
	nameDraft,
	setNameDraft,
	editingName,
	setEditingName,
	saveName,
	onBack,
}: {
	view: CharacterView;
	canRename: boolean;
	advancement: AdvancementState | null;
	note: string;
	error: { text: string; seq: number } | null;
	nameDraft: string;
	setNameDraft: (next: string) => void;
	editingName: boolean;
	setEditingName: (next: boolean) => void;
	saveName: () => Promise<void>;
	onBack: () => void;
}) {
	const { t } = useI18n();
	return (
		<>
			<BackBar onBack={onBack} />
			<div role="status" style={srOnly}>
				{note}
			</div>
			{error && (
				<div
					key={error.seq}
					role="alert"
					style={{ marginBottom: 12, font: `13px ${T.sans}`, color: T.err }}
				>
					{error.text}
				</div>
			)}
			<div
				style={{
					display: 'flex',
					alignItems: 'flex-start',
					gap: 16,
					marginBottom: 18,
					flexWrap: 'wrap',
				}}
			>
				<Avatar name={view.name} size="xl" ring="turn" />
				<div style={{ flex: 1, minWidth: 200 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
						{editingName ? (
							<Input
								value={nameDraft}
								autoFocus
								onChange={(e: DSChangeEvent) => setNameDraft(e.target.value)}
								onBlur={saveName}
								onKeyDown={(e: DSKeyboardEvent) => {
									if (e.key === 'Enter') saveName();
									if (e.key === 'Escape') setEditingName(false);
								}}
								style={{ font: `700 22px ${T.disp}`, width: 260 }}
							/>
						) : (
							<>
								<h2 style={{ margin: 0, font: `700 24px ${T.disp}` }}>{view.name}</h2>
								{canRename && (
									<IconButton
										icon="note-edit"
										label={t('characters.rename')}
										variant="ghost"
										size="sm"
										onClick={() => {
											setNameDraft(view.name);
											setEditingName(true);
										}}
									/>
								)}
							</>
						)}
						<Badge status={KIND_TONE[view.kind] || 'neutral'}>
							{KIND_LABEL[view.kind] ? t(KIND_LABEL[view.kind]) : view.kind}
						</Badge>
						<VisibilityChip level={visChip(view.visibility)} />
					</div>
					<div style={{ font: `13.5px ${T.sans}`, color: T.sub, marginTop: 4 }}>
						{subtitleOf(view, advancement?.level ?? null, t)}
					</div>
				</div>
				<div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
					<Stat label={t('characters.ac')} value={String(view.combat.ac)} icon="shield" />
					{advancement && <Stat label={t('characters.level')} value={String(advancement.level)} />}
				</div>
			</div>
		</>
	);
}
