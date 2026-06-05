// CONTENT-011: the Knowledge section surfaces calendar-aware notes/structured objects. Client-rendered
// like the rest of the prototype (ADR-014: client/static, no server-owned state); the runtime +
// actor-filtered content queries run in the browser. Knowledge is a `planned` canonical IA section
// (NAV-009) — this route is directly reachable for the CONTENT-011 calendar/time slice, but the full
// note/object tree and primary-nav release remain owned by later CONTENT/NAV epics.
export const ssr = false;
export const prerender = false;
