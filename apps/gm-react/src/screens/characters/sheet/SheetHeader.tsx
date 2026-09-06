import { type Dispatch, type SetStateAction } from 'react';
import { Avatar, Badge, Button, IconButton, Input, Stat, VisibilityChip } from '../../../ds';
import type { DSChangeEvent, DSKeyboardEvent } from '../../../ds';
import { T, srOnly } from '../../../app/screen-kit';
import { type AdvancementState, type CharacterView } from '@dndtools/core';
import { BackBar, KIND_LABEL, KIND_TONE, subtitleOf, visChip } from '../shared';
import { useI18n } from '../../../i18n';

/** The sheet's back bar, live regions and identity header (portrait, name + rename, kind/visibility
 * chips, the DM edit-mode toggle). Extracted from Characters.tsx unchanged (RC-STB-2.6). */
export function SheetHeader({
	view,
	isDm,
	advancement,
	note,
	error,
	editMode,
	setEditMode,
	nameDraft,
	setNameDraft,
	editingName,
	setEditingName,
	setAttackRows,
	setShareDraft,
	saveName,
	onBack,
}: {
	view: CharacterView;
	isDm: boolean;
	advancement: AdvancementState | null;
	note: string;
	error: { text: string; field?: 'ac' | 'slots' | 'xp'; seq?: number } | null;
	editMode: boolean;
	setEditMode: Dispatch<SetStateAction<boolean>>;
	nameDraft: string;
	setNameDraft: (next: string) => void;
	editingName: boolean;
	setEditingName: (next: boolean) => void;
	setAttackRows: (next: { id?: string; name: string; detail: string }[] | null) => void;
	setShareDraft: (next: { visibility: string; sharedWith: string[] } | null) => void;
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
			{error && !error.field && (
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
								{isDm && (
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
					{isDm && (
						<Button
							variant={editMode ? 'primary' : 'secondary'}
							size="sm"
							icon="note-edit"
							onClick={() => {
								setEditMode((v) => !v);
								setAttackRows(null);
								setShareDraft(null);
							}}
						>
							{editMode ? 'Done' : 'Edit'}
						</Button>
					)}
				</div>
			</div>
		</>
	);
}
