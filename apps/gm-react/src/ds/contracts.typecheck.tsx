/** Compile with `pnpm exec tsc -p apps/gm-react/src/ds/tsconfig.json`.
 * These consumer contracts must be checked without the legacy runtime-test adapters. */
import {
	Button,
	Input,
	Select,
	Checkbox,
	DataTable,
	SegmentedControl,
	RadioCard,
	Toaster,
	DiceResult,
	VisibilityChip,
	Skeleton,
	ProgressMeter,
	abilityModifier,
	LayerRow,
	type ButtonProps,
	type DSChangeEvent,
	type DSBadgeStatus,
} from './index';

type Assert<T extends true> = T;
type IsUntyped<T> = 0 extends 1 & T ? true : false;
export type ButtonContractIsTyped = Assert<IsUntyped<ButtonProps> extends false ? true : false>;
export type ModifierIsSignedText = Assert<
	ReturnType<typeof abilityModifier> extends string ? true : false
>;

export function consumerContracts(onChoice: (value: 'map' | 'scene') => void) {
	const onField = (event: DSChangeEvent) => event.currentTarget.value;
	const rows = [{ id: 'one', count: 3 }];
	const status: DSBadgeStatus = 'success';
	Toaster.show({ status, message: 'Saved', id: 'stable-id' });
	Toaster.show({ message: 'Generated ID' }) satisfies number;
	const valid = (
		<>
			<DiceResult total={20} dice={[{ value: 20 }] as const} drama="play" />
			<VisibilityChip byException label={String(status)} />
			<Skeleton variant="list" rows={3} avatar />
			<Skeleton variant="canvas" />
			<ProgressMeter value={42} eta="About one minute left" />
			<LayerRow
				layer={{
					name: 'Walls',
					type: 'custom',
					opacity: 100,
					dmDisplay: true,
					visibility: 'shared',
				}}
				style={{ '--color-text-tertiary': 'var(--color-text-secondary)', flex: '0 0 auto' }}
			/>
			<Button icon="add" onClick={(event) => event.currentTarget.focus()} />
			<Input onChange={onField} onKeyDown={(event) => event.currentTarget.select()} />
			<Select options={['one']} onChange={onField} />
			<Checkbox onChange={(checked) => checked satisfies boolean} />
			<SegmentedControl value="map" options={['map', 'scene']} onChange={onChoice} />
			<RadioCard value="map" onChange={onChoice} />
			<DataTable
				rows={rows}
				columns={[{ key: 'count', header: 'Count', render: (_value, row) => row.count.toFixed() }]}
				rowKey={(row) => row.id}
			/>
		</>
	);
	// @ts-expect-error Unknown Button props must not slip through a permissive barrel.
	const invalidButton = <Button inventedProp="value" />;
	// @ts-expect-error Checkbox emits a boolean, not a DOM event.
	const invalidChange = <Checkbox onChange={(event: DSChangeEvent) => event.target.value} />;
	// @ts-expect-error Table callbacks retain the row model.
	const invalidTable = <DataTable rows={rows} columns={[]} rowKey={(row) => row.missing} />;
	// @ts-expect-error Size is a closed package contract.
	const invalidSize = <Button size="huge" />;
	return [valid, invalidButton, invalidChange, invalidTable, invalidSize];
}
