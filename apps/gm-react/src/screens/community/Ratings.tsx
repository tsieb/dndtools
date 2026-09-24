import { useEffect, useId, useRef, useState } from 'react';
import { LoadingRegion, T } from '../../app/screen-kit';
import { Badge, Button, Skeleton, Textarea, Toaster } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';

import {
	KIND_LABEL,
	errText,
	flagReview,
	listReviews,
	rateListing,
	type DiscoveryListing,
	type ListingReview,
	type RatingSummary,
} from './shared';
// --- RC-CLD-4.5 — ratings and the featured row -----------------------------------------------

/** Mirrors the server's note bound (MAX_REVIEW_NOTE_CHARS). */
const MAX_REVIEW_NOTE = 280;
const STAR = '★';
const EMPTY_STAR = '☆';
const STAR_VALUES = [1, 2, 3, 4, 5];

/** The 1–5 picker. A radiogroup like SegmentedControl, but the chosen star takes the subtle accent
 * rather than the gold fill: the listing's install button stays the one primary on the screen. */
function StarPicker({
	value,
	onChange,
	ariaLabel,
}: {
	value: number;
	onChange: (stars: number) => void;
	ariaLabel: string;
}) {
	const refs = useRef<(HTMLButtonElement | null)[]>([]);
	const select = (index: number) => {
		const next = (index + STAR_VALUES.length) % STAR_VALUES.length;
		refs.current[next]?.focus();
		onChange(STAR_VALUES[next]);
	};
	const tabStop = value > 0 ? value - 1 : 0;
	return (
		<div role="radiogroup" aria-label={ariaLabel} style={{ display: 'flex', gap: T.space.one }}>
			{STAR_VALUES.map((stars, index) => {
				const active = stars === value;
				return (
					<button
						key={stars}
						ref={(node) => {
							refs.current[index] = node;
						}}
						type="button"
						role="radio"
						aria-checked={active}
						tabIndex={index === tabStop ? 0 : -1}
						onClick={() => onChange(stars)}
						onKeyDown={(event) => {
							const step =
								event.key === 'ArrowRight' || event.key === 'ArrowDown'
									? 1
									: event.key === 'ArrowLeft' || event.key === 'ArrowUp'
										? -1
										: 0;
							if (step !== 0) {
								event.preventDefault();
								select(index + step);
							} else if (event.key === 'Home' || event.key === 'End') {
								event.preventDefault();
								select(event.key === 'Home' ? 0 : STAR_VALUES.length - 1);
							}
						}}
						style={{
							minWidth: 'max(2.75rem, var(--density-touch-target, 2.75rem))',
							minHeight: 'max(2.75rem, var(--density-touch-target, 2.75rem))',
							padding: `${T.space.one} ${T.space.two}`,
							borderRadius: T.radius.md,
							cursor: 'pointer',
							font: `var(--text-xs) ${T.sans}`,
							color: active ? T.ink : T.sub,
							border: `1px solid ${active ? T.accBd : T.bd}`,
							background: active ? T.accSub : 'transparent',
						}}
					>
						{`${stars} ${STAR}`}
					</button>
				);
			})}
		</div>
	);
}

/** "4.5 ★ · 2 ratings", or "No ratings yet". Announced as a sentence, not as glyphs. */
export function RatingText({ rating }: { rating: RatingSummary }) {
	const { t } = useI18n();
	if (rating.average === null) {
		return (
			<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
				{t('community.discover.noRatings')}
			</span>
		);
	}
	const values = { average: rating.average, count: rating.count };
	return (
		<span
			role="img"
			aria-label={t('community.discover.ratingLabel', values)}
			style={{ font: `600 var(--text-xs) ${T.sans}`, color: T.sub }}
		>
			{t('community.discover.ratingSummary', values)}
		</span>
	);
}

/** The maintainers' featured set, above the shelf. Choosing a card opens it in the detail panel. */
export function FeaturedRow({
	listings,
	selectedId,
	onSelect,
}: {
	listings: DiscoveryListing[];
	selectedId: string | null;
	onSelect: (moduleId: string) => void;
}) {
	const { t } = useI18n();
	const headingId = useId();
	return (
		<section
			aria-labelledby={headingId}
			style={{ display: 'flex', flexDirection: 'column', gap: T.space.two }}
		>
			<div style={{ display: 'flex', alignItems: 'baseline', gap: T.space.two, flexWrap: 'wrap' }}>
				<h2
					id={headingId}
					style={{ margin: T.space.zero, font: `700 var(--text-base) ${T.sans}`, color: T.ink }}
				>
					{t('community.discover.featured')}
				</h2>
				<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
					{t('community.discover.featuredNote')}
				</span>
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 200px),1fr))',
					gap: T.space.three,
				}}
			>
				{listings.map((m) => (
					<button
						key={m.moduleId}
						type="button"
						aria-pressed={selectedId === m.moduleId}
						onClick={() => onSelect(m.moduleId)}
						style={{
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'flex-start',
							gap: T.space.one,
							padding: T.space.three,
							borderRadius: T.radius.lg,
							cursor: 'pointer',
							textAlign: 'left',
							border: `1px solid ${selectedId === m.moduleId ? T.accBd : T.bd}`,
							background: T.accSub,
						}}
					>
						<span style={{ font: `700 var(--text-sm) ${T.sans}`, color: T.ink }}>{m.name}</span>
						<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
							{t(KIND_LABEL[m.kind] ?? 'community.discover.kindWidget')}
						</span>
						<RatingText rating={m.rating} />
					</button>
				))}
			</div>
		</section>
	);
}

