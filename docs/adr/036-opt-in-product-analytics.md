# ADR-036: Opt-In, Content-Free Product Analytics

- Status: Accepted
- Date: 2026-09-07
- Deciders: Engineering
- Consulted: Product, Security
- Supersedes: N/A
- Amends: ADR-033 (the stage overview dashboard gains a seventh widget and the account gains one
  custom-metric namespace, `dndtools/Analytics`, inside the same cost discipline).

## Context

Deciding what to build next currently rests on nothing. Nobody knows whether the map editor is used
weekly or never, whether anyone raises their experience tier past `core`, or whether the AI panel
gets opened twice and abandoned. The honest options are to keep guessing, to ask people, or to
measure.

Measuring is the option with a trap in it. A vault holds a campaign's private writing, and the usual
analytics SDK ships an event bus that accepts arbitrary properties, a persistent install id, an IP
address the collector records for free, and a "just in case" payload field. Any one of those turns a
usage counter into a channel that can carry a player's name or a note's title, and none of them is
visible to the person whose data it is. This product has already committed to the opposite posture
in ADR-026 (privacy modes are an undefaulted, explicit choice) and in `diagnostics/redaction.ts`
(support bundles redact by default). Analytics that could not be reconciled with those would simply
not ship.

## Decision

Product analytics is **opt-in, anonymous and content-free by construction** rather than by
scrubbing. Four rules carry that.

**1. The taxonomy is closed and lives in the core.**
`packages/core/src/diagnostics/product-analytics.ts` declares a fixed set of event names, and for
each event a fixed set of property keys, and for each key a fixed set of permitted values. There is
no free-text field and no `Record<string, unknown>` escape hatch anywhere in the shape.
`buildProductAnalyticsEvent` rejects an unknown name, key or value outright — it returns `null`
rather than sanitising and continuing, so an off-taxonomy call is a dropped call, not a cleaned one.
Adding an event is an edit to that file, reviewed like any other core contract change. Where a
vocabulary already exists — the error taxonomy's categories, the onboarding registry's feature
tiers — the taxonomy reuses it instead of declaring a parallel list that could drift.

**2. Nothing identifies anyone.** The wire envelope is `{version, appVersion, platform, events[]}`.
No account id, no vault id, no install id, no session id, no timestamp. `appVersion` is coarsened to
`major.minor` so it is a cohort, not a fingerprint. Two installs sending the same event produce
byte-identical bodies, which is the property that lets the endpoint be unauthenticated without
becoming a tracker: there is nothing to correlate on.

**3. Consent is checked twice, and fails closed.** `telemetryConsent()` reads a device-local record
whose absent, unrecognised or tampered value resolves to `denied`. The client checks it when
recording (so nothing is buffered without consent) and again when flushing (so a batch queued before
a withdrawal is dropped rather than sent). The Settings panel is a single switch defaulted off, with
the event list rendered from the core taxonomy so the panel cannot promise less than the client
sends.

**4. Ingestion stores nothing.** `POST /telemetry` on the existing app-api HTTP API routes to its
own small Lambda with the bare execution role — no DynamoDB, S3, SES or Cognito permission at all.
It re-validates the batch with the same core parser, emits CloudWatch EMF counters, and drops the
payload. There is no table, no bucket, no queue and no always-on collector, so the design is
$0-idle, and there is no stored dataset for a future feature, a misconfiguration or a legal request
to reach for. Every outcome answers a flat `202`, so a prober learns nothing from probing.

## Consequences

- Analytics can only ever answer coarse questions: which screens and features are opened, on which
  platform, at which tier. It cannot answer "which map generator" or "how long a session ran", and
  it can never do funnels, retention or per-user analysis. That is the trade being made, not an
  oversight — a design that could answer those is a design that stores identity.
- The endpoint is open, so it is bounded rather than trusted: a 16 KB body cap, a 50-event batch
  cap, closed-vocabulary validation, API-Gateway throttling and (where the account's Lambda quota
  allows it) a reserved concurrency of 5. A flood produces junk counters and junk log lines, and
  reaches nothing else in the stack.
- Metric dimensions stay at `{Stage, Event}` — six custom metrics at $0.30/month each, roughly
  $1.80/month per stage — with property-level detail riding along as a non-metric field on the same
  EMF line, where Logs Insights can group by it at no per-metric cost. Dimensioning on property
  values would have multiplied that by the enum cardinality for the same information.
- The telemetry log group keeps 14 days rather than the stack default. The counters are the durable
  artefact; retaining raw event lines longer would slowly rebuild the dataset this design avoids.
- Nothing here is a legal basis analysis. The consent record is device-local and the payload is
  anonymous, so there is no subject to serve an access or erasure request for — but if a future
  event ever carries an identifier, that stops being true and this ADR needs revisiting first.

## Alternatives considered

- **A hosted analytics SDK (PostHog, Plausible, Amplitude).** Rejected: every one of them collects
  the caller's IP and mints a persistent anonymous id by default, both of which are identity, and
  the free-form event API removes the guarantee that content cannot reach the wire.
- **Authenticated ingestion, so events could be tied to a plan.** Rejected: attaching an account id
  to every event is precisely the thing rule 2 exists to prevent, and the questions it would answer
  are not worth being a service that holds per-user behavioural records.
- **Storing raw events in DynamoDB and aggregating later.** Rejected: it is the only variant with an
  idle cost, and it recreates the stored dataset. Counters are what the questions actually need.
