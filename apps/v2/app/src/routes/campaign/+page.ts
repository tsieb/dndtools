// Campaign is an approved-but-`planned` canonical IA section (NAV-009). The UX-SHELL seven-section
// primary nav presents it, so this route exists as a durable, reachable section root with an honest
// empty state (doc 16 §10.3). Client-rendered like the rest of the prototype (ADR-014); the full
// Campaign workspace (arcs, quests, factions, timeline) is owned by later CAMPAIGN epics.
export const ssr = false;
export const prerender = false;
