import {
	getContentItemDetailForActor,
	getContentItemsForActor,
	getSessionRecapFeedForActor,
	stripSecretCallouts,
} from '@dndtools/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useViewport } from '../../app/useViewport';
import {
	getMyWiki,
	publishWiki,
	unpublishWiki,
	type WikiAccess,
	type WikiStatus,
} from '../../cloud/appApi';
import { useAuth } from '../../cloud/AuthContext';
import { isAccountApiConfigured } from '../../cloud/config';
import { useEntitlements } from '../../cloud/entitlements';
import { Toaster } from '../../ds';
import { useI18n } from '../../i18n';
import { copyToClipboard } from '../../platform/preferences';
import { publicAppBaseUrl } from '../../platform/publicAppUrl';
import { useRuntime } from '../../runtime/RuntimeContext';
import { buildWikiPages, errText, slugify } from './shared';

export function useWikiModel() {
	const { t, formatDate, formatTime } = useI18n();
	const isPhone = useViewport() === 'phone';
	const runtime = useRuntime();
	const auth = useAuth();
	const navigate = useNavigate();
	const { plan, loading: planLoading, canChangePlan } = useEntitlements();
	const dmId = runtime.defaultActorId;
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	// Publishing is a Beacon feature (the server enforces it too — this only keeps the UI honest).
	const canPublish = cloudReady && plan === 'beacon';

	const [title, setTitle] = useState(() => t('community.wiki.defaultTitle'));
	const [access, setAccess] = useState<WikiAccess>('unlisted');
	const [password, setPassword] = useState('');
	const [includeRecaps, setIncludeRecaps] = useState(false);
	// undefined → the initial status fetch is in flight; null → nothing published; else the live status.
	const [status, setStatus] = useState<WikiStatus | null | undefined>(
		cloudReady ? undefined : null,
	);
	const [statusFailed, setStatusFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [confirmUnpublish, setConfirmUnpublish] = useState(false);

	// REAL: only player-visible notes are eligible (DM-only notes never leave the vault).
	const items = useMemo(
		() => getContentItemsForActor(runtime.state.content, runtime.state.permissions, dmId),
		[runtime.state.content, runtime.state.permissions, dmId],
	);
	const notes = items.filter((i) => i.kind === 'note');
	const eligibleNotes = notes.filter((i) => i.visibility === 'player-visible');
	const eligible = eligibleNotes.length;
	const pages = useMemo(() => {
		// An ungranted observer projects only globally player-visible fields and bodies.
		const readerId = '__wiki_public_reader__';
		const permissions = {
			...runtime.state.permissions,
			actors: {
				[readerId]: { id: readerId, role: 'observer' as const, displayName: 'Wiki reader' },
			},
			grants: [],
		};
		const notes = buildWikiPages(eligibleNotes).map((page, index) => {
			const detail = getContentItemDetailForActor(
				runtime.state.content,
				permissions,
				readerId,
				eligibleNotes[index].id,
			);
			const folder = detail.visible ? detail.visibleFields['dndtools.folder'] : '';
			return {
				...page,
				markdown: detail.visible ? detail.body : '',
				folder: typeof folder === 'string' ? folder.slice(0, 240) : '',
				kind: 'note' as const,
			};
		});
		if (!includeRecaps) return notes;
		const used = new Set(notes.map((p) => p.slug));
		const recaps = getSessionRecapFeedForActor(
			runtime.state.session,
			runtime.state.permissions,
			dmId,
		).map((entry) => {
			const base = `recap-${slugify(entry.archiveId) || 'session'}`.slice(0, 110);
			let slug = base;
			for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
			used.add(slug);
			return {
				slug,
				title: entry.title || t('community.wiki.sessionRecap'),
				markdown: stripSecretCallouts(entry.markdown),
				updatedAt: entry.authoredAt,
				folder: t('community.wiki.recaps'),
				kind: 'recap' as const,
			};
		});
		return [...notes, ...recaps];
	}, [
		eligibleNotes,
		includeRecaps,
		runtime.state.content,
		runtime.state.permissions,
		runtime.state.session,
		dmId,
		t,
	]);

	// Load the caller's current published-wiki status; adopt its title/access into the form so a
	// re-publish edits the live wiki rather than resetting it.
	const loadStatus = useCallback(() => {
		if (!cloudReady) return;
		setStatusFailed(false);
		setStatus(undefined);
		getMyWiki()
			.then((s) => {
				setStatus(s);
				if (s) {
					setTitle(s.title);
					setAccess(s.access);
					setIncludeRecaps(((s as WikiStatus & { recapCount?: number }).recapCount ?? 0) > 0);
				}
			})
			.catch(() => setStatusFailed(true));
	}, [cloudReady]);
	useEffect(() => {
		if (cloudReady) loadStatus();
		else {
			setStatusFailed(false);
			setStatus(null);
		}
	}, [cloudReady, loadStatus]);

	const publish = () => {
		if (!publicAppBaseUrl()) {
			Toaster.error(t('community.wiki.noPublicUrl'));
			return;
		}
		if (!canPublish) {
			Toaster.error(t('community.wiki.needsBeacon'));
			return;
		}
		if (pages.length === 0) {
			Toaster.error(t('community.wiki.needsPages'));
			return;
		}
		if (!title.trim()) {
			Toaster.error(t('community.wiki.needsTitle'));
			return;
		}
		if (access === 'password' && password.trim().length < 6) {
			Toaster.error(t('community.wiki.needsPassword'));
			return;
		}
		setBusy(true);
		publishWiki({
			title: title.trim(),
			access,
			pages,
			...(access === 'password' ? { password: password.trim() } : {}),
		})
			.then((s) => {
				setStatus(s);
				setPassword('');
				Toaster.success(t(status ? 'community.wiki.updated' : 'community.wiki.published'));
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))))
			.finally(() => setBusy(false));
	};

	const unpublish = () => {
		setBusy(true);
		unpublishWiki()
			.then(() => {
				setStatus(null);
				setConfirmUnpublish(false);
				Toaster.success(t('community.wiki.unpublished'));
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))))
			.finally(() => setBusy(false));
	};

	const copyLink = async (url: string) => {
		if (await copyToClipboard(url)) Toaster.success(t('community.wiki.linkCopied'));
		else Toaster.error(t('community.wiki.copyFailed'));
	};

	return {
		t,
		formatDate,
		formatTime,
		isPhone,
		auth,
		navigate,
		planLoading,
		canChangePlan,
		canPublish,
		title,
		setTitle,
		access,
		setAccess,
		password,
		setPassword,
		includeRecaps,
		setIncludeRecaps,
		status,
		statusFailed,
		busy,
		confirmUnpublish,
		setConfirmUnpublish,
		eligible,
		notes,
		eligibleNotes,
		pages,
		loadStatus,
		publish,
		unpublish,
		copyLink,
	};
}
