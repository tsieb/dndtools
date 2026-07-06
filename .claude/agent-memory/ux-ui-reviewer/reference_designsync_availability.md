---
name: designsync-availability
description: DesignSync (claude.ai/design fetch tool) is listed on the ux-ui-reviewer agent type but can be runtime-disabled when the agent runs as a subagent
metadata:
  type: reference
---

DesignSync is the tool for fetching design-prototype sources from claude.ai/design
projects (e.g. prototype B `20316ed7-4fd5-4edd-8294-48f899b74252` "Dndtools design
system prototype", and system A `8ae04609` "DND Tools Design System").

GOTCHA: Although the `ux-ui-reviewer` agent type nominally lists `DesignSync` in its
toolset, it can be runtime-disabled when this agent is launched as a subagent. Observed
2026-07-03: a direct call returned "DesignSync exists but is not enabled in this
context"; `ToolSearch select:DesignSync` and keyword search both returned nothing
(it is not a deferred tool, just disabled).

**How to apply:** If asked to sync/fetch design files and DesignSync is disabled,
don't fabricate file contents. Verify with a direct call + ToolSearch, then report the
blocker up to the parent agent — DesignSync reliably works from the MAIN thread, so the
fetch should be run there (or the tool re-provisioned for the subagent). Repo's vendored
copy lives at `docs/design-package/` but was synced against system A, not prototype B,
so it is not a substitute for prototype-B view files (views/*.jsx, app.jsx, etc.).
