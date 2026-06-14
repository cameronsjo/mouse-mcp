/**
 * Temp-DB Test Fixture
 *
 * Provides isolated per-test SQLite databases for Cluster D integration tests.
 * Uses the project's own getDatabase() / closeDatabase() lifecycle so the real
 * schema is always applied — no hand-written DDL in tests.
 *
 * Usage:
 *   beforeEach(() => setupTempDb());
 *   afterEach(() => teardownTempDb());
 */

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { resetConfig } from "../../config/index.js";
import { closeDatabase } from "../database.js";

let tempDir: string | null = null;
let savedDbPath: string | undefined;

/**
 * Call in beforeEach.
 * Creates a fresh temp directory and points MOUSE_MCP_DB_PATH at a new test.db.
 * Resets the config cache and forces the next getDatabase() call to build a
 * fresh schema'd DB at that path.
 */
export function setupTempDb(): void {
  savedDbPath = process.env.MOUSE_MCP_DB_PATH;
  tempDir = mkdtempSync(join(os.tmpdir(), "mouse-mcp-test-"));
  process.env.MOUSE_MCP_DB_PATH = join(tempDir, "test.db");
  resetConfig();
  closeDatabase();
}

/**
 * Call in afterEach.
 * Closes the DB connection, removes the temp directory, and restores the
 * original MOUSE_MCP_DB_PATH (or deletes the env var if it wasn't set).
 */
export function teardownTempDb(): void {
  closeDatabase();
  if (savedDbPath !== undefined) {
    process.env.MOUSE_MCP_DB_PATH = savedDbPath;
  } else {
    delete process.env.MOUSE_MCP_DB_PATH;
  }
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
  resetConfig();
}
