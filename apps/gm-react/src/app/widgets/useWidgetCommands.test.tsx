// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useWidgetCommands } from './useWidgetCommands';
import type { SceneBoardCanvasProps } from '../SceneBoardModel';
import type { WidgetCommandHandler } from './WidgetRenderSlot';

it('keeps one callback per widget, routes it to the latest host and drops removed widgets', () => {
	const container = document.createElement('div');
	const root = createRoot(container);
	let commands = new Map<string, WidgetCommandHandler>();
	function Probe(props: Pick<SceneBoardCanvasProps, 'widgets' | 'onWidgetCommand'>) {
		commands = useWidgetCommands(props.widgets, props.onWidgetCommand);
		return null;
	}
	const widgets = [{ id: 'one' }, { id: 'two' }] as SceneBoardCanvasProps['widgets'];
	const firstHost = vi.fn();
	const nextHost = vi.fn();
	try {
		act(() => root.render(<Probe widgets={widgets} onWidgetCommand={firstHost} />));
		const first = commands.get('one');
		act(() => root.render(<Probe widgets={widgets} onWidgetCommand={firstHost} />));
		expect(commands.get('one')).toBe(first);
		act(() => root.render(<Probe widgets={[...widgets]} onWidgetCommand={nextHost} />));
		// A new host closure (say, the next scene revision) must not hand memoised bodies a new prop.
		expect(commands.get('one')).toBe(first);
		commands.get('one')!('roll', { sides: 20 });
		expect(nextHost).toHaveBeenCalledWith('one', 'roll', { sides: 20 });
		expect(firstHost).not.toHaveBeenCalled();
		act(() => root.render(<Probe widgets={widgets.slice(1)} onWidgetCommand={nextHost} />));
		expect([...commands.keys()]).toEqual(['two']);
		act(() => root.render(<Probe widgets={widgets} />));
		expect(commands.size).toBe(0);
		act(() => root.render(<Probe widgets={widgets} onWidgetCommand={firstHost} />));
		commands.get('two')!('advance', {});
		expect(firstHost).toHaveBeenCalledWith('two', 'advance', {});
	} finally {
		act(() => root.unmount());
	}
});
