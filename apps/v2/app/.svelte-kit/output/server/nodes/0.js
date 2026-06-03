

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const universal = {
  "ssr": false,
  "prerender": true,
  "trailingSlash": "always"
};
export const universal_id = "src/routes/+layout.ts";
export const imports = ["_app/immutable/nodes/0.BCtipDtL.js","_app/immutable/chunks/BQ87FemI.js","_app/immutable/chunks/CdN2eTVU.js","_app/immutable/chunks/BSGLOMyi.js","_app/immutable/chunks/CYth3mkf.js","_app/immutable/chunks/IEf04mpa.js"];
export const stylesheets = ["_app/immutable/assets/0.CxaKakXH.css"];
export const fonts = [];
