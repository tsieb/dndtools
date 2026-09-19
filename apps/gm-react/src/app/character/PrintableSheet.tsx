/* eslint-disable i18n/no-literal-jsx-text -- Printable export copy is colocated within RC-CHR-2.4 ownership; translation catalog follow-up required. */
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
	const canvas = useRef<HTMLCanvasElement>(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');
	const value = (key: string) => (typeof c.data[key] === 'string' ? String(c.data[key]) : '—');
	const sections = [
		[
			'Identity',
			`Class: ${value('class')}   Level: ${level ?? '—'}   Race: ${value('race')}`,
			`Background: ${value('background')}   Subclass: ${value('subclass')}`,
		],
		[
			'Combat',
			`HP: ${c.combat.hp ?? '—'} / ${c.combat.maxHp ?? '—'}   AC: ${c.combat.ac ?? '—'}   Speed: ${value('speed')}   Initiative: ${value('init')}`,
			`Conditions: ${c.combat.conditions?.join(', ') || '—'}`,
		],
		[
			'Abilities',
			Object.entries(c.attributes)
				.map(([key, score]) => `${key.toUpperCase()}: ${score}`)
				.join('   ') || '—',
		],
		[
			'Proficiencies',
			`Saving throws: ${c.proficiencies.saves.join(', ') || '—'}`,
			`Skills: ${
				Object.entries(c.proficiencies.skills)
					.map(([key, rank]) => `${key}: ${rank}`)
					.join(', ') || '—'
			}`,
		],
		['Attacks', ...c.attacks.map((a) => `${a.name}: ${a.detail}`)],
		[
			'Equipment',
			...(inventory?.items.map(
				(i) => `${i.quantity} × ${i.name}${i.equipped ? ' (equipped)' : ''}`,
			) ?? []),
			`Currency: ${
				inventory
					? Object.entries(inventory.currency)
							.map(([coin, count]) => `${count} ${coin}`)
							.join('   ')
					: '—'
			}`,
		],
		['Backstory', value('backstory')],
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
				title: `${c.name} — Character sheet`,
				blob: sheetPdf(canvas.current, c.name, rows),
			});
			setMessage(
				result.status === 'cancelled'
					? 'Export cancelled.'
					: 'Character sheet exported. Open the PDF to print.',
			);
		} catch (error) {
			setMessage(
				error instanceof Error ? error.message : 'Could not export the character sheet. Try again.',
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<>
			<Button variant="secondary" disabled={busy} onClick={save}>
				Print / Save PDF
			</Button>
			{message && <span role="status">{message}</span>}
			<canvas ref={canvas} hidden />
			{createPortal(
				<article className="character-print-sheet" aria-label="Printable character sheet">
					<h1>{c.name}</h1>
					<p>Character sheet · Compact summary</p>
					{rows.map((row, i) => (
						<p key={i}>{row}</p>
					))}
					<footer>
						Long sections are abbreviated with …; full details remain in the character sheet.
					</footer>
				</article>,
				document.body,
			)}
		</>
	);
}
