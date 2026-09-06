import {
	scaffoldCustomWidgetPackageDraft,
	type ScaffoldCustomWidgetPackageDraftInput,
} from '../../queries/widget-package-review';
import type { WidgetPackageDefinition, WidgetPlacement } from '../widget-package-state';

/**
 * The shared builder behind the starter library (RC-WID-1.6).
 *
 * Every starter is assembled by the SAME scaffolder a DM's own package goes through
 * ({@link scaffoldCustomWidgetPackageDraft}), so a starter is valid by construction and still faces
 * the full `widget.package.install` validation, review-summary and trust pipeline when it is
 * installed. Nothing here is privileged: a starter is an ordinary package that happens to ship with
 * the app, and nothing is fetched from anywhere.
 *
 * Two things the scaffolder does not decide are settled here:
 *
 * - `authoring` is re-stamped `workspace`. The scaffolder marks drafts `generated` because its usual
 *   caller is the assistant; these are first-party bundled definitions, not model output, and saying
 *   otherwise would misreport provenance in the review sheet.
 * - `placement` is declared explicitly rather than left to the schema's default, so what a starter
 *   may be dropped onto is part of its definition instead of an omission.
 */

/** The scene board plus the player view — where a starter is allowed to be placed. */
export const STARTER_PLACEMENT: WidgetPlacement = {
	surfaces: ['scene', 'player-view'],
	libraryListed: true,
};

export interface StarterWidgetBuildInput extends ScaffoldCustomWidgetPackageDraftInput {
	packageId: string;
	widgetType: string;
	description: string;
	placement?: WidgetPlacement;
}

export function buildStarterWidgetPackage(input: StarterWidgetBuildInput): WidgetPackageDefinition {
	const { placement, ...scaffoldInput } = input;
	const draft = scaffoldCustomWidgetPackageDraft(scaffoldInput);
	return {
		...draft.package,
		authoring: { source: 'workspace', createdBy: 'starter-library' },
		widgets: draft.package.widgets.map((widget) => ({
			...widget,
			placement: placement ?? STARTER_PLACEMENT,
		})),
	};
}

/**
 * One library entry. `name`/`description` are the spoken copy the widget manager lists, and they are
 * also what gets written into the installed package, so they stay in the source language: a campaign
 * should not store a different widget name depending on the locale the DM happened to install in.
 */
export interface StarterWidgetEntry {
	packageId: string;
	widgetType: string;
	name: string;
	description: string;
	/**
	 * Whether the starter ships CODE that runs in the sandbox (`custom-html-js`), as opposed to being
	 * drawn by one of the host's own template renderers. The widget manager says which, because "this
	 * one runs a program" is the single most important thing about a package before you enable it.
	 */
	shipsCode: boolean;
	/** Builds the package definition to install. Pure: same input, same package, every time. */
	build: () => WidgetPackageDefinition;
}
