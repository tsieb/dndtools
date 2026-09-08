// RC-CLD-1.4 — PRODUCT ANALYTICS INGESTION.
//
// The privacy property this handler exists to keep is that there is NOTHING TO LEAK: it stores no
// payload anywhere. A batch arrives, is re-validated against the same core taxonomy the client
// built it with, is turned into CloudWatch counters, and is dropped. No DynamoDB item, no S3
// object, no caller IP, no request id correlated to a user — an anonymous request that leaves no
// row behind cannot later become a profile, and a subpoena, a bucket misconfiguration or a future
// feature has nothing to reach for.
//
// It is deliberately UNAUTHENTICATED. Requiring a Cognito token would attach every event to an
// account, which is the opposite of what an anonymous counter is for. The cost of that choice is
// that the endpoint is open, so it is bounded rather than trusted: a body size cap, a batch size
// cap, closed-vocabulary validation, and a flat 202 for every outcome so a prober learns nothing.
//
// COST. Each unique CloudWatch metric costs $0.30/month, so the metric dimensions stay at
// {Stage, Event} — six metrics, not six times the property cardinality. Property detail rides
// along as a non-metric field on the same EMF log line, where Logs Insights can group by it for
// free, and the log group's retention is short.
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { parseProductAnalyticsPayload } from '@dndtools/core';

const STAGE = process.env.STAGE ?? 'dev';
const METRIC_NAMESPACE = process.env.METRIC_NAMESPACE ?? 'dndtools/Analytics';

/** Largest body accepted, before parsing. A valid maximum batch is far under this. */
const MAX_BODY_BYTES = 16 * 1024;

/** Every outcome answers this. A validation failure and a success look identical from outside. */
const ACCEPTED = { statusCode: 202, headers: { 'content-type': 'application/json' }, body: '{}' };

/** One CloudWatch EMF line: metric values plus free-form fields, written to stdout. */
function emitEmf(
	fields: Record<string, unknown>,
	metrics: { name: string; value: number }[],
): void {
	if (metrics.length === 0) return;
	console.log(
		JSON.stringify({
			_aws: {
				Timestamp: Date.now(),
				CloudWatchMetrics: [
					{
						Namespace: METRIC_NAMESPACE,
						Dimensions: [['Stage', 'Event']],
						Metrics: metrics.map((m) => ({ Name: m.name, Unit: 'Count' })),
					},
				],
			},
			...fields,
			...Object.fromEntries(metrics.map((m) => [m.name, m.value])),
		}),
	);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
	const raw = event.body ?? '';
	if (raw.length === 0 || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return ACCEPTED;

	let parsedBody: unknown;
	try {
		parsedBody = JSON.parse(event.isBase64Encoded ? Buffer.from(raw, 'base64').toString() : raw);
	} catch {
		return ACCEPTED;
	}

	// The SAME validator the client built with. An event the core would not build is not counted.
	const payload = parseProductAnalyticsPayload(parsedBody);
	if (!payload) return ACCEPTED;

	// Counts per event name, and per name+property combination for the log-only detail field.
	const perEvent = new Map<string, number>();
	const perDetail = new Map<string, number>();
	for (const e of payload.events) {
		perEvent.set(e.name, (perEvent.get(e.name) ?? 0) + 1);
		const detail = Object.entries(e.props)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${k}=${v}`)
			.join(',');
		const key = detail ? `${e.name}|${detail}` : e.name;
		perDetail.set(key, (perDetail.get(key) ?? 0) + 1);
	}

	for (const [name, count] of perEvent) {
		emitEmf(
			{
				Stage: STAGE,
				Event: name,
				appVersion: payload.appVersion,
				platform: payload.platform,
				detail: Object.fromEntries(
					[...perDetail].filter(([key]) => key === name || key.startsWith(`${name}|`)),
				),
			},
			[{ name: 'Events', value: count }],
		);
	}

	return ACCEPTED;
};
