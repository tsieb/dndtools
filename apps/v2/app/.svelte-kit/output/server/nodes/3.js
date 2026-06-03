

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/scene/_id_/_page.svelte.js')).default;
export const universal = {
  "ssr": false,
  "prerender": false,
  "trailingSlash": "always",
  "load": null
};
export const universal_id = "src/routes/scene/[id]/+page.ts";
export const imports = ["_app/immutable/nodes/3.BwdR33Rf.js","_app/immutable/chunks/BQ87FemI.js","_app/immutable/chunks/CdN2eTVU.js","_app/immutable/chunks/CYth3mkf.js","_app/immutable/chunks/L4hR_yzg.js","_app/immutable/chunks/IEf04mpa.js"];
export const stylesheets = [];
export const fonts = [];
