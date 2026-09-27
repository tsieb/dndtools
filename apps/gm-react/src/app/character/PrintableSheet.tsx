import { useI18n } from '../../i18n';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CharacterView, CharacterInventory } from '@dndtools/core';
import { Button } from '../../ds';
import { exportFile } from '../../platform/download';
import { sheetPdf } from './sheetPdf';

/** Only accepts the actor-filtered view, never the durable character record. */
export function PrintableSheet({
	character: c,
	inventory,
	level,
}: {
	character: CharacterView;
	inventory: CharacterInventory | null;
	level: number | null;
}) {
	const { t } = useI18n();
	const canvas = useRef<HTMLCanvasElement>(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');
	const value = (key: string) => (typeof c.data[key] === 'string' ? String(c.data[key]) : '—');
	const sections = [
		[
			t('player.sheet.identity'),
			`${t('player.sheet.class')}: ${value('class')}   ${t('player.sheet.level')}: ${level ?? '—'}   ${t('player.sheet.race')}: ${value('race')}`,
			`${t('player.sheet.background')}: ${value('background')}   ${t('player.sheet.subclass')}: ${value('subclass')}`,
		],
		[
			t('mapInspector.combat'),
			`${t('player.print.hp')}: ${c.combat.hp ?? '—'} / ${c.combat.maxHp ?? '—'}   ${t('player.stat.ac')}: ${c.combat.ac ?? '—'}   ${t('player.stat.speed')}: ${value('speed')}   ${t('player.print.initiative')}: ${value('init')}`,
			`${t('player.print.conditions')}: ${c.combat.conditions?.join(', ') || '—'}`,
		],
		[
			t('player.print.abilities'),
			Object.entries(c.attributes)
				.map(([key, score]) => `${key.toUpperCase()}: ${score}`)
				.join('   ') || '—',
		],
		[
			t('player.print.proficiencies'),
			`${t('player.sheet.savingThrows')}: ${c.proficiencies.saves.join(', ') || '—'}`,
			`${t('player.sheet.skills')}: ${
				Object.entries(c.proficiencies.skills)
					.map(([key, rank]) => `${key}: ${rank}`)
					.join(', ') || '—'
			}`,
		],
		[t('player.sheet.attacks'), ...c.attacks.map((a) => `${a.name}: ${a.detail}`)],
		[
			t('player.print.equipment'),
			...(inventory?.items.map(
				(i) =>
					`${i.quantity} × ${i.name}${i.equipped ? ` (${t('player.equipment.equippedBadge')})` : ''}`,
			) ?? []),
			`${t('player.equipment.currency')}: ${
				inventory
					? Object.entries(inventory.currency)
							.map(([coin, count]) => `${count} ${coin}`)
							.join('   ')
					: '—'
			}`,
		],
		[t('player.sheet.backstory'), value('backstory')],
	];
	// A compact summary has explicit per-section bounds; long records cannot silently add pages.
	const rows = sections.flatMap(([heading, ...lines]) => {
		const text = lines.join(' · ') || '—';
		const chunks = text.match(/.{1,88}(?:\s|$)|.{1,88}/gu) ?? ['—'];
		return [
			heading,
			...chunks
				.slice(0, 4)
				.map((line, i) => (i === 3 && chunks.length > 4 ? `${line.slice(0, 84)}…` : line)),
		];
	});
	async function save() {
		if (!canvas.current || busy) return;
		setBusy(true);
		setMessage('');
		try {
			const result = await exportFile({
				filename: 'character-sheet.pdf',
				title: `${c.name} — ${t('player.print.title')}`,
				blob: sheetPdf(canvas.current, c.name, rows, {
					summary: t('player.print.summary'),
					footer: t('player.print.footer'),
				}),
			});
			setMessage(
				result.status === 'cancelled' ? t('player.print.cancelled') : t('player.print.exported'),
			);
		} catch {
			setMessage(t('player.print.failed'));
		} finally {
			setBusy(false);
		}
	}
	return (
		<>
			<Button variant="secondary" disabled={busy} onClick={save}>
				{t('player.print.action')}
			</Button>
			{message && <span role="status">{message}</span>}
			<canvas ref={canvas} hidden />
			{createPortal(
				<article className="character-print-sheet" aria-label={t('player.print.label')}>
					<h1>{c.name}</h1>
					<p>{t('player.print.summary')}</p>
					{rows.map((row, i) => (
						<p key={i}>{row}</p>
					))}
					<footer>{t('player.print.footer')}</footer>
				</article>,
				document.body,
			)}
		</>
	);
}
