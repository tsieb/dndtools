import type React from 'react';
import { useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ScreenLayoutPolicy } from '@dndtools/core';
import { Button, IconButton, Menu, Switch } from '../../ds';
import { StackedLayoutToggle, type StackedPosture } from '../../app/canvas/StackedBoard';
import { Seg } from '../../app/screen-kit';
import { ViewAsControl } from '../../app/ViewAsControl';
import type { Viewport } from '../../app/useViewport';
import { useI18n } from '../../i18n';

const ROW: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 'var(--space-2)',
	// Long scene names and the rail tier's narrower pane still wrap rather than overflow.
	flexWrap: 'wrap',
	minWidth: 0,
};

const MENU_ITEM: CSSProperties = { width: '100%', justifyContent: 'flex-start' };
/** Buttons keep their size in the no-wrap phone row; only the scene name gives way. */
const FIXED: CSSProperties = { flex: '0 0 auto' };

export interface SceneToolbarProps {
	posture: StackedPosture;
	name: string;
	widgetCount: number;
	viewport: Viewport;
	layoutPolicy: ScreenLayoutPolicy;
	previewing: boolean;
	editing: boolean;
	metaOpen: boolean;
	addOpen: boolean;
	snap: boolean;
	/** The scene's own "View as" switcher; the host returns focus here when preview ends. */
	previewTriggerRef: React.RefObject<HTMLDivElement>;
	onToggleMeta: () => void;
	onToggleAdd: () => void;
	onGenerate: () => void;
	onEditing: (next: boolean) => void;
	onLayoutPolicy: (next: string) => void;
	onSnap: (next: boolean) => void;
}

/**
 * The scene editor's header (RC-POL-1.3). The first row names the scene and holds the mode switch:
 * back, name, details, "View as", then Edit layout / Done. Editing adds a second row of layout tools,
 * which used to share the first row and wrap unpredictably: on a desktop pane Done fell onto a
 * line of its own, and a phone took three lines. On a phone the mode switch closes the tools row,
 * and Snap and Generate move into a bounded menu so the row fits one line.
 */
