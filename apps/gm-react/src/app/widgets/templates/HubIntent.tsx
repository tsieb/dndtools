import type { ReactNode, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	WIDGET_TEXT_MESSAGE_PREFIX,
	resolveWidgetIntent,
	type WidgetIntentDescriptor,
	type WidgetIntentRequest,
} from '@dndtools/core';
import { Button, Toaster } from '../../../ds';
import { useI18n, type MessageKey } from '../../../i18n';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { decideIntent } from '../hostBridge';
import type { WidgetTemplateProps } from './shared';

/**
 * RC-CAN-7.6 — stored text a hub template shows: an `i18n:` reference renders through the viewer's
 * catalog (and the active system's vocabulary), anything else exactly as written.
 */
export function useHubText(): (value: string | null | undefined) => string {
	const { t } = useI18n();
	return (value) => {
		if (!value) return '';
		return value.startsWith(WIDGET_TEXT_MESSAGE_PREFIX)
			? t(value.slice(WIDGET_TEXT_MESSAGE_PREFIX.length) as MessageKey)
			: value;
	};
}

/** What a hub control needs to act: follow the intent, or say why it cannot while editing. */
export interface HubControl {
	run: () => void;
	/** Set while the layout is being edited: the control is inert and says why. */
	unavailable?: string;
	label: string;
}

export interface HubActionProps extends WidgetTemplateProps {
	intent: WidgetIntentDescriptor;
	targetId?: string;
	children?: ReactNode;
	/** The hero's single gold action passes `primary`; rows default to ghost, accent when selected. */
	variant?: 'primary' | 'secondary' | 'accent' | 'ghost';
	size?: 'sm' | 'md' | 'lg';
	icon?: string;
	iconRight?: string;
	selected?: boolean;
	style?: CSSProperties;
	/** Pure preview/test seam. Live renderers always use the actor-scoped host gate. */
	onIntent?: (request: WidgetIntentRequest) => void;
	/**
	 * RC-CAN-7.6 — draw the control yourself (a scene tile, a launcher tile, a library card). The
	 * intent is still resolved and followed here, so every element a hub draws acts the same way.
	 */
	render?: (control: HubControl) => ReactNode;
}

export function HubIntent(props: HubActionProps) {
	const { t } = useI18n();
	if (!props.onIntent && props.onCommand && props.definition) return <LiveHubIntent {...props} />;
	return (
		<IntentControl
			{...props}
			unavailable={props.onIntent ? undefined : t('widgetTemplate.finishEditing')}
		/>
	);
}

function IntentControl({
	intent,
	targetId,
	children,
	variant,
	size,
	icon,
	iconRight,
	selected,
	style,
	onIntent,
	render,
	unavailable,
}: HubActionProps & { unavailable?: string }) {
	const text = useHubText();
	const label = text(intent.displayName);
	const run = () => {
		if (!unavailable) onIntent?.({ intentId: intent.id, targetId });
	};
	if (render) return <>{render({ run, unavailable, label })}</>;
	return (
		<Button
			variant={variant ?? (selected ? 'accent' : 'ghost')}
			size={size}
			icon={icon}
			iconRight={iconRight}
			data-widget-intent={intent.id}
			aria-current={selected ? 'true' : undefined}
			aria-disabled={unavailable ? true : undefined}
			title={unavailable}
			onClick={run}
			style={{ textAlign: 'left', ...style }}
		>
			{children ?? label}
		</Button>
	);
}

function LiveHubIntent(props: HubActionProps) {
	const runtime = useRuntime();
	const navigate = useNavigate();
	const { t } = useI18n();
	const request = { intentId: props.intent.id, targetId: props.targetId };
	if (
		resolveWidgetIntent({
			widgetInstanceId: props.widget.id,
			definition: props.definition!,
			request,
			approvedPermissions: [],
			state: runtime.state,
			actorId: runtime.activeActorId,
		}).decision !== 'resolved'
	)
		return null;
	return (
		<IntentControl
			{...props}
			onIntent={(next) => {
				const result = decideIntent(
					props.widget.id,
					props.definition!,
					next,
					[],
					runtime.state,
					runtime.activeActorId,
				);
				if (result.destination)
					navigate(result.destination.path, { state: result.destination.state });
				else Toaster.error(t('widgetTemplate.intentUnavailable'));
			}}
		/>
	);
}
