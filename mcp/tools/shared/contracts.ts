import { z } from 'zod';
import { objectRelationshipSchema, vaultObjectTypeSchema } from './object-schema.js';

export type ToolPermission = 'read-only' | 'write-staged' | 'write-direct';
export type ToolRetryPolicy = 'idempotent' | 'idempotency-key-required';

export interface ToolContract {
	permission: ToolPermission;
	retryPolicy: ToolRetryPolicy;
	responseSchema: z.ZodTypeAny;
	remediationHint: string;
}

const noteSummarySchema = z
	.object({
		id: z.string().min(1),
		title: z.string().min(1),
		folder: z.string().min(1),
		filePath: z.string().nullable(),
		tags: z.array(z.string()),
		updatedAt: z.string().min(1),
		deleted: z.boolean(),
	})
	.strict();

const tagCountSchema = z
	.object({
		name: z.string().min(1),
		count: z.number().int().nonnegative(),
	})
	.strict();

const sessionBoardTileStyleSchema = z
	.object({
		backgroundColor: z.string().optional(),
		borderColor: z.string().optional(),
		borderWidth: z.number().optional(),
		borderRadius: z.number().optional(),
		opacity: z.number().optional(),
		scale: z.number().optional(),
	})
	.strict();

const sessionBoardTileSchema = z
	.object({
		id: z.string().min(1),
		type: z.enum(['note', 'calendar', 'timer', 'combat']).optional(),
		noteId: z.string().min(1).optional(),
		previewDepth: z.enum(['title', 'summary', 'full']).optional(),
		previewLineCount: z.number().int().min(1).max(40).optional(),
		timer: z.record(z.string(), z.unknown()).optional(),
		combat: z.record(z.string(), z.unknown()).optional(),
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
		style: sessionBoardTileStyleSchema.optional(),
	})
	.superRefine((tile, ctx) => {
		const type = tile.type ?? 'note';
		if (type === 'calendar' || type === 'timer' || type === 'combat') return;
		if (!tile.noteId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'noteId is required for note tiles.',
				path: ['noteId'],
			});
		}
	})
	.strict();

const sessionBoardSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().min(1),
		description: z.string(),
		tiles: z.array(sessionBoardTileSchema),
		layout: z
			.object({
				columns: z.number(),
				rowHeight: z.number(),
				minRows: z.number(),
				gap: z.number(),
			})
			.strict()
			.optional(),
		style: z
			.object({
				backgroundColor: z.string().optional(),
				backgroundPattern: z.enum(['none', 'grid', 'dots']).optional(),
				sectionTintColor: z.string().optional(),
				sectionTintOpacity: z.number().optional(),
			})
			.strict()
			.optional(),
		sessionContext: z
			.object({
				collapsed: z.boolean(),
				items: z.array(
					z
						.object({
							noteId: z.string().min(1),
							category: z.enum(['npc', 'location', 'quest', 'party']),
							pinnedAt: z.string().min(1),
						})
						.strict(),
				),
			})
			.strict()
			.optional(),
		createdAt: z.string().min(1),
		updatedAt: z.string().min(1),
	})
	.strict();

const vaultObjectSummarySchema = z
	.object({
		id: z.string().min(1),
		type: vaultObjectTypeSchema,
		name: z.string().min(1),
		summary: z.string(),
		tags: z.array(z.string()),
		updatedAt: z.string().min(1),
	})
	.strict();

const objectSummaryWithEmbedSchema = vaultObjectSummarySchema
	.extend({
		embed: z.string().min(1),
	})
	.strict();

const fullObjectWithEmbedSchema = z
	.object({
		id: z.string().min(1),
		type: vaultObjectTypeSchema,
		name: z.string().min(1),
		summary: z.string(),
		tags: z.array(z.string()),
		relationships: z.array(objectRelationshipSchema).optional(),
		data: z.record(z.string(), z.unknown()),
		createdAt: z.string().min(1),
		updatedAt: z.string().min(1),
		embed: z.string().min(1),
	})
	.strict();

