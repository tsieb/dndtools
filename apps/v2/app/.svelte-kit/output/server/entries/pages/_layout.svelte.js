import { e as escape_html } from "../../chunks/context.js";
import "clsx";
import { S as SCENE_SCHEMA_VERSION, i as instantiateSceneTemplateInputSchema, s as saveSceneTemplateInputSchema, a as setSceneSectionsInputSchema, u as updateSceneMetadataInputSchema, c as createSceneInputSchema, d as destroyWidgetInputSchema, p as pinWidgetInputSchema, b as dockWidgetInputSchema, m as moveGroupInputSchema, g as groupWidgetsInputSchema, l as layerWidgetInputSchema, r as resizeWidgetInputSchema, e as moveWidgetInputSchema, f as addWidgetInputSchema, E as EMPTY_SCENE_STATE, h as provideRuntime } from "../../chunks/runtime-context.js";
import Dexie from "dexie";
const PERMISSION_STATE_SCHEMA_VERSION = 1;
const EMPTY_PERMISSION_STATE = Object.freeze({
  actors: {},
  grants: [],
  schemaVersion: PERMISSION_STATE_SCHEMA_VERSION
});
const SYNC_OPERATION_SCHEMA_VERSION = 1;
const EMPTY_OPERATION_LOG = Object.freeze({ operations: [] });
function appendOperation(log, op) {
  return { operations: [...log.operations, op] };
}
function reject(rejection, state) {
  return { status: "rejected", rejection, nextState: state };
}
function getActor(state, actorId) {
  return state.permissions.actors[actorId];
}
function requireActor(state, actorId) {
  const actor = getActor(state, actorId);
  if (!actor) {
    return { code: "unknown-actor", message: `Actor ${actorId} is not registered.` };
  }
  return actor;
}
function requireDm(actor) {
  if (actor.role !== "dm") {
    return { code: "actor-not-authorized", message: "Only the DM may perform this action." };
  }
  return null;
}
function getScene(state, sceneId) {
  return state.scenes.scenes[sceneId];
}
function requireScene(state, sceneId) {
  const scene = getScene(state, sceneId);
  if (!scene) {
    return { code: "scene-not-found", message: `Scene ${sceneId} does not exist.` };
  }
  return scene;
}
function parseInput(schema, raw) {
  const result = schema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const error = result.error;
  const issues = error.issues.map((issue) => ({
    path: issue.path.map(String).join(".") || "(root)",
    message: issue.message
  }));
  return {
    ok: false,
    rejection: {
      code: "invalid-payload",
      message: "Command payload failed schema validation.",
      issues
    }
  };
}
function withScene(state, sceneId, updater) {
  const previous = state.scenes[sceneId];
  if (!previous) return state;
  const nextScene = updater(previous);
  return {
    schemaVersion: state.schemaVersion,
    scenes: { ...state.scenes, [sceneId]: nextScene }
  };
}
function bumpRevision(scene, env) {
  return {
    ...scene,
    ownership: {
      ...scene.ownership,
      updatedAt: env.clock(),
      revision: scene.ownership.revision + 1
    }
  };
}
function findWidget(scene, widgetInstanceId) {
  return scene.widgets.find((w) => w.id === widgetInstanceId);
}
function replaceWidget(scene, widget) {
  return {
    ...scene,
    widgets: scene.widgets.map((w) => w.id === widget.id ? widget : w)
  };
}
function appendOperationDraft(env, log, actorId, draft) {
  const op = {
    id: env.ids(),
    vaultId: env.vaultId,
    sourceId: env.sourceId,
    actorId,
    entityType: draft.entityType,
    entityId: draft.entityId,
    opType: draft.opType,
    path: draft.path,
    value: draft.value,
    beforeRevision: draft.beforeRevision,
    afterRevision: draft.afterRevision,
    dependencies: draft.dependencies ?? [],
    issuedAt: env.clock(),
    schemaVersion: SYNC_OPERATION_SCHEMA_VERSION
  };
  return { log: appendOperation(log, op), op };
}
function handleCreateScene(state, env, actorId, rawPayload) {
  const actor = requireActor(state, actorId);
  if ("code" in actor) return reject(actor, state);
  const dmCheck = requireDm(actor);
  if (dmCheck) return reject(dmCheck, state);
  const parsed = parseInput(createSceneInputSchema, rawPayload);
  if (!parsed.ok) return reject(parsed.rejection, state);
  const now = env.clock();
  const id = env.ids();
  const scene = {
    id,
    name: parsed.data.name,
    description: parsed.data.description,
    tags: parsed.data.tags,
    visibility: parsed.data.visibility,
    visualSettings: parsed.data.visualSettings,
    ownership: { ownerActorId: actor.id, createdAt: now, updatedAt: now, revision: 1 },
    sharingTargets: parsed.data.sharingTargets,
    playerViewAssignments: parsed.data.playerViewAssignments,
    templateMeta: { isTemplate: parsed.data.asTemplate, instantiatedFromTemplateSceneId: null },
    sections: [],
    widgets: [],
    schemaVersion: SCENE_SCHEMA_VERSION
  };
  const nextSceneState = {
    schemaVersion: state.scenes.schemaVersion,
    scenes: { ...state.scenes.scenes, [id]: scene }
  };
  const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
    entityType: "scene",
    entityId: id,
    opType: "scene.create",
    value: scene,
    afterRevision: scene.ownership.revision
  });
  return {
    status: "accepted",
    nextState: { ...state, scenes: nextSceneState, sync: nextLog },
    events: [{ kind: "scene.created", sceneId: id, actorId: actor.id }],
    operationIds: [op.id]
  };
}
function handleUpdateSceneMetadata(state, env, actorId, rawPayload) {
  const actor = requireActor(state, actorId);
  if ("code" in actor) return reject(actor, state);
  const dmCheck = requireDm(actor);
  if (dmCheck) return reject(dmCheck, state);
  const parsed = parseInput(updateSceneMetadataInputSchema, rawPayload);
  if (!parsed.ok) return reject(parsed.rejection, state);
  const scene = requireScene(state, parsed.data.sceneId);
  if ("code" in scene) return reject(scene, state);
  const changedPaths = [];
  const nextScene = bumpRevision(
    {
      ...scene,
      name: parsed.data.name ?? scene.name,
      description: parsed.data.description ?? scene.description,
      tags: parsed.data.tags ?? scene.tags,
      visibility: parsed.data.visibility ?? scene.visibility,
      visualSettings: parsed.data.visualSettings ? { ...scene.visualSettings, ...parsed.data.visualSettings } : scene.visualSettings,
      sharingTargets: parsed.data.sharingTargets ?? scene.sharingTargets,
      playerViewAssignments: parsed.data.playerViewAssignments ?? scene.playerViewAssignments
    },
    env
  );
  for (const [key, value] of Object.entries(parsed.data)) {
    if (key === "sceneId") continue;
    if (value === void 0) continue;
    changedPaths.push(key);
  }
  if (changedPaths.length === 0) {
    return reject(
      { code: "invalid-payload", message: "No metadata fields were supplied." },
      state
    );
  }
  const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);
  const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
    entityType: "scene",
    entityId: scene.id,
    opType: "scene.update-metadata",
    path: changedPaths.join(","),
    value: parsed.data,
    beforeRevision: scene.ownership.revision,
    afterRevision: nextScene.ownership.revision
  });
  return {
    status: "accepted",
    nextState: { ...state, scenes: nextSceneState, sync: nextLog },
    events: [
      {
        kind: "scene.metadata-changed",
        sceneId: scene.id,
        actorId: actor.id,
        paths: changedPaths
      }
    ],
    operationIds: [op.id]
  };
}
function handleSetSceneSections(state, env, actorId, rawPayload) {
  const actor = requireActor(state, actorId);
  if ("code" in actor) return reject(actor, state);
  const dmCheck = requireDm(actor);
  if (dmCheck) return reject(dmCheck, state);
  const parsed = parseInput(setSceneSectionsInputSchema, rawPayload);
  if (!parsed.ok) return reject(parsed.rejection, state);
  const scene = requireScene(state, parsed.data.sceneId);
  if ("code" in scene) return reject(scene, state);
  const widgetIds = new Set(scene.widgets.map((w) => w.id));
  for (const section of parsed.data.sections) {
    for (const memberId of section.widgetInstanceIds) {
      if (!widgetIds.has(memberId)) {
        return reject(
          {
            code: "invalid-state",
            message: `Section ${section.id} references unknown widget ${memberId}.`
          },
          state
        );
      }
    }
  }
  const nextScene = bumpRevision({ ...scene, sections: parsed.data.sections }, env);
  const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);
  const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
    entityType: "scene",
    entityId: scene.id,
    opType: "scene.set-sections",
    value: parsed.data.sections,
    beforeRevision: scene.ownership.revision,
    afterRevision: nextScene.ownership.revision
  });
  return {
    status: "accepted",
    nextState: { ...state, scenes: nextSceneState, sync: nextLog },
    events: [{ kind: "scene.sections-changed", sceneId: scene.id, actorId: actor.id }],
    operationIds: [op.id]
  };
}
function handleSaveSceneTemplate(state, env, actorId, rawPayload) {
  const actor = requireActor(state, actorId);
  if ("code" in actor) return reject(actor, state);
  const dmCheck = requireDm(actor);
  if (dmCheck) return reject(dmCheck, state);
  const parsed = parseInput(saveSceneTemplateInputSchema, rawPayload);
  if (!parsed.ok) return reject(parsed.rejection, state);
  const source = requireScene(state, parsed.data.sourceSceneId);
  if ("code" in source) return reject(source, state);
  const now = env.clock();
  const newId = env.ids();
  const widgetMap = /* @__PURE__ */ new Map();
  const clonedWidgets = source.widgets.map((widget) => {
    const cloned = {
      ...widget,
      id: env.ids(),
      layout: { ...widget.layout, groupId: null },
      configuration: { ...widget.configuration }
    };
    widgetMap.set(widget.id, cloned);
    return cloned;
  });
  const clonedSections = source.sections.map((section) => ({
    ...section,
    id: env.ids(),
    widgetInstanceIds: section.widgetInstanceIds.map((id) => widgetMap.get(id)?.id).filter((value) => Boolean(value))
  }));
  const template = {
    id: newId,
    name: parsed.data.templateName,
    description: source.description,
    tags: source.tags.slice(),
    visibility: "dm-only",
    visualSettings: { ...source.visualSettings },
    ownership: { ownerActorId: actor.id, createdAt: now, updatedAt: now, revision: 1 },
    sharingTargets: [],
    playerViewAssignments: [],
    templateMeta: { isTemplate: true, instantiatedFromTemplateSceneId: null },
    sections: clonedSections,
    widgets: clonedWidgets,
    schemaVersion: SCENE_SCHEMA_VERSION
  };
  const nextSceneState = {
    schemaVersion: state.scenes.schemaVersion,
    scenes: { ...state.scenes.scenes, [newId]: template }
  };
  const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
    entityType: "scene",
    entityId: newId,
    opType: "scene.save-template",
    value: { sourceSceneId: source.id, templateName: parsed.data.templateName },
    afterRevision: template.ownership.revision
  });
  return {
    status: "accepted",
    nextState: { ...state, scenes: nextSceneState, sync: nextLog },
    events: [
      {
        kind: "scene.template-saved",
        templateSceneId: newId,
        sourceSceneId: source.id,
        actorId: actor.id
      }
    ],
    operationIds: [op.id]
  };
}
function handleInstantiateSceneTemplate(state, env, actorId, rawPayload) {
  const actor = requireActor(state, actorId);
  if ("code" in actor) return reject(actor, state);
  const dmCheck = requireDm(actor);
  if (dmCheck) return reject(dmCheck, state);
  const parsed = parseInput(instantiateSceneTemplateInputSchema, rawPayload);
  if (!parsed.ok) return reject(parsed.rejection, state);
  const template = requireScene(state, parsed.data.templateSceneId);
  if ("code" in template) return reject(template, state);
  if (!template.templateMeta.isTemplate) {
    return reject(
      {
        code: "template-source-not-template",
        message: `Scene ${template.id} is not marked as a template.`
      },
      state
    );
  }
  const now = env.clock();
  const newId = env.ids();
  const widgetMap = /* @__PURE__ */ new Map();
  const newWidgets = template.widgets.map((widget) => {
    const cloned = {
      ...widget,
      id: env.ids(),
      layout: { ...widget.layout, groupId: null },
      configuration: { ...widget.configuration },
      binding: widget.binding ? { ...widget.binding } : null
    };
    widgetMap.set(widget.id, cloned);
    return cloned;
  });
  const newSections = template.sections.map((section) => ({
    ...section,
    id: env.ids(),
    widgetInstanceIds: section.widgetInstanceIds.map((id) => widgetMap.get(id)?.id).filter((value) => Boolean(value))
  }));
  const scene = {
    id: newId,
    name: parsed.data.newSceneName,
    description: template.description,
    tags: template.tags.slice(),
    visibility: "dm-only",
    visualSettings: { ...template.visualSettings },
    ownership: { ownerActorId: actor.id, createdAt: now, updatedAt: now, revision: 1 },
    sharingTargets: [],
    playerViewAssignments: [],
    templateMeta: { isTemplate: false, instantiatedFromTemplateSceneId: template.id },
    sections: newSections,
    widgets: newWidgets,
    schemaVersion: SCENE_SCHEMA_VERSION
  };
  const nextSceneState = {
    schemaVersion: state.scenes.schemaVersion,
    scenes: { ...state.scenes.scenes, [newId]: scene }
  };
  const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
    entityType: "scene",
    entityId: newId,
    opType: "scene.instantiate-template",
    value: { templateSceneId: template.id, newSceneName: parsed.data.newSceneName },
    afterRevision: scene.ownership.revision
  });
  return {
    status: "accepted",
    nextState: { ...state, scenes: nextSceneState, sync: nextLog },
    events: [
      {
        kind: "scene.template-instantiated",
        templateSceneId: template.id,
        newSceneId: newId,
        actorId: actor.id
      }
    ],
    operationIds: [op.id]
  };
}
function widgetLayoutFromAdd(input, z) {
  return {
    x: input.x,
    y: input.y,
    w: input.w,
    h: input.h,
    z,
    groupId: null,
    dock: null,
    pinned: false,
    focusOrder: null
  };
}
function nextZ(scene) {
  if (scene.widgets.length === 0) return 1;
  return Math.max(...scene.widgets.map((w) => w.layout.z)) + 1;
}
function handleAddWidget(state, env, actorId, rawPayload) {
  const actor = requireActor(state, actorId);
  if ("code" in actor) return reject(actor, state);
  const dmCheck = requireDm(actor);
  if (dmCheck) return reject(dmCheck, state);
  const parsed = parseInput(addWidgetInputSchema, rawPayload);
  if (!parsed.ok) return reject(parsed.rejection, state);
  const scene = requireScene(state, parsed.data.sceneId);
  if ("code" in scene) return reject(scene, state);
  const widget = {
    id: env.ids(),
    type: parsed.data.widget.type,
    version: parsed.data.widget.version,
    layout: widgetLayoutFromAdd(parsed.data.widget.layout, nextZ(scene)),
    configuration: parsed.data.widget.configuration,
    binding: parsed.data.widget.binding
  };
  let nextSections = scene.sections;
  if (parsed.data.widget.sectionId) {
    const sectionId = parsed.data.widget.sectionId;
    const target = scene.sections.find((s) => s.id === sectionId);
    if (!target) {
      return reject(
        { code: "invalid-state", message: `Section ${sectionId} does not exist.` },
        state
      );
    }
    nextSections = scene.sections.map(
      (section) => section.id === sectionId ? { ...section, widgetInstanceIds: [...section.widgetInstanceIds, widget.id] } : section
    );
  }
  const nextScene = bumpRevision(
    { ...scene, widgets: [...scene.widgets, widget], sections: nextSections },
    env
  );
  const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);
  const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
    entityType: "scene",
    entityId: scene.id,
    opType: "scene.add-widget",
    path: `widgets/${widget.id}`,
    value: widget,
    beforeRevision: scene.ownership.revision,
    afterRevision: nextScene.ownership.revision
  });
  return {
    status: "accepted",
    nextState: { ...state, scenes: nextSceneState, sync: nextLog },
    events: [
      {
        kind: "scene.widget-added",
        sceneId: scene.id,
        widgetInstanceId: widget.id,
        actorId: actor.id
      }
    ],
    operationIds: [op.id]
  };
}
function mutateWidgetLayout(state, env, actorId, sceneId, widgetInstanceId, field, mutator, value, opType) {
  const actor = requireActor(state, actorId);
  if ("code" in actor) return reject(actor, state);
  const dmCheck = requireDm(actor);
  if (dmCheck) return reject(dmCheck, state);
  const scene = requireScene(state, sceneId);
  if ("code" in scene) return reject(scene, state);
  const widget = findWidget(scene, widgetInstanceId);
  if (!widget) {
    return reject(
      {
        code: "widget-not-found",
        message: `Widget ${widgetInstanceId} not found on Scene ${sceneId}.`
      },
      state
    );
  }
  const nextWidget = { ...widget, layout: mutator(widget.layout) };
  const sceneWithWidget = replaceWidget(scene, nextWidget);
  const nextScene = bumpRevision(sceneWithWidget, env);
  const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);
  const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
    entityType: "scene",
    entityId: scene.id,
    opType,
    path: `widgets/${widget.id}/layout/${field}`,
    value,
    beforeRevision: scene.ownership.revision,
    afterRevision: nextScene.ownership.revision
  });
  return {
    status: "accepted",
    nextState: { ...state, scenes: nextSceneState, sync: nextLog },
    events: [
      {
        kind: "scene.widget-layout-changed",
        sceneId: scene.id,
        widgetInstanceId: widget.id,
        actorId: actor.id,
        field
      }
    ],
    operationIds: [op.id]
  };
}
function handleMoveWidget(state, env, actorId, rawPayload) {
  const parsed = parseInput(moveWidgetInputSchema, rawPayload);
  if (!parsed.ok) return reject(parsed.rejection, state);
  return mutateWidgetLayout(
    state,
    env,
    actorId,
    parsed.data.sceneId,
    parsed.data.widgetInstanceId,
    "position",
    (layout) => ({ ...layout, x: parsed.data.x, y: parsed.data.y }),
    { x: parsed.data.x, y: parsed.data.y },
    "scene.move-widget"
  );
}
function handleResizeWidget(state, env, actorId, rawPayload) {
  const parsed = parseInput(resizeWidgetInputSchema, rawPayload);
  if (!parsed.ok) return reject(parsed.rejection, state);
  return mutateWidgetLayout(
    state,
    env,
    actorId,
    parsed.data.sceneId,
    parsed.data.widgetInstanceId,
    "size",
    (layout) => ({ ...layout, w: parsed.data.w, h: parsed.data.h }),
    { w: parsed.data.w, h: parsed.data.h },
    "scene.resize-widget"
  );
}
function handleLayerWidget(state, env, actorId, rawPayload) {
  const parsed = parseInput(layerWidgetInputSchema, rawPayload);
  if (!parsed.ok) return reject(parsed.rejection, state);
  return mutateWidgetLayout(
    state,
    env,
    actorId,
    parsed.data.sceneId,
    parsed.data.widgetInstanceId,
    "z",
    (layout) => ({ ...layout, z: parsed.data.z }),
    { z: parsed.data.z },
    "scene.layer-widget"
  );
}
function handleDockWidget(state, env, actorId, rawPayload) {
  const parsed = parseInput(dockWidgetInputSchema, rawPayload);
  if (!parsed.ok) return reject(parsed.rejection, state);
  return mutateWidgetLayout(
    state,
    env,
    actorId,
    parsed.data.sceneId,
    parsed.data.widgetInstanceId,
    "dock",
    (layout) => ({ ...layout, dock: parsed.data.dock }),
    { dock: parsed.data.dock },
    "scene.dock-widget"
  );
}
function handlePinWidget(state, env, actorId, rawPayload) {
  const parsed = parseInput(pinWidgetInputSchema, rawPayload);
  if (!parsed.ok) return reject(parsed.rejection, state);
  return mutateWidgetLayout(
    state,
    env,
    actorId,
    parsed.data.sceneId,
    parsed.data.widgetInstanceId,
    "pin",
    (layout) => ({ ...layout, pinned: parsed.data.pinned }),
    { pinned: parsed.data.pinned },
    "scene.pin-widget"
  );
}
function handleGroupWidgets(state, env, actorId, rawPayload) {
  const actor = requireActor(state, actorId);
  if ("code" in actor) return reject(actor, state);
  const dmCheck = requireDm(actor);
  if (dmCheck) return reject(dmCheck, state);
  const parsed = parseInput(groupWidgetsInputSchema, rawPayload);
  if (!parsed.ok) return reject(parsed.rejection, state);
  const scene = requireScene(state, parsed.data.sceneId);
  if ("code" in scene) return reject(scene, state);
  for (const id of parsed.data.widgetInstanceIds) {
    if (!findWidget(scene, id)) {
      return reject(
        { code: "widget-not-found", message: `Widget ${id} not found on Scene ${scene.id}.` },
        state
      );
    }
  }
  const groupId = env.ids();
  const targetIds = new Set(parsed.data.widgetInstanceIds);
  const newWidgets = scene.widgets.map(
    (widget) => targetIds.has(widget.id) ? { ...widget, layout: { ...widget.layout, groupId } } : widget
  );
  const nextScene = bumpRevision({ ...scene, widgets: newWidgets }, env);
  const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);
  const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
    entityType: "scene",
    entityId: scene.id,
    opType: "scene.group-widgets",
    path: `groups/${groupId}`,
    value: { groupId, widgetInstanceIds: parsed.data.widgetInstanceIds },
    beforeRevision: scene.ownership.revision,
    afterRevision: nextScene.ownership.revision
  });
  return {
    status: "accepted",
    nextState: { ...state, scenes: nextSceneState, sync: nextLog },
    events: parsed.data.widgetInstanceIds.map((id) => ({
      kind: "scene.widget-layout-changed",
      sceneId: scene.id,
      widgetInstanceId: id,
      actorId: actor.id,
      field: "group"
    })),
    operationIds: [op.id]
  };
}
function handleMoveGroup(state, env, actorId, rawPayload) {
  const actor = requireActor(state, actorId);
  if ("code" in actor) return reject(actor, state);
  const dmCheck = requireDm(actor);
  if (dmCheck) return reject(dmCheck, state);
  const parsed = parseInput(moveGroupInputSchema, rawPayload);
  if (!parsed.ok) return reject(parsed.rejection, state);
  const scene = requireScene(state, parsed.data.sceneId);
  if ("code" in scene) return reject(scene, state);
  const matched = scene.widgets.filter((w) => w.layout.groupId === parsed.data.groupId);
  if (matched.length === 0) {
    return reject(
      { code: "invalid-state", message: `Group ${parsed.data.groupId} contains no widgets.` },
      state
    );
  }
  const newWidgets = scene.widgets.map(
    (widget) => widget.layout.groupId === parsed.data.groupId ? {
      ...widget,
      layout: {
        ...widget.layout,
        x: widget.layout.x + parsed.data.deltaX,
        y: widget.layout.y + parsed.data.deltaY
      }
    } : widget
  );
  const nextScene = bumpRevision({ ...scene, widgets: newWidgets }, env);
  const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);
  const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
    entityType: "scene",
    entityId: scene.id,
    opType: "scene.move-group",
    path: `groups/${parsed.data.groupId}/position`,
    value: { deltaX: parsed.data.deltaX, deltaY: parsed.data.deltaY },
    beforeRevision: scene.ownership.revision,
    afterRevision: nextScene.ownership.revision
  });
  return {
    status: "accepted",
    nextState: { ...state, scenes: nextSceneState, sync: nextLog },
    events: matched.map((widget) => ({
      kind: "scene.widget-layout-changed",
      sceneId: scene.id,
      widgetInstanceId: widget.id,
      actorId: actor.id,
      field: "position"
    })),
    operationIds: [op.id]
  };
}
function handleDestroyWidget(state, env, actorId, rawPayload) {
  const actor = requireActor(state, actorId);
  if ("code" in actor) return reject(actor, state);
  const dmCheck = requireDm(actor);
  if (dmCheck) return reject(dmCheck, state);
  const parsed = parseInput(destroyWidgetInputSchema, rawPayload);
  if (!parsed.ok) return reject(parsed.rejection, state);
  const scene = requireScene(state, parsed.data.sceneId);
  if ("code" in scene) return reject(scene, state);
  const widget = findWidget(scene, parsed.data.widgetInstanceId);
  if (!widget) {
    return reject(
      {
        code: "widget-not-found",
        message: `Widget ${parsed.data.widgetInstanceId} not found on Scene ${scene.id}.`
      },
      state
    );
  }
  const newSections = scene.sections.map((section) => ({
    ...section,
    widgetInstanceIds: section.widgetInstanceIds.filter((id) => id !== widget.id)
  }));
  const nextScene = bumpRevision(
    {
      ...scene,
      widgets: scene.widgets.filter((w) => w.id !== widget.id),
      sections: newSections
    },
    env
  );
  const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);
  const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
    entityType: "scene",
    entityId: scene.id,
    opType: "scene.destroy-widget",
    path: `widgets/${widget.id}`,
    beforeRevision: scene.ownership.revision,
    afterRevision: nextScene.ownership.revision
  });
  return {
    status: "accepted",
    nextState: { ...state, scenes: nextSceneState, sync: nextLog },
    events: [
      {
        kind: "scene.widget-destroyed",
        sceneId: scene.id,
        widgetInstanceId: widget.id,
        actorId: actor.id
      }
    ],
    operationIds: [op.id]
  };
}
function dispatchCommand(state, env, command) {
  switch (command.type) {
    case "scene.create":
      return handleCreateScene(state, env, command.actorId, command.payload);
    case "scene.update-metadata":
      return handleUpdateSceneMetadata(state, env, command.actorId, command.payload);
    case "scene.set-sections":
      return handleSetSceneSections(state, env, command.actorId, command.payload);
    case "scene.save-template":
      return handleSaveSceneTemplate(state, env, command.actorId, command.payload);
    case "scene.instantiate-template":
      return handleInstantiateSceneTemplate(state, env, command.actorId, command.payload);
    case "scene.add-widget":
      return handleAddWidget(state, env, command.actorId, command.payload);
    case "scene.move-widget":
      return handleMoveWidget(state, env, command.actorId, command.payload);
    case "scene.resize-widget":
      return handleResizeWidget(state, env, command.actorId, command.payload);
    case "scene.layer-widget":
      return handleLayerWidget(state, env, command.actorId, command.payload);
    case "scene.group-widgets":
      return handleGroupWidgets(state, env, command.actorId, command.payload);
    case "scene.move-group":
      return handleMoveGroup(state, env, command.actorId, command.payload);
    case "scene.dock-widget":
      return handleDockWidget(state, env, command.actorId, command.payload);
    case "scene.pin-widget":
      return handlePinWidget(state, env, command.actorId, command.payload);
    case "scene.destroy-widget":
      return handleDestroyWidget(state, env, command.actorId, command.payload);
  }
}
const DB_NAME = "dndtools-v2";
const DB_VERSION = 1;
const SCENE_STATE_KEY = "scene-state";
const PERMISSION_STATE_KEY = "permission-state";
class V2Database extends Dexie {
  documents;
  operations;
  constructor() {
    super(DB_NAME);
    this.version(DB_VERSION).stores({
      documents: "&key",
      operations: "&id, sequence"
    });
  }
}
let dbInstance = null;
function db() {
  if (!dbInstance) {
    dbInstance = new V2Database();
  }
  return dbInstance;
}
async function loadCoreState() {
  const database = db();
  const [sceneDoc, permissionDoc, operationRecords] = await Promise.all([
    database.documents.get(SCENE_STATE_KEY),
    database.documents.get(PERMISSION_STATE_KEY),
    database.operations.orderBy("sequence").toArray()
  ]);
  const scenes = sceneDoc?.doc ?? {
    scenes: {},
    schemaVersion: EMPTY_SCENE_STATE.schemaVersion
  };
  const permissions = permissionDoc?.doc ?? {
    actors: {},
    grants: [],
    schemaVersion: EMPTY_PERMISSION_STATE.schemaVersion
  };
  const sync = {
    operations: operationRecords.map((r) => r.op)
  };
  return { scenes, permissions, sync };
}
async function persistSceneState(scenes) {
  await db().documents.put({ key: SCENE_STATE_KEY, doc: scenes });
}
async function persistPermissionState(permissions) {
  await db().documents.put({ key: PERMISSION_STATE_KEY, doc: permissions });
}
async function appendOperations(operations) {
  if (operations.length === 0) return;
  const database = db();
  const existing = await database.operations.count();
  const records = operations.map((op, idx) => ({
    id: op.id,
    op,
    sequence: existing + idx
  }));
  await database.operations.bulkPut(records);
}
async function persistFullState(previous, next) {
  const newOperations = next.sync.operations.slice(previous.sync.operations.length);
  await Promise.all([
    persistSceneState(next.scenes),
    persistPermissionState(next.permissions),
    appendOperations(newOperations)
  ]);
}
function browserIdGenerator() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function browserClock() {
  return /* @__PURE__ */ (/* @__PURE__ */ new Date()).toISOString();
}
function defaultEnvironment() {
  return {
    vaultId: "local-default",
    sourceId: "local-vault",
    ids: browserIdGenerator,
    clock: browserClock
  };
}
class SceneRuntime {
  #state = {
    scenes: { scenes: {}, schemaVersion: EMPTY_SCENE_STATE.schemaVersion },
    permissions: {
      actors: {},
      grants: [],
      schemaVersion: EMPTY_PERMISSION_STATE.schemaVersion
    },
    sync: { operations: [...EMPTY_OPERATION_LOG.operations] }
  };
  #options;
  #loaded = false;
  #lastError = null;
  constructor(options) {
    this.#options = options;
  }
  get state() {
    return this.#state;
  }
  get loaded() {
    return this.#loaded;
  }
  get lastError() {
    return this.#lastError;
  }
  get defaultActorId() {
    return this.#options.defaultActorId;
  }
  async load() {
    const loaded = await loadCoreState();
    this.#state = this.#ensureDefaultActor(loaded);
    this.#loaded = true;
  }
  #ensureDefaultActor(slice) {
    const id = this.#options.defaultActorId;
    if (slice.permissions.actors[id]) return slice;
    return {
      ...slice,
      permissions: {
        ...slice.permissions,
        actors: {
          ...slice.permissions.actors,
          [id]: { id, role: "dm", displayName: "Default DM" }
        },
        schemaVersion: PERMISSION_STATE_SCHEMA_VERSION
      }
    };
  }
  async dispatch(command) {
    const before = this.#state;
    const plainBefore = before;
    const result = dispatchCommand(plainBefore, this.#options.env, command);
    if (result.status === "accepted") {
      this.#state = result.nextState;
      try {
        await persistFullState(plainBefore, result.nextState);
        this.#lastError = null;
      } catch (error) {
        this.#lastError = error instanceof Error ? error.message : String(error);
        this.#state = before;
        throw error;
      }
    } else {
      this.#lastError = result.rejection.message;
    }
    return result;
  }
}
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const { children } = $$props;
    const runtime = new SceneRuntime({ env: defaultEnvironment(), defaultActorId: "local-dm" });
    provideRuntime(runtime);
    $$renderer2.push(`<header class="app-header"><h1>DND Tools v2</h1> <p class="tagline">Scene-first command platform — local prototype</p> <nav><a href="./" data-testid="nav-scenes">Scenes</a></nav></header> <main class="app-main">`);
    if (!runtime.loaded) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="loading" role="status">Loading local Scene store…</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
      children?.($$renderer2);
      $$renderer2.push(`<!---->`);
    }
    $$renderer2.push(`<!--]--> `);
    if (runtime.lastError) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="error" role="alert">${escape_html(runtime.lastError)}</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></main>`);
  });
}
export {
  _layout as default
};
