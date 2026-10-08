import { SESSION_LOG_SUBTYPE, VAULT_OBJECT_SUBTYPE_KEY } from '@dndtools/core';
import { Toaster } from '../../../ds';
import { useI18n } from '../../../i18n';
import { CapturePanel, type CaptureSubmission } from '../../../screens/session/Capture';
import {
	useArchives,
	useCampaignDateValue,
	useCaptureCandidates,
	useSessionDispatch,
	useSessionSeat,
} from '../../../screens/session/useSessionView';

/**
 * The Session screen's end-of-session capture (RC-CAN-7.8, SCREENS_PARITY SE-22, SE-39–SE-41). DM
 * only.
 */
export function SessionCaptureBody() {
	const { t } = useI18n();
	const { runtime, actorId, isDm, previewing } = useSessionSeat();
	const dispatch = useSessionDispatch();
	const { archives, recapArchiveId } = useArchives();
	const candidates = useCaptureCandidates();
	const campaignDate = useCampaignDateValue();

	/**
	 * RC-SES-4.1 — one capture writes TWO durable records through existing commands: the structured
	 * recap onto the session archive, then the `session-log` note. The note is created ONLY after the
	 * recap is accepted, so a rejected capture never leaves an orphan note, and a failure at either
	 * step says which half did not land.
	 */
	async function capture(submission: CaptureSubmission): Promise<boolean> {
		const { archiveId, title, markdown, capture: parts } = submission;
		const recap = await runtime.dispatch({
			type: 'session.author-recap',
			actorId,
			payload: {
				archiveId,
				markdown,
				happened: parts.happened,
				changes: parts.changes,
				followUps: parts.followUps,
			},
		});
		if (recap.status !== 'accepted') {
			Toaster.error(recap.rejection.message);
			return false;
		}
		const note = await runtime.dispatch({
			type: 'content.create-item',
			actorId,
			payload: {
				kind: 'note',
				title,
				body: markdown,
				visibility: 'dm-only',
				fields: {
					[VAULT_OBJECT_SUBTYPE_KEY]: SESSION_LOG_SUBTYPE,
					title,
					sessionArchiveId: archiveId,
					happened: parts.happened,
					changes: parts.changes,
					followUps: parts.followUps,
				},
				// Dating the note at the campaign's current date places it on the Campaign timeline. With
				// no date set there is nothing truthful to date it with, so it is left undated.
				...(campaignDate ? { dateFields: { occurred: campaignDate } } : {}),
			},
		});
		if (note.status !== 'accepted') {
			Toaster.error(t('session.capture.noteFailed'));
			return false;
		}
		Toaster.success(t('session.capture.saved'));
		return true;
	}

	if (!isDm) return null;
	return (
		<CapturePanel
			archives={archives}
			defaultArchiveId={recapArchiveId}
			candidates={candidates}
			hasCampaignDate={!!campaignDate}
			previewing={previewing}
			onCapture={capture}
			// RC-SES-4.2 — the continuity check's "Create": a DM-only quick-create NPC, named exactly as
			// the capture's prose named it.
			onQuickCreateNpc={(name) =>
				dispatch(
					{ type: 'character.quick-create', actorId, payload: { kind: 'npc', name } },
					t('session.capture.continuityCreated', { name }),
				)
			}
		/>
	);
}
