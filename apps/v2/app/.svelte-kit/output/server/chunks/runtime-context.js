import { s as setContext, g as getContext } from "./context.js";
import "clsx";
import { z } from "zod";
import "dexie";
const SCENE_STATE_SCHEMA_VERSION = 1;
const SCENE_SCHEMA_VERSION = 1;
const EMPTY_SCENE_STATE = Object.freeze({
  scenes: {},
  schemaVersion: SCENE_STATE_SCHEMA_VERSION
});
const idSchema$1 = z.string().min(1);
const actorIdSchema = idSchema$1;
const isoTimestamp = z.string().min(1);
const sceneVisibilitySchema = z.enum(["dm-only", "shared", "player-visible"]);
const sceneBackgroundSchema = z.enum(["paper", "parchment", "dark", "grid"]);
const widgetDockSchema = z.union([z.literal(null), z.enum(["left", "right", "top", "bottom"])]);
const widgetBindingSchema = z.object({
  source: z.object({
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    selector: z.string().min(1).optional()
  }).strict(),
  mode: z.enum(["read", "operate", "manage", "observe"]),
  requiredCapability: z.enum(["manager", "operator", "viewer"])
}).strict();
const widgetLayoutSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().positive(),
  h: z.number().finite().positive(),
  z: z.number().int(),
  groupId: z.union([z.literal(null), idSchema$1]),
  dock: widgetDockSchema,
  pinned: z.boolean(),
  focusOrder: z.union([z.literal(null), z.number().int().nonnegative()])
}).strict();
const widgetInstanceSchema = z.object({
  id: idSchema$1,
  type: z.string().min(1),
  version: z.string().min(1),
  layout: widgetLayoutSchema,
  configuration: z.record(z.string(), z.unknown()),
  binding: z.union([z.literal(null), widgetBindingSchema])
}).strict();
const sectionLayoutRegionSchema = z.object({
  id: idSchema$1,
  name: z.string().min(1),
  bounds: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    w: z.number().finite().positive(),
    h: z.number().finite().positive()
  }).strict(),
  widgetInstanceIds: z.array(idSchema$1)
}).strict();
const playerViewAssignmentSchema = z.object({
  playerActorId: actorIdSchema,
  sectionIds: z.union([z.literal(null), z.array(idSchema$1).min(1)])
}).strict();
const sceneTemplateMetaSchema = z.object({
  isTemplate: z.boolean(),
  instantiatedFromTemplateSceneId: z.union([z.literal(null), idSchema$1])
}).strict();
const sceneOwnershipSchema = z.object({
  ownerActorId: actorIdSchema,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  revision: z.number().int().nonnegative()
}).strict();
const sceneVisualSettingsSchema = z.object({
  background: sceneBackgroundSchema,
  accentColor: z.string().min(1).optional()
}).strict();
const sceneSchema = z.object({
  id: idSchema$1,
  name: z.string().min(1, "Scene name is required"),
  description: z.string(),
  tags: z.array(z.string().min(1)),
  visibility: sceneVisibilitySchema,
  visualSettings: sceneVisualSettingsSchema,
  ownership: sceneOwnershipSchema,
  sharingTargets: z.array(actorIdSchema),
  playerViewAssignments: z.array(playerViewAssignmentSchema),
  templateMeta: sceneTemplateMetaSchema,
  sections: z.array(sectionLayoutRegionSchema),
  widgets: z.array(widgetInstanceSchema),
  schemaVersion: z.literal(SCENE_SCHEMA_VERSION)
}).strict();
z.object({
  scenes: z.record(idSchema$1, sceneSchema),
  schemaVersion: z.literal(SCENE_STATE_SCHEMA_VERSION)
}).strict();
const idSchema = z.string().min(1);
const createSceneInputSchema = z.object({
  name: z.string().min(1, "Scene name is required"),
  description: z.string().default(""),
  tags: z.array(z.string().min(1)).default([]),
  visibility: sceneVisibilitySchema.default("dm-only"),
  visualSettings: z.object({
    background: sceneBackgroundSchema.default("paper"),
    accentColor: z.string().min(1).optional()
  }).strict().default({ background: "paper" }),
  sharingTargets: z.array(idSchema).default([]),
  playerViewAssignments: z.array(playerViewAssignmentSchema).default([]),
  asTemplate: z.boolean().default(false)
}).strict();
const updateSceneMetadataInputSchema = z.object({
  sceneId: idSchema,
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
  visibility: sceneVisibilitySchema.optional(),
  visualSettings: z.object({
    background: sceneBackgroundSchema.optional(),
    accentColor: z.string().min(1).optional()
  }).strict().optional(),
  sharingTargets: z.array(idSchema).optional(),
  playerViewAssignments: z.array(playerViewAssignmentSchema).optional()
}).strict();
const setSceneSectionsInputSchema = z.object({
  sceneId: idSchema,
  sections: z.array(sectionLayoutRegionSchema)
}).strict();
const saveSceneTemplateInputSchema = z.object({
  sourceSceneId: idSchema,
  templateName: z.string().min(1)
}).strict();
const instantiateSceneTemplateInputSchema = z.object({
  templateSceneId: idSchema,
  newSceneName: z.string().min(1)
}).strict();
const addWidgetInputSchema = z.object({
  sceneId: idSchema,
  widget: z.object({
    type: z.string().min(1),
    version: z.string().min(1),
    layout: z.object({
      x: z.number().finite(),
      y: z.number().finite(),
      w: z.number().finite().positive(),
      h: z.number().finite().positive()
    }).strict(),
    configuration: z.record(z.string(), z.unknown()).default({}),
    binding: z.union([z.literal(null), widgetBindingSchema]).default(null),
    sectionId: idSchema.optional()
  }).strict()
}).strict();
const moveWidgetInputSchema = z.object({
  sceneId: idSchema,
  widgetInstanceId: idSchema,
  x: z.number().finite(),
  y: z.number().finite()
}).strict();
const resizeWidgetInputSchema = z.object({
  sceneId: idSchema,
  widgetInstanceId: idSchema,
  w: z.number().finite().positive(),
  h: z.number().finite().positive()
}).strict();
const layerWidgetInputSchema = z.object({
  sceneId: idSchema,
  widgetInstanceId: idSchema,
  z: z.number().int()
}).strict();
const groupWidgetsInputSchema = z.object({
  sceneId: idSchema,
  widgetInstanceIds: z.array(idSchema).min(2)
}).strict();
const dockWidgetInputSchema = z.object({
  sceneId: idSchema,
  widgetInstanceId: idSchema,
  dock: widgetDockSchema
}).strict();
const pinWidgetInputSchema = z.object({
  sceneId: idSchema,
  widgetInstanceId: idSchema,
  pinned: z.boolean()
}).strict();
const destroyWidgetInputSchema = z.object({
  sceneId: idSchema,
  widgetInstanceId: idSchema
}).strict();
const moveGroupInputSchema = z.object({
  sceneId: idSchema,
  groupId: idSchema,
  deltaX: z.number().finite(),
  deltaY: z.number().finite()
}).strict();
const KEY = /* @__PURE__ */ Symbol("dndtools:v2:scene-runtime");
function provideRuntime(runtime) {
  setContext(KEY, runtime);
  return runtime;
}
function useRuntime() {
  const runtime = getContext(KEY);
  if (!runtime) {
    throw new Error("SceneRuntime context is missing; mount inside the root layout.");
  }
  return runtime;
}
export {
  EMPTY_SCENE_STATE as E,
  SCENE_SCHEMA_VERSION as S,
  setSceneSectionsInputSchema as a,
  dockWidgetInputSchema as b,
  createSceneInputSchema as c,
  destroyWidgetInputSchema as d,
  moveWidgetInputSchema as e,
  addWidgetInputSchema as f,
  groupWidgetsInputSchema as g,
  provideRuntime as h,
  instantiateSceneTemplateInputSchema as i,
  useRuntime as j,
  layerWidgetInputSchema as l,
  moveGroupInputSchema as m,
  pinWidgetInputSchema as p,
  resizeWidgetInputSchema as r,
  saveSceneTemplateInputSchema as s,
  updateSceneMetadataInputSchema as u
};
