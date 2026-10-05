import type { ReactNode, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	resolveWidgetIntent,
	type WidgetIntentDescriptor,
	type WidgetIntentRequest,
} from '@dndtools/core';
import { Button, Toaster } from '../../../ds';
import { useI18n } from '../../../i18n';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { decideIntent } from '../hostBridge';
import type { WidgetTemplateProps } from './shared';

export interface HubActionProps extends WidgetTemplateProps {
	intent: WidgetIntentDescriptor;
	targetId?: string;
	children?: ReactNode;
	/** The hero's single gold action passes `primary`; rows default to ghost, accent when selected. */
	variant?: 'primary' | 'accent' | 'ghost';
	selected?: boolean;
	style?: CSSProperties;
	/** Pure preview/test seam. Live renderers always use the actor-scoped host gate. */
	onIntent?: (request: WidgetIntentRequest) => void;
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
	selected,
	style,
	onIntent,
	unavailable,
}: HubActionProps & { unavailable?: string }) {
	return (
		<Button
			variant={variant ?? (selected ? 'accent' : 'ghost')}
			data-widget-intent={intent.id}
			aria-current={selected ? 'true' : undefined}
			aria-disabled={unavailable ? true : undefined}
			title={unavailable}
			onClick={() => onIntent?.({ intentId: intent.id, targetId })}
			style={{ textAlign: 'left', ...style }}
		>
			{children ?? intent.displayName}
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
