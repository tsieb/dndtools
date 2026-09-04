/**
 * The standalone player companion app (route `/play`). `Frame.tsx` owns the shell; the sections it
 * routes to live one file each beside it. Re-exported here so `import('./screens/play')` keeps
 * working as the lazy entry point.
 */
export { PlayerView } from './Frame';
