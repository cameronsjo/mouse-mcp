/**
 * Session Persistence
 *
 * SQLite storage for Playwright session data.
 */

import { getDatabase, persistDatabase } from "./database.js";
import { createLogger } from "../shared/logger.js";
import type { DisneySession, DestinationId } from "../types/index.js";

const logger = createLogger("Sessions");

/**
 * Load a session for a destination.
 */
export async function loadSession(destination: DestinationId): Promise<DisneySession | null> {
  const db = await getDatabase();

  const result = db.exec(
    `SELECT destination, state, cookies, tokens, created_at, refreshed_at,
            expires_at, error_count, last_error
     FROM sessions
     WHERE destination = ?`,
    [destination]
  );

  const firstResult = result[0];
  if (!firstResult || firstResult.values.length === 0) {
    logger.debug("No session found", { destination });
    return null;
  }

  const row = firstResult.values[0];
  if (!row) {
    logger.debug("No session found", { destination });
    return null;
  }

  try {
    const session: DisneySession = {
      destination: String(row[0]) as DestinationId,
      state: String(row[1]) as DisneySession["state"],
      cookies: JSON.parse(String(row[2])) as DisneySession["cookies"],
      tokens: JSON.parse(String(row[3])) as DisneySession["tokens"],
      createdAt: String(row[4]),
      refreshedAt: String(row[5]),
      expiresAt: String(row[6]),
      errorCount: Number(row[7]),
      lastError: row[8] != null ? String(row[8]) : undefined,
    };

    logger.debug("Loaded session", { destination, state: session.state });
    return session;
  } catch (error) {
    logger.warn("Failed to parse session data", { destination, error });
    return null;
  }
}

/**
 * Load all sessions.
 */
export async function loadAllSessions(): Promise<DisneySession[]> {
  const db = await getDatabase();

  const result = db.exec(
    `SELECT destination, state, cookies, tokens, created_at, refreshed_at,
            expires_at, error_count, last_error
     FROM sessions`
  );

  const firstResult = result[0];
  if (!firstResult) {
    return [];
  }

  const sessions: DisneySession[] = [];

  for (const row of firstResult.values) {
    if (!row) continue;
    try {
      sessions.push({
        destination: String(row[0]) as DestinationId,
        state: String(row[1]) as DisneySession["state"],
        cookies: JSON.parse(String(row[2])) as DisneySession["cookies"],
        tokens: JSON.parse(String(row[3])) as DisneySession["tokens"],
        createdAt: String(row[4]),
        refreshedAt: String(row[5]),
        expiresAt: String(row[6]),
        errorCount: Number(row[7]),
        lastError: row[8] != null ? String(row[8]) : undefined,
      });
    } catch (error) {
      logger.warn("Failed to parse session", { destination: row[0], error });
    }
  }

  logger.debug("Loaded sessions", { count: sessions.length });
  return sessions;
}

/**
 * Save a session (insert or update).
 */
export async function saveSession(session: DisneySession): Promise<void> {
  const db = await getDatabase();

  db.run(
    `INSERT OR REPLACE INTO sessions
     (destination, state, cookies, tokens, created_at, refreshed_at,
      expires_at, error_count, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.destination,
      session.state,
      JSON.stringify(session.cookies),
      JSON.stringify(session.tokens),
      session.createdAt,
      session.refreshedAt,
      session.expiresAt,
      session.errorCount,
      session.lastError ?? null,
    ]
  );

  persistDatabase();
  logger.debug("Saved session", { destination: session.destination, state: session.state });
}

/**
 * Delete a session.
 */
export async function deleteSession(destination: DestinationId): Promise<boolean> {
  const db = await getDatabase();

  const check = db.exec("SELECT 1 FROM sessions WHERE destination = ?", [destination]);
  const checkResult = check[0];
  if (!checkResult || checkResult.values.length === 0) {
    return false;
  }

  db.run("DELETE FROM sessions WHERE destination = ?", [destination]);
  persistDatabase();

  logger.info("Deleted session", { destination });
  return true;
}

/**
 * Update session error tracking.
 */
export async function updateSessionError(destination: DestinationId, error: string): Promise<void> {
  const db = await getDatabase();

  db.run(
    `UPDATE sessions
     SET error_count = error_count + 1,
         last_error = ?,
         state = CASE WHEN error_count >= 2 THEN 'error' ELSE state END
     WHERE destination = ?`,
    [error, destination]
  );

  persistDatabase();
  logger.debug("Updated session error", { destination, error });
}

/**
 * Reset session error tracking after successful request.
 */
export async function resetSessionErrors(destination: DestinationId): Promise<void> {
  const db = await getDatabase();

  db.run(
    `UPDATE sessions
     SET error_count = 0,
         last_error = NULL,
         state = 'active'
     WHERE destination = ?`,
    [destination]
  );

  persistDatabase();
}

/**
 * Check if a session is expired or expiring soon.
 */
export function isSessionExpired(session: DisneySession, bufferMinutes = 60): boolean {
  const now = Date.now();
  const expiresAt = new Date(session.expiresAt).getTime();
  const bufferMs = bufferMinutes * 60 * 1000;

  return expiresAt - now <= bufferMs;
}
