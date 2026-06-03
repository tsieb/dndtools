export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["robots.txt"]),
	mimeTypes: {".txt":"text/plain"},
	_: {
		client: {start:"_app/immutable/entry/start.Bp5b3n8A.js",app:"_app/immutable/entry/app.dmkfggwf.js",imports:["_app/immutable/entry/start.Bp5b3n8A.js","_app/immutable/chunks/BHJs8W40.js","_app/immutable/chunks/CdN2eTVU.js","_app/immutable/chunks/BSGLOMyi.js","_app/immutable/entry/app.dmkfggwf.js","_app/immutable/chunks/CdN2eTVU.js","_app/immutable/chunks/BQ87FemI.js","_app/immutable/chunks/BSGLOMyi.js","_app/immutable/chunks/CYth3mkf.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/3.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/scene/[id]",
				pattern: /^\/scene\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set(["/"]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
