/**
 * Client exports
 */

export { SessionManager, getSessionManager } from "./session-manager.js";

export { ThemeParksWikiClient, getThemeParksWikiClient } from "./themeparks-wiki.js";

export { DisneyFinderClient, getDisneyFinderClient } from "./disney-finder.js";

// Browser backends for session management
export type { BrowserBackend, BrowserBackendType } from "./browser-backends/index.js";
export {
  PlaywrightBackend,
  LightpandaBackend,
  createBrowserBackend,
  createAutoBackend,
} from "./browser-backends/index.js";