const linkGraphSchema = z
	.object({
		nodeCount: z.number().int().nonnegative(),
		edgeCount: z.number().int().nonnegative(),
		nodes: z.array(
			z
				.object({
					id: z.string().min(1),
					title: z.string().min(1),
					folder: z.string().min(1),
					tags: z.array(z.string()),
					deleted: z.boolean(),
				})
				.strict(),
		),
		edges: z.array(
			z
				.object({
					sourceId: z.string().min(1),
					targetId: z.string().min(1),
					displayText: z.string(),
					position: z.number().int().nonnegative(),
				})
				.strict(),
		),
		quality: z
			.object({
				orphanCount: z.number().int().nonnegative(),
				orphanNoteIds: z.array(z.string().min(1)),
				deadLinkCount: z.number().int().nonnegative(),
				deadLinks: z.array(
					z
						.object({
							sourceId: z.string().min(1),
							sourceTitle: z.string().min(1),
							targetLabel: z.string().min(1),
							count: z.number().int().positive(),
						})
						.strict(),
				),
				highCentrality: z.array(
					z
						.object({
							noteId: z.string().min(1),
							title: z.string().min(1),
							inbound: z.number().int().nonnegative(),
							outbound: z.number().int().nonnegative(),
							degree: z.number().int().nonnegative(),
							betweenness: z.number().nonnegative(),
						})
						.strict(),
				),
			})
			.strict()
			.nullable(),
	})
	.strict();

const healthIssueSchema = z
	.object({
		type: z.enum([
			'broken_link',
			'orphan',
			'empty_note',
			'untagged',
			'root_folder',
			'duplicate_title',
		]),
		severity: z.enum(['warning', 'info']),
		noteId: z.string().min(1),
		noteTitle: z.string().min(1),
		detail: z.string().min(1),
		suggestion: z.string().min(1),
	})
	.strict();

const coverageGapSchema = z
	.object({
		key: z.enum([
			'orphan_notes',
			'untagged_notes',
			'root_folder_notes',
			'duplicate_titles',
			'stale_notes',
		]),
		severity: z.enum(['low', 'medium', 'high']),
		count: z.number().int().nonnegative(),
		ratio: z.number().nonnegative(),
		message: z.string().min(1),
		suggestedAction: z.string().min(1),
		exampleNoteIds: z.array(z.string().min(1)),
	})
	.strict();

const campaignHealthSchema = z
	.object({
		score: z.number().int().min(0).max(100),
		status: z.enum(['healthy', 'watch', 'needs_attention']),
		summary: z.string().min(1),
		dimensions: z.array(
			z
				.object({
					name: z.enum(['connectivity', 'organization', 'freshness']),
					score: z.number().int().min(0).max(100),
					detail: z.string().min(1),
				})
				.strict(),
		),
	})
	.strict();

const noteSnapshotSchema = z
	.object({
		id: z.string().min(1),
		title: z.string().min(1),
		folder: z.string().min(1),
		tags: z.array(z.string()),
		updatedAt: z.string().min(1),
		daysSinceUpdate: z.number().int().nonnegative().optional(),
	})
	.strict();

const worldDateSummarySchema = z
	.object({
		dayOffset: z.number().int(),
		short: z.string().min(1),
		iso: z.string().min(1),
	})
	.strict();

const calendarEventSummarySchema = z
	.object({
		noteId: z.string().min(1),
		title: z.string().min(1),
		kind: z.enum(['timeline_event', 'session_note']),
		dayOffset: z.number().int(),
		dateShort: z.string().min(1),
		dateIso: z.string().min(1),
		summary: z.string(),
	})
	.strict();

