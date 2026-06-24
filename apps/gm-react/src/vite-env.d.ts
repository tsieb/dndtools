/// <reference types="vite/client" />

// The design-package DS components ship as ESM JSX (untyped). Allow importing them as modules;
// they are vendored design source consumed loosely (props validated at runtime), not app code.
declare module '*.jsx';
