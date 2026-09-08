# Product analytics (opt-in, content-free)

The decision and its reasoning are ADR-036. This is the operational reference: what the taxonomy is,
where each piece lives, how to add an event, and how to read the numbers.

## The one-line contract

Nothing leaves the device until a DM turns the switch on in **Settings › Sync & privacy › Product
analytics**, and what leaves is a count of closed-vocabulary events with no identifier attached.

## Where it lives

| Piece               | File                                                 | Responsibility                                                      |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| Taxonomy + envelope | `packages/core/src/diagnostics/product-analytics.ts` | The closed event set, consent predicate, builder and payload parser |
| Client              | `apps/gm-react/src/cloud/telemetry.ts`               | Consent storage, batching, transport. Cannot widen the taxonomy     |
| Call sites          | `apps/gm-react/src/cloud/useAnalytics.ts`            | The ONLY places the app records anything                            |
| Consent UI          | `apps/gm-react/src/screens/settings/Analytics.tsx`   | One switch, defaulted off, with the event list read from the core   |
| Ingestion           | `packages/cloud-fns/src/app-api/telemetry.ts`        | Re-validates, emits EMF counters, stores nothing                    |
| Route + function    | `infra/app-api/template.yaml` (`TelemetryFn`)        | `POST /telemetry`, unauthenticated, bare execution role             |
| Dashboard           | `infra/foundation/template.yaml`                     | The "Opt-in product analytics events" widget on the stage overview  |

## The events

| Event              | Properties (all closed sets)                      |
| ------------------ | ------------------------------------------------- |
| `app.launched`     | `platform`: web \| desktop                        |
| `screen.viewed`    | `screen`: a top-level route name, or `other`      |
| `feature.used`     | `feature`: a coarse feature bucket                |
| `experience.tier`  | `tier`: the onboarding registry's `FEATURE_TIERS` |
| `cloud.capability` | `capability`, `state`                             |
| `error.observed`   | `category`: the error taxonomy's categories       |

The envelope adds only `version`, `appVersion` (coarsened to `major.minor`) and `platform`.

## Adding an event

1. Add the name and its property enums to `PRODUCT_ANALYTICS_EVENTS`. If a vocabulary for it already
   exists in the core, reuse that array rather than retyping it.
2. Add its plain-language line to `EVENT_LABEL` in `Analytics.tsx` and both message catalogs. This
   is enforced: the map is `satisfies Record<ProductAnalyticsEventName, MessageKey>`, so a new event
   without copy fails `pnpm typecheck` rather than shipping unlabelled on the consent panel.
3. Record it from `useAnalytics.ts`, or from a module the shell already owns. Do not add call sites
   across screens — the value of one file is that "what does this record?" has one answer.
4. Ask the only question that matters: could any value of any property ever be derived from what a
   DM wrote? If yes, it does not belong in the taxonomy at any level of hashing or truncation.

A property that would need free text is a property that does not ship. There is no mechanism to
send one, and that is deliberate.

## Reading the numbers

- **Dashboard**: `dndtools-<stage>-overview`, widget "Opt-in product analytics events". Empty is the
  honest default — with nobody consenting there is nothing to plot, and no traffic looks exactly the
  same as no consent. The widget cannot distinguish them, and neither can anyone else.
- **Property breakdown**: CloudWatch Logs Insights over `/dndtools/<stage>/lambda/telemetry`. The
  `detail` field on each line holds per-property counts. Retention is 14 days.
- **Metrics**: namespace `dndtools/Analytics`, metric `Events`, dimensions `Stage` and `Event`. Six
  custom metrics per stage, deliberately — see ADR-036 for why the properties are not dimensions.

## Testing the guarantee

`apps/gm-react/src/cloud/telemetry.test.ts` holds the acceptance criterion, and the assertion that
carries it is `fetch` never being called — not "an empty payload was sent". If that test is ever
weakened to check payload contents instead of call count, the guarantee has quietly stopped being
tested.
