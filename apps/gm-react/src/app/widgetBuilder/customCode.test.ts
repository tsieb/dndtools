import { describe, expect, it } from 'vitest';
import {
	buildWidgetPackageReviewSummary,
	dispatchCommand,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import {
	CUSTOM_CODE_SCAFFOLD,
	CUSTOM_ENTRY_PATH,
	CUSTOM_SCRIPT_PATH,
	CUSTOM_STYLE_PATH,
	customCodeAssets,
	formatCode,
	readCustomCode,
} from './customCode';
import { buildPackage, emptyDraft, readPackage, validateDraft, type WidgetDraft } from './draft';

/**
 * RC-WID-2.5 — the Advanced step's custom HTML/JS half.
 *
 * The assertions that matter are the ones the author cannot check by eye: that the three editors
 * become a package the CORE installs, that the package's assets are wired to each other so the
 * sandbox host can find the script and the stylesheet, that reading an installed package back
 * returns the code that was typed, and that the security summary the step prints live is the core's
 * own — including the fall to "review before trusting" the moment code is turned on.
 */

function accept(result: ReturnType<typeof dispatchCommand>): CoreStateSlice {
	if (result.status !== 'accepted') {
		throw new Error(`command rejected: ${JSON.stringify(result.rejection)}`);
	}
	return result.nextState;
}

function campaign(): { state: CoreStateSlice; run: (command: CoreCommand) => void } {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	return {
		get state() {
			return state;
		},
		run: (command: CoreCommand) => {
			state = accept(dispatchCommand(state, env, command));
		},
	};
}

function customDraft(): WidgetDraft {
	return {
		...emptyDraft(),
		packageId: 'workspace.torch-card',
		typeId: 'torch-card',
		name: 'Torch card',
		runtime: 'custom-html-js',
		customCode: { ...CUSTOM_CODE_SCAFFOLD },
	};
}

describe('RC-WID-2.5 custom code assets', () => {
	it('ships the three files and wires the entrypoint to both of them', () => {
		const assets = customCodeAssets(CUSTOM_CODE_SCAFFOLD);
		expect(assets.map((asset) => asset.path)).toEqual([
			CUSTOM_ENTRY_PATH,
			CUSTOM_STYLE_PATH,
			CUSTOM_SCRIPT_PATH,
		]);
		const entrypoint = assets[0]!;
		expect(entrypoint.entrypoint).toBe(true);
		// The sandbox host finds a package's code by reading these two tags out of the entrypoint
		// document, so an author who never wrote them still ships a widget that runs.
		expect(entrypoint.content).toContain(`<link rel="stylesheet" href="./${CUSTOM_STYLE_PATH}" />`);
		expect(entrypoint.content).toContain(`<script src="./${CUSTOM_SCRIPT_PATH}"></script>`);
		expect(entrypoint.content).toContain('<h1 data-title>Widget</h1>');
	});

	it('reads its own document back into the three editors unchanged', () => {
		const source = {
			html: '<p class="a">Hi</p>\n<p>Bye</p>',
			css: '.a { color: red; }',
			js: 'var a = 1;',
		};
		expect(readCustomCode(customCodeAssets(source), CUSTOM_ENTRY_PATH)).toEqual(source);
	});

	it('shows a foreign entrypoint whole rather than guessing at its body', () => {
		const foreign = '<html><body><p>Imported</p></body></html>';
		const read = readCustomCode(
			[{ path: CUSTOM_ENTRY_PATH, content: foreign, contentEncoding: 'utf-8' }],
			CUSTOM_ENTRY_PATH,
		);
		expect(read.html).toBe(foreign);
	});
});

describe('RC-WID-2.5 the format button', () => {
	it('re-indents by nesting depth and collapses blank runs', () => {
		expect(formatCode('css', '.a {\ncolor: red;\n\n\n}\n')).toBe('.a {\n  color: red;\n\n}');
		expect(formatCode('js', 'function a() {\nif (b) {\nc();\n}\n}')).toBe(
			'function a() {\n  if (b) {\n    c();\n  }\n}',
		);
		expect(formatCode('html', '<section>\n<p>Hi</p>\n</section>')).toBe(
			'<section>\n  <p>Hi</p>\n</section>',
		);
	});

	it('does not rewrite the code it indents', () => {
		const source = 'var greeting = "a { b }";\nwindow.dndtoolsWidget.setHeight(10);';
		expect(
			formatCode('js', source)
				.split('\n')
				.map((line) => line.trim()),
		).toEqual(source.split('\n'));
	});

	it('leaves a void element from indenting what follows it', () => {
		expect(formatCode('html', '<div>\n<img src="a.png" />\n<br>\n<span>x</span>\n</div>')).toBe(
			'<div>\n  <img src="a.png" />\n  <br>\n  <span>x</span>\n</div>',
		);
	});
});

describe('RC-WID-2.5 custom widgets through the core', () => {
	it('builds a custom-html-js package the core installs, unreviewed and disabled', () => {
		const box = campaign();
		box.run({
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: buildPackage(customDraft()) },
		});
		const record = box.state.widgets.packages['workspace.torch-card'];
		expect(record).toBeDefined();
		const definition = record!.package.widgets[0]!;
		expect(definition.renderEntrypoint?.runtime).toBe('custom-html-js');
		expect(definition.renderEntrypoint?.assetPath).toBe(CUSTOM_ENTRY_PATH);
		expect(definition.renderEntrypoint?.sandbox).toBe('iframe');
		expect(definition.style?.stylesheetAssetPaths).toEqual([CUSTOM_STYLE_PATH]);
		expect(record!.package.assets).toHaveLength(3);
		expect(record!.enabled).toBe(false);
		expect(record!.trust.state).toBe('unreviewed');
	});

	it('round-trips the code through an installed package', () => {
		const draft = customDraft();
		const back = readPackage(buildPackage(draft));
		expect(back.runtime).toBe('custom-html-js');
		expect(back.customCode).toEqual(draft.customCode);
	});

	it('recomputes the core’s trust recommendation as soon as code is turned on', () => {
		const template = buildWidgetPackageReviewSummary(
			buildPackage({ ...customDraft(), runtime: 'template' }),
		);
		expect(template.customCodeWidgets).toEqual([]);
		expect(template.trustRecommendation).toBe('trusted-after-review');

		const custom = buildWidgetPackageReviewSummary(buildPackage(customDraft()));
		expect(custom.customCodeWidgets).toEqual(['torch-card']);
		expect(custom.trustRecommendation).toBe('requires-review');
	});

	it('carries the SEC-011 destination classes into the review summary', () => {
		const summary = buildWidgetPackageReviewSummary(
			buildPackage({
				...customDraft(),
				hostPermissions: ['network'],
				networkDestinations: ['widget-declared'],
			}),
		);
		expect(summary.requestedHostPermissions).toEqual(['network']);
		expect(summary.requestedNetworkDestinations).toEqual(['widget-declared']);
	});

	it('declares no network destinations at all when none are asked for', () => {
		const definition = buildPackage(customDraft()).widgets[0]!;
		expect(definition.networkDestinationClasses).toBeUndefined();
	});
});

describe('RC-WID-2.5 what the step refuses to install', () => {
	it('names the empty custom widget rather than installing something that draws nothing', () => {
		const issues = validateDraft({
			...customDraft(),
			customCode: { html: '', css: '.a {}', js: '  ' },
		});
		expect(issues).toContainEqual(
			expect.objectContaining({ step: 'advanced', field: 'customCode' }),
		);
	});

	it('refuses a network permission scoped to no destination, and a destination with no permission', () => {
		const noDestination = validateDraft({ ...customDraft(), hostPermissions: ['network'] });
		expect(noDestination).toContainEqual(
			expect.objectContaining({
				field: 'networkDestinations',
				message: 'builder.issue.networkDestinations',
			}),
		);
		const noPermission = validateDraft({
			...customDraft(),
			networkDestinations: ['analytics'],
		});
		expect(noPermission).toContainEqual(
			expect.objectContaining({
				field: 'networkDestinations',
				message: 'builder.issue.networkWithoutPermission',
			}),
		);
	});

	it('leaves a template widget alone', () => {
		expect(
			validateDraft({
				...customDraft(),
				runtime: 'template',
				customCode: { html: '', css: '', js: '' },
			}),
		).toEqual([]);
	});
});
