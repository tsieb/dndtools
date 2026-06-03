function evaluateSceneVisibility(scene, actor) {
  if (!actor) return { kind: "hidden", reason: "unknown-actor" };
  if (actor.role === "dm") return { kind: "visible", assignedSectionIds: null };
  if (scene.visibility === "dm-only") return { kind: "hidden", reason: "dm-only" };
  const assignment = scene.playerViewAssignments.find((a) => a.playerActorId === actor.id);
  if (scene.visibility === "player-visible") {
    return { kind: "visible", assignedSectionIds: assignment?.sectionIds ?? null };
  }
  const hasSharingTarget = scene.sharingTargets.includes(actor.id);
  if (assignment || hasSharingTarget) {
    return { kind: "visible", assignedSectionIds: assignment?.sectionIds ?? null };
  }
  return { kind: "hidden", reason: "not-shared" };
}
function listScenesForActor(state, permission, actorId) {
  const actor = permission.actors[actorId];
  if (!actor) return [];
  const out = [];
  for (const scene of Object.values(state.scenes)) {
    const evaluation = evaluateSceneVisibility(scene, actor);
    if (evaluation.kind !== "visible") continue;
    if (scene.templateMeta.isTemplate && actor.role !== "dm") continue;
    out.push({
      id: scene.id,
      name: scene.name,
      tags: scene.tags,
      visibility: scene.visibility,
      updatedAt: scene.ownership.updatedAt,
      isTemplate: scene.templateMeta.isTemplate
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
const PERMISSIVE_RESOLVER = {
  knownEntityIds: /* @__PURE__ */ new Set(),
  isHiddenForActor: () => false
};
function getSceneForActor(state, permission, actorId, sceneId, resolver = PERMISSIVE_RESOLVER) {
  const actor = permission.actors[actorId];
  if (!actor) return { kind: "denied", reason: "unknown-actor" };
  const scene = state.scenes[sceneId];
  if (!scene) return { kind: "denied", reason: "scene-not-found" };
  const evaluation = evaluateSceneVisibility(scene, actor);
  if (evaluation.kind !== "visible") {
    return { kind: "denied", reason: evaluation.reason };
  }
  const sectionScope = evaluation.assignedSectionIds;
  const deliverableWidgetIds = sectionScope === null ? null : new Set(
    scene.sections.filter((s) => sectionScope.includes(s.id)).flatMap((s) => s.widgetInstanceIds)
  );
  const widgets = [];
  const widgetSourcePool = deliverableWidgetIds === null ? scene.widgets : scene.widgets.filter((w) => deliverableWidgetIds.has(w.id));
  for (const widget of widgetSourcePool) {
    const known = resolver.knownEntityIds.size === 0 || (widget.binding ? resolver.knownEntityIds.has(widget.binding.source.entityId) : true);
    if (widget.binding && !known) {
      widgets.push({ kind: "missing", widgetInstanceId: widget.id, type: widget.type });
      continue;
    }
    if (resolver.isHiddenForActor(widget, actorId)) {
      widgets.push({ kind: "hidden", widgetInstanceId: widget.id, type: widget.type });
      continue;
    }
    widgets.push({ kind: "available", widget });
  }
  const sections = sectionScope === null ? scene.sections : scene.sections.filter((s) => sectionScope.includes(s.id));
  return {
    id: scene.id,
    name: scene.name,
    description: scene.description,
    tags: scene.tags,
    visibility: scene.visibility,
    visualSettings: scene.visualSettings,
    ownership: scene.ownership,
    sections,
    widgets,
    templateMeta: scene.templateMeta,
    assignedSectionIds: sectionScope
  };
}
export {
  getSceneForActor as g,
  listScenesForActor as l
};