export const MCP_TOOL_CONTRACTS: Record<string, ToolContract> = {
	list_notes: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z.array(noteSummarySchema),
		remediationHint: 'Use folder/tag filters and retry.',
	},
	read_note: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z
			.object({
				id: z.string().min(1),
				title: z.string().min(1),
				folder: z.string().min(1),
				filePath: z.string().nullable(),
				tags: z.array(z.string()),
				frontmatter: z.record(z.string(), z.unknown()),
				content: z.string(),
				createdAt: z.string().min(1),
				updatedAt: z.string().min(1),
				deleted: z.boolean(),
				pinned: z.boolean(),
			})
			.strict(),
		remediationHint: 'Call list_notes to find a valid note id/title.',
	},
	create_note: {
		permission: 'write-staged',
		retryPolicy: 'idempotency-key-required',
		responseSchema: z
			.object({
				id: z.string().min(1),
				title: z.string().min(1),
				folder: z.string().min(1),
				filePath: z.string().nullable(),
				tags: z.array(z.string()),
			})
			.strict(),
		remediationHint: 'Provide idempotencyKey for safe create retries.',
	},
	update_note: {
		permission: 'write-staged',
		retryPolicy: 'idempotency-key-required',
		responseSchema: z
			.object({
				id: z.string().min(1),
				title: z.string().min(1),
				folder: z.string().min(1),
				filePath: z.string().nullable(),
				tags: z.array(z.string()),
				updatedAt: z.string().min(1),
			})
			.strict(),
		remediationHint: 'Read the note first, then retry with a stable idempotencyKey.',
	},
	delete_note: {
		permission: 'write-staged',
		retryPolicy: 'idempotency-key-required',
		responseSchema: z
			.object({
				id: z.string().min(1),
				title: z.string().min(1),
				permanent: z.boolean(),
				status: z.enum(['trashed', 'deleted']),
			})
			.strict(),
		remediationHint: 'Use permanent=false by default and pass idempotencyKey for retries.',
	},
	restore_note: {
		permission: 'write-staged',
		retryPolicy: 'idempotent',
		responseSchema: z
			.object({
				id: z.string().min(1),
				title: z.string().min(1),
				status: z.literal('active'),
				changed: z.boolean(),
			})
			.strict(),
		remediationHint: 'Use list_notes includeDeleted=true to verify restorable notes.',
	},
	search_notes: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z.array(
			z
				.object({
					id: z.string().min(1),
					title: z.string().min(1),
					folder: z.string().min(1),
					filePath: z.string().nullable(),
					tags: z.array(z.string()),
					score: z.number(),
					snippet: z.string(),
				})
				.strict(),
		),
		remediationHint: 'Retry with a broader query if no results are returned.',
	},
	get_backlinks: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z.array(
			z
				.object({
					sourceId: z.string().min(1),
					sourceTitle: z.string().min(1),
					displayText: z.string(),
					position: z.number().int().nonnegative(),
					matchedByAlias: z.boolean(),
					matchedAlias: z.string().nullable(),
					contextSnippet: z.string(),
				})
				.strict(),
		),
		remediationHint: 'Ensure the target note exists, then retry.',
	},
	get_tags: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z.array(tagCountSchema),
		remediationHint: 'Tags appear after notes are tagged and indexed.',
	},
	get_vault_summary: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z
			.object({
				totalNotes: z.number().int().nonnegative(),
				deletedNotes: z.number().int().nonnegative(),
				totalLinks: z.number().int().nonnegative(),
				totalObjects: z.number().int().nonnegative(),
				orphanNotes: z.number().int().nonnegative(),
				folders: z.array(
					z.object({ path: z.string().min(1), noteCount: z.number().int().nonnegative() }).strict(),
				),
				topTags: z.array(tagCountSchema),
				topLinkedNotes: z.array(
					z
						.object({
							id: z.string().min(1),
							title: z.string().min(1),
							incomingLinks: z.number().int().nonnegative(),
						})
						.strict(),
				),
				recentActivity: z.array(
					z
						.object({
							id: z.string().min(1),
							title: z.string().min(1),
							updatedAt: z.string().min(1),
						})
						.strict(),
				),
				objectTypes: z.array(
					z
						.object({
							type: vaultObjectTypeSchema,
							count: z.number().int().nonnegative(),
						})
						.strict(),
				),
				campaignHealth: campaignHealthSchema,
				coverageGaps: z.array(coverageGapSchema),
				staleThresholdDays: z.number().int().nonnegative(),
				staleNotes: z.array(noteSnapshotSchema),
			})
			.strict(),
		remediationHint: 'Rebuild indexes if summary metrics look stale.',
	},
	get_campaign_health: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z
			.object({
				generatedAt: z.string().min(1),
				staleAfterDays: z.number().int().nonnegative(),
				campaignHealth: campaignHealthSchema,
				metrics: z
					.object({
						orphanNotes: z.number().int().nonnegative(),
						untaggedNotes: z.number().int().nonnegative(),
						rootFolderNotes: z.number().int().nonnegative(),
						duplicateTitleGroups: z.number().int().nonnegative(),
						staleNotes: z.number().int().nonnegative(),
						noIncomingNotes: z.number().int().nonnegative(),
						noOutgoingNotes: z.number().int().nonnegative(),
					})
					.strict(),
				topCoverageGaps: z.array(coverageGapSchema),
			})
			.strict(),
		remediationHint: 'Use this signal before deciding whether automation can proceed safely.',
	},
	get_coverage_gaps: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z
			.object({
				generatedAt: z.string().min(1),
				staleAfterDays: z.number().int().nonnegative(),
				totalGaps: z.number().int().nonnegative(),
				coverageGaps: z.array(coverageGapSchema),
				graphInsights: z
					.object({
						orphanCount: z.number().int().nonnegative(),
						orphanNoteIds: z.array(z.string().min(1)),
						hubCount: z.number().int().nonnegative(),
						hubNoteIds: z.array(z.string().min(1)),
					})
					.strict(),
			})
			.strict(),
		remediationHint: 'Address high severity gaps first, then rerun this tool.',
	},
	get_stale_notes: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z
			.object({
				generatedAt: z.string().min(1),
				staleAfterDays: z.number().int().nonnegative(),
				totalStaleNotes: z.number().int().nonnegative(),
				staleNotes: z.array(noteSnapshotSchema),
			})
			.strict(),
		remediationHint: 'Refresh stale notes before session prep or recap workflows.',
	},
	get_session_prep_bundle: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z
			.object({
				bundle: z.literal('session_prep'),
				generatedAt: z.string().min(1),
				worldDate: worldDateSummarySchema,
				focusTag: z.string().nullable(),
				campaignHealth: campaignHealthSchema,
				recentScopedNotes: z.array(noteSnapshotSchema.omit({ daysSinceUpdate: true })),
				staleScopedNotes: z.array(noteSnapshotSchema.omit({ daysSinceUpdate: true })),
				calendarHighlights: z.array(calendarEventSummarySchema),
				boardContext: z.array(
					z
						.object({
							id: z.string().min(1),
							name: z.string().min(1),
							updatedAt: z.string().min(1),
							tileCount: z.number().int().nonnegative(),
						})
						.strict(),
				),
				continuityFlags: z.array(coverageGapSchema),
				recommendedToolFlow: z.array(z.string().min(1)),
				safeOperatingPattern: z.string().min(1),
			})
			.strict(),
		remediationHint: 'Use this bundle to prioritize reads before any writes.',
	},
	get_recap_generation_bundle: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z
			.object({
				bundle: z.literal('recap_generation'),
				generatedAt: z.string().min(1),
				since: z.string().min(1),
				worldDate: worldDateSummarySchema,
				changedNotes: z.array(noteSnapshotSchema.omit({ daysSinceUpdate: true })),
				changedObjects: z.array(
					z
						.object({
							id: z.string().min(1),
							type: vaultObjectTypeSchema,
							name: z.string().min(1),
							updatedAt: z.string().min(1),
						})
						.strict(),
				),
				changedBoards: z.array(
					z
						.object({
							id: z.string().min(1),
							name: z.string().min(1),
							updatedAt: z.string().min(1),
							tileCount: z.number().int().nonnegative(),
						})
						.strict(),
				),
				calendarSummaries: z.array(calendarEventSummarySchema),
				tagMomentum: z.array(
					z
						.object({
							tag: z.string().min(1),
							count: z.number().int().nonnegative(),
						})
						.strict(),
				),
				recapPromptTemplate: z
					.object({
						objective: z.string().min(1),
						constraints: z.array(z.string().min(1)),
					})
					.strict(),
			})
			.strict(),
		remediationHint: 'Use the returned `since` to keep recap generation deterministic.',
	},
	get_continuity_check_bundle: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z
			.object({
				bundle: z.literal('continuity_check'),
				generatedAt: z.string().min(1),
				campaignHealth: campaignHealthSchema,
				continuityRisks: z.array(coverageGapSchema),
				linkHotspots: z.array(
					z
						.object({
							id: z.string().min(1),
							title: z.string().min(1),
							incomingLinks: z.number().int().nonnegative(),
						})
						.strict(),
				),
				staleNotes: z.array(noteSnapshotSchema),
				recommendedToolFlow: z.array(z.string().min(1)),
				agentChecklist: z.array(z.string().min(1)),
			})
			.strict(),
		remediationHint: 'Resolve continuity risks before high-impact content changes.',
	},
	get_folder_tree: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z.array(
			z
				.object({
					path: z.string().min(1),
					noteCount: z.number().int().nonnegative(),
					subfolders: z.array(z.string().min(1)),
				})
				.strict(),
		),
		remediationHint: 'Folder paths are vault-relative and should begin with "/".',
	},
	get_recent_activity: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z.array(
			z
				.object({
					id: z.string().min(1),
					title: z.string().min(1),
					folder: z.string().min(1),
					tags: z.array(z.string()),
					createdAt: z.string().min(1),
					updatedAt: z.string().min(1),
				})
				.strict(),
		),
		remediationHint: 'Use ISO timestamps in `since` for deterministic filtering.',
	},
	get_link_graph: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: linkGraphSchema,
		remediationHint: 'If edges look stale, trigger note reindexing and retry.',
	},
	get_calendar_events: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z
			.object({
				dateRange: z
					.object({
						fromDayOffset: z.number().int(),
						toDayOffset: z.number().int(),
						fromShort: z.string().min(1),
						toShort: z.string().min(1),
						fromIso: z.string().min(1),
						toIso: z.string().min(1),
					})
					.strict(),
				totalEvents: z.number().int().nonnegative(),
				events: z.array(calendarEventSummarySchema),
			})
			.strict(),
		remediationHint: 'Use world day offsets or YYYY-MM-DD calendar dates for deterministic ranges.',
	},
	vault_health_check: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z
			.object({
				summary: z
					.object({
						notesScanned: z.number().int().nonnegative(),
						warnings: z.number().int().nonnegative(),
						infos: z.number().int().nonnegative(),
						totalIssues: z.number().int().nonnegative(),
					})
					.strict(),
				linkQuality: z
					.object({
						totalLinks: z.number().int().nonnegative(),
						brokenLinks: z.number().int().nonnegative(),
						aliasMatchedLinks: z.number().int().nonnegative(),
						loops: z.number().int().nonnegative(),
						crossFolderLinkDensity: z.number().nonnegative(),
						orphanCount: z.number().int().nonnegative(),
						hubCount: z.number().int().nonnegative(),
						drilldown: z
							.object({
								orphanNoteIds: z.array(z.string().min(1)),
								hubNoteIds: z.array(z.string().min(1)),
								brokenLinkNoteIds: z.array(z.string().min(1)),
								aliasMatchedNoteIds: z.array(z.string().min(1)),
								loopNoteIds: z.array(z.string().min(1)),
								crossFolderNoteIds: z.array(z.string().min(1)),
							})
							.strict(),
					})
					.strict(),
				issues: z.array(healthIssueSchema),
			})
			.strict(),
		remediationHint: 'Resolve warning issues first, then rerun the health check.',
	},
	list_session_boards: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z.array(sessionBoardSchema),
		remediationHint: 'Create a board before listing if none are returned.',
	},
	create_session_board: {
		permission: 'write-direct',
		retryPolicy: 'idempotency-key-required',
		responseSchema: sessionBoardSchema,
		remediationHint: 'Run MCP in direct mode and pass idempotencyKey for retries.',
	},
	update_session_board: {
		permission: 'write-direct',
		retryPolicy: 'idempotency-key-required',
		responseSchema: sessionBoardSchema,
		remediationHint: 'Read board state first and retry with idempotencyKey.',
	},
	delete_session_board: {
		permission: 'write-direct',
		retryPolicy: 'idempotent',
		responseSchema: z
			.object({
				ok: z.literal(true),
				boardId: z.string().min(1),
			})
			.strict(),
		remediationHint: 'Deleting a missing board is treated as a no-op.',
	},
	suggest_related_board_notes: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z.array(
			z
				.object({
					noteId: z.string().min(1),
					score: z.number(),
					linkedTo: z.array(z.string().min(1)),
					sharedTags: z.array(z.string()),
				})
				.strict(),
		),
		remediationHint: 'Pass either boardId or noteIds to seed suggestions.',
	},
	create_stat_block_object: {
		permission: 'write-direct',
		retryPolicy: 'idempotency-key-required',
		responseSchema: objectSummaryWithEmbedSchema,
		remediationHint: 'Run in direct mode and provide idempotencyKey for retries.',
	},
	create_character_object: {
		permission: 'write-direct',
		retryPolicy: 'idempotency-key-required',
		responseSchema: objectSummaryWithEmbedSchema,
		remediationHint: 'Run in direct mode and provide idempotencyKey for retries.',
	},
	create_image_object: {
		permission: 'write-direct',
		retryPolicy: 'idempotency-key-required',
		responseSchema: objectSummaryWithEmbedSchema,
		remediationHint: 'Run in direct mode and provide idempotencyKey for retries.',
	},
	create_character_sheet_note: {
		permission: 'write-direct',
		retryPolicy: 'idempotency-key-required',
		responseSchema: objectSummaryWithEmbedSchema,
		remediationHint: 'Run in direct mode and provide idempotencyKey for retries.',
	},
	create_stat_block_note: {
		permission: 'write-direct',
		retryPolicy: 'idempotency-key-required',
		responseSchema: objectSummaryWithEmbedSchema,
		remediationHint: 'Run in direct mode and provide idempotencyKey for retries.',
	},
	list_objects: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: z.array(objectSummaryWithEmbedSchema),
		remediationHint: 'Use query/type filters to narrow results.',
	},
	read_object: {
		permission: 'read-only',
		retryPolicy: 'idempotent',
		responseSchema: fullObjectWithEmbedSchema,
		remediationHint: 'Use list_objects first to discover valid object ids.',
	},
	update_object: {
		permission: 'write-direct',
		retryPolicy: 'idempotency-key-required',
		responseSchema: objectSummaryWithEmbedSchema,
		remediationHint: 'Read object state first and retry with idempotencyKey.',
	},
	delete_object: {
		permission: 'write-direct',
		retryPolicy: 'idempotency-key-required',
		responseSchema: z
			.object({
				id: z.string().min(1),
				type: vaultObjectTypeSchema,
				name: z.string().min(1),
				deleted: z.literal(true),
			})
			.strict(),
		remediationHint: 'Run in direct mode and provide idempotencyKey for retries.',
	},
	embed_object_in_note: {
		permission: 'write-staged',
		retryPolicy: 'idempotency-key-required',
		responseSchema: z
			.object({
				noteId: z.string().min(1),
				targetNoteId: z.string().min(1),
				objectId: z.string().min(1),
				embed: z.string().min(1),
				position: z.enum(['append', 'prepend']),
				renderView: z.enum(['card', 'inline', 'content']),
			})
			.strict(),
		remediationHint: 'Pass idempotencyKey to avoid duplicate embeds on retries.',
	},
	embed_note_in_note: {
		permission: 'write-staged',
		retryPolicy: 'idempotency-key-required',
		responseSchema: z
			.object({
				noteId: z.string().min(1),
				targetNoteId: z.string().min(1),
				embed: z.string().min(1),
				position: z.enum(['append', 'prepend']),
				renderView: z.enum(['card', 'inline', 'content']),
			})
			.strict(),
		remediationHint: 'Pass idempotencyKey to avoid duplicate embeds on retries.',
	},
	import_image_note: {
		permission: 'write-direct',
		retryPolicy: 'idempotency-key-required',
		responseSchema: z
			.object({
				id: z.string().min(1),
				type: z.literal('image'),
				name: z.string().min(1),
				summary: z.string(),
				tags: z.array(z.string()),
				filePath: z.string().min(1),
				url: z.string().min(1),
				embed: z.string().min(1),
			})
			.strict(),
		remediationHint: 'Use direct mode and idempotencyKey for file import retries.',
	},
};

export function permissionRank(permission: ToolPermission): number {
	switch (permission) {
		case 'read-only':
			return 0;
		case 'write-staged':
			return 1;
		case 'write-direct':
			return 2;
	}
}

export function isPermissionAllowed(required: ToolPermission, granted: ToolPermission): boolean {
	return permissionRank(required) <= permissionRank(granted);
}