export function SceneToolbar({
	posture,
	name,
	widgetCount,
	viewport,
	layoutPolicy,
	previewing,
	editing,
	metaOpen,
	addOpen,
	snap,
	previewTriggerRef,
	onToggleMeta,
	onToggleAdd,
	onGenerate,
	onEditing,
	onLayoutPolicy,
	onSnap,
}: SceneToolbarProps) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const phone = viewport === 'phone';
	const [moreOpen, setMoreOpen] = useState(false);
	const moreRef = useRef<HTMLSpanElement>(null);
	const canvas = layoutPolicy === 'canvas';
	// Phone controls meet the 44px touch floor: DS IconButton sizes are fixed (lg = 44px), and the
	// shared `Seg` pads its radios 7px, so its labels get a 30px box there.
	const iconSize = phone ? 'lg' : 'sm';
	const segLabel = (text: string) =>
		phone ? (
			<span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 30 }}>{text}</span>
		) : (
			text
		);

	// The subtle accent, as on the GM Screen: one gold primary per region (RC-ENG-8.4).
	const modeButton = previewing ? null : (
		<Button
			variant={editing ? 'accent' : 'secondary'}
			size="sm"
			icon={editing ? 'check' : 'edit'}
			onClick={() => onEditing(!editing)}
		>
			{editing ? t('sceneEditor.done') : t('sceneEditor.editLayout')}
		</Button>
	);

	const tools = editing && !previewing && (
		<>
			{/* ADR-041 — the policy picker. It is a durable scene property, so it lives beside the
			    other layout controls rather than in a settings dialog. */}
			<Seg
				ariaLabel={t('sceneEditor.layout')}
				value={layoutPolicy}
				onChange={onLayoutPolicy}
				options={[
					{
						value: 'flow',
						label: segLabel(t('sceneEditor.layoutFlow')),
						title: t('sceneEditor.layoutFlowHint'),
					},
					{
						value: 'canvas',
						label: segLabel(t('sceneEditor.layoutCanvas')),
						title: t('sceneEditor.layoutCanvasHint'),
					},
				]}
			/>
			{/* Snap is a CANVAS affordance: flow has no free coordinates to snap to. */}
			{canvas && !phone && (
				<Switch
					checked={snap}
					onChange={onSnap}
					label={
						<span
							style={{
								font: 'var(--text-xs) var(--font-sans)',
								color: 'var(--color-text-secondary)',
							}}
						>
							{t('sceneEditor.snap')}
						</span>
					}
				/>
			)}
			<Button
				variant="secondary"
				size="sm"
				icon="add"
				aria-expanded={addOpen}
				onClick={onToggleAdd}
			>
				{t('sceneEditor.add')}
			</Button>
			{phone ? (
				<div style={{ position: 'relative' }}>
					{/* DS IconButton takes no ref; the Menu only needs a node that contains its trigger. */}
					<span ref={moreRef} style={{ display: 'contents' }}>
						<IconButton
							icon="more"
							label={t('sceneEditor.moreTools')}
							variant="ghost"
							size="lg"
							aria-haspopup="menu"
							aria-expanded={moreOpen}
							onClick={() => setMoreOpen((v) => !v)}
						/>
					</span>
					{moreOpen && (
						<Menu
							triggerRef={moreRef}
							title={t('sceneEditor.moreTools')}
							width={240}
							onClose={() => setMoreOpen(false)}
							style={{
								position: 'absolute',
								top: '100%',
								left: 0,
								marginTop: 'var(--space-1)',
							}}
						>
							{canvas && (
								<Button
									role="menuitemcheckbox"
									aria-checked={snap}
									variant="ghost"
									size="sm"
									icon={snap ? 'check' : undefined}
									onClick={() => onSnap(!snap)}
									style={MENU_ITEM}
								>
									{t('sceneEditor.snap')}
								</Button>
							)}
							<Button
								role="menuitem"
								variant="ghost"
								size="sm"
								icon="sparkle"
								onClick={() => {
									setMoreOpen(false);
									onGenerate();
								}}
								style={MENU_ITEM}
							>
								{t('widgetGen.title')}
							</Button>
						</Menu>
					)}
				</div>
			) : (
				<Button variant="secondary" size="sm" icon="sparkle" onClick={onGenerate}>
					{t('widgetGen.title')}
				</Button>
			)}
		</>
	);

	return (
		<div
			data-testid="scene-editor-toolbar"
			style={{
				display: posture.hideChrome ? 'none' : 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				flex: '0 0 auto',
			}}
		>
			{/* A phone keeps this row on one line: the tools live on the next row now, so four 44px
			    buttons leave the name about half the width, and it truncates rather than pushing
			    View as onto a line of its own. */}
			<div style={phone ? { ...ROW, flexWrap: 'nowrap' } : ROW}>
				<IconButton
					icon="arrow-left"
					label={t('sceneEditor.backToScenes')}
					variant="ghost"
					size={phone ? 'lg' : 'md'}
					style={FIXED}
					onClick={() => navigate('/scenes')}
				/>
				<div style={{ minWidth: 0, flex: '0 1 auto' }}>
					{/* The shell's only <h1> is the section label ("Scenes"), so without a heading here
					    the page announced no way to tell WHICH scene is open. */}
					<h2
						title={name}
						style={{
							margin: 'var(--space-0)',
							font: '700 var(--text-xl) var(--font-display)',
							color: 'var(--color-text-primary)',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{name}
					</h2>
					<div
						style={{
							font: 'var(--text-xs) var(--font-sans)',
							color: 'var(--color-text-secondary)',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{/* "Pan and zoom" describes the free canvas only; a flow layout does neither. */}
						{t(
							canvas && !posture.stacked
								? 'sceneEditor.widgetSummary'
								: 'sceneEditor.widgetSummaryFlow',
							{
								count: widgetCount,
							},
						)}
					</div>
				</div>
				{!previewing && (
					<IconButton
						icon="edit"
						label={t('sceneEditor.editMeta')}
						variant="ghost"
						size={iconSize}
						style={FIXED}
						// The label is left alone deliberately — canvas.spec.ts locates this button by name.
						aria-expanded={metaOpen}
						onClick={onToggleMeta}
					/>
				)}
				<div style={{ flex: 1 }} />
				{/* RC-CAN-6.1 — this canvas's own "what player X sees" switcher. */}
				<div ref={previewTriggerRef} style={{ display: 'contents' }}>
					<ViewAsControl placement="scene" compact={phone} />
				</div>
				{!phone && modeButton}
			</div>
			{editing && !previewing && !phone && (
				<div role="group" aria-label={t('sceneEditor.editTools')} style={ROW}>
					{tools}
				</div>
			)}
			{phone && modeButton && (
				<div role="group" aria-label={t('sceneEditor.editTools')} style={ROW}>
					<StackedLayoutToggle posture={posture} />
					{tools}
					<div style={{ flex: 1 }} />
					{modeButton}
				</div>
			)}
		</div>
	);
}