/**
 * A listing's ratings and the caller's own. The policy is the server's; this only explains it
 * before it is enforced: a publisher cannot rate their own module, and a rating needs an install.
 * Mount it with `key={moduleId}` so the form starts from that listing's saved rating.
 */
export function ListingRatings({
	listing,
	onRated,
}: {
	listing: DiscoveryListing;
	onRated: (next: DiscoveryListing) => void;
}) {
	const { t, formatDate } = useI18n();
	const headingId = useId();
	const { moduleId } = listing;
	const [reviews, setReviews] = useState<ListingReview[] | 'failed' | null>(null);
	const [stars, setStars] = useState(listing.myReview?.stars ?? 0);
	const [note, setNote] = useState(listing.myReview?.note ?? '');
	const [saving, setSaving] = useState(false);
	const [reported, setReported] = useState<ReadonlySet<string>>(() => new Set());

	useEffect(() => {
		let live = true;
		listReviews(moduleId)
			.then((res) => live && setReviews(res.reviews))
			.catch(() => live && setReviews('failed'));
		return () => {
			live = false;
		};
	}, [moduleId]);

	const save = () => {
		if (stars < 1 || saving) return;
		setSaving(true);
		rateListing(moduleId, stars, note.trim())
			.then((res) => {
				Toaster.success(t('community.discover.ratingSaved'));
				onRated({
					...listing,
					rating: res.rating,
					myReview: {
						reviewId: res.review.reviewId,
						stars: res.review.stars,
						note: res.review.note,
					},
				});
				// The saved rating is already true; a failed refresh only leaves the older list showing.
				listReviews(moduleId)
					.then((next) => setReviews(next.reviews))
					.catch(() => undefined);
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))))
			.finally(() => setSaving(false));
	};

	const report = (reviewId: string) => {
		flagReview(moduleId, reviewId)
			.then(() => {
				setReported((current) => new Set(current).add(reviewId));
				Toaster.success(t('community.discover.reported'));
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))));
	};

	const hint = (key: MessageKey) => (
		<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ter }}>{t(key)}</div>
	);

	return (
		<section
			aria-labelledby={headingId}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: T.space.two,
				borderTop: `1px solid ${T.bd}`,
				paddingTop: T.space.three,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'baseline', gap: T.space.two, flexWrap: 'wrap' }}>
				<h3
					id={headingId}
					style={{ margin: T.space.zero, font: `700 var(--text-sm) ${T.sans}`, color: T.ink }}
				>
					{t('community.discover.ratingsTitle')}
				</h3>
				<RatingText rating={listing.rating} />
			</div>
			{listing.owned ? (
				hint('community.discover.rateOwn')
			) : !listing.installed ? (
				hint('community.discover.rateNeedsInstall')
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.two }}>
					<StarPicker
						ariaLabel={t('community.discover.yourRating')}
						value={stars}
						onChange={setStars}
					/>
					<Textarea
						value={note}
						rows={3}
						maxLength={MAX_REVIEW_NOTE}
						aria-label={t('community.discover.reviewNote')}
						placeholder={t('community.discover.reviewNotePlaceholder')}
						onChange={(e: { target: { value: string } }) => setNote(e.target.value)}
					/>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: T.space.two,
						}}
					>
						<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
							{t('community.discover.noteCount', { count: note.length, max: MAX_REVIEW_NOTE })}
						</span>
						<Button
							variant="secondary"
							size="sm"
							icon="check"
							disabled={saving || stars < 1}
							onClick={save}
						>
							{t(
								listing.myReview
									? 'community.discover.updateRating'
									: 'community.discover.saveRating',
							)}
						</Button>
					</div>
				</div>
			)}
			{reviews === null ? (
				<LoadingRegion label={t('community.discover.loadingReviews')}>
					<Skeleton height={36} />
				</LoadingRegion>
			) : reviews === 'failed' ? (
				hint('community.discover.reviewsFailed')
			) : reviews.length === 0 ? (
				hint('community.discover.noReviews')
			) : (
				<ul
					style={{
						listStyle: 'none',
						margin: T.space.zero,
						padding: T.space.zero,
						display: 'flex',
						flexDirection: 'column',
						gap: T.space.two,
					}}
				>
					{reviews.map((r) => {
						const shown = Math.min(5, Math.max(0, r.stars));
						const wasReported = reported.has(r.reviewId);
						return (
							<li
								key={r.reviewId}
								style={{ display: 'flex', flexDirection: 'column', gap: T.space.one }}
							>
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: T.space.two,
										flexWrap: 'wrap',
									}}
								>
									<span
										role="img"
										aria-label={t('community.discover.starsLabel', { stars: shown })}
										style={{ color: T.acc, font: `var(--text-xs) ${T.sans}` }}
									>
										{STAR.repeat(shown)}
										{EMPTY_STAR.repeat(5 - shown)}
									</span>
									{r.mine && <Badge status="accent">{t('community.discover.yours')}</Badge>}
									<span style={{ flex: 1, font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
										{formatDate(new Date(r.updatedAt))}
									</span>
									{!r.mine && (
										<Button
											variant="ghost"
											size="sm"
											icon="flag"
											disabled={wasReported}
											aria-label={wasReported ? undefined : t('community.discover.reportLabel')}
											onClick={() => report(r.reviewId)}
										>
											{t(
												wasReported
													? 'community.discover.reportedShort'
													: 'community.discover.report',
											)}
										</Button>
									)}
								</div>
								{r.note && (
									<div
										style={{
											font: `var(--text-xs)/1.5 ${T.sans}`,
											color: T.sub,
											overflowWrap: 'anywhere',
										}}
									>
										{r.note}
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
