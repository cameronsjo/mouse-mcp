/**
 * Secrets Management
 *
 * Key derivation and management for encrypting sensitive data at rest.
 * Uses PBKDF2 for key derivation from environment variables.
 */

import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("Secrets");

const KEY_DERIVATION_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bits for AES-256
const HASH_ALGORITHM = "sha256";

// WHY: Use a fixed application salt for consistency
// This is safe because the actual security comes from the secret key,
// not the salt. The salt prevents rainbow table attacks.
const APPLICATION_SALT = "mouse-mcp-encryption-v1";

let cachedEncryptionKey: Buffer | null = null;

/**
 * Get or generate the encryption key for session data.
 *
 * Key derivation:
 * 1. Check for MOUSE_MCP_ENCRYPTION_KEY environment variable
 * 2. If not present, generate a random key and warn user
 * 3. Derive final key using PBKDF2 with fixed salt
 *
 * WHY: PBKDF2 strengthens the key through many iterations and adds salt
 * to prevent rainbow table attacks.
 *
 * @returns 32-byte encryption key
 */
export function getEncryptionKey(): Buffer {
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }

  const envKey = process.env.MOUSE_MCP_ENCRYPTION_KEY;

  let baseKey: string;

  if (!envKey) {
    // Generate a random key for this session
    // WHY: Fail-safe behavior - allow application to run but warn user
    baseKey = randomBytes(32).toString("hex");

    logger.warn(
      "MOUSE_MCP_ENCRYPTION_KEY not set - using ephemeral key. " +
        "Session data will not be accessible after restart. " +
        "Set MOUSE_MCP_ENCRYPTION_KEY environment variable to persist encryption key."
    );
    // WHY: Don't log the key itself - that's a security risk if logs are captured
    logger.debug("Generated ephemeral encryption key for this session");
    logger.info(
      "To generate a persistent key, run: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  } else {
    baseKey = envKey;
    logger.debug("Using encryption key from MOUSE_MCP_ENCRYPTION_KEY");
  }

  // Derive key using PBKDF2
  // WHY: Even if the base key is weak, PBKDF2 strengthens it through iterations
  cachedEncryptionKey = pbkdf2Sync(
    baseKey,
    APPLICATION_SALT,
    KEY_DERIVATION_ITERATIONS,
    KEY_LENGTH,
    HASH_ALGORITHM
  );

  return cachedEncryptionKey;
}

/**
 * Reset cached encryption key (useful for testing).
 */
export function resetEncryptionKey(): void {
  cachedEncryptionKey = null;
}

/**
 * Validate that an encryption key is properly configured.
 *
 * @returns True if MOUSE_MCP_ENCRYPTION_KEY is set
 */
export function isEncryptionKeyConfigured(): boolean {
  return process.env.MOUSE_MCP_ENCRYPTION_KEY !== undefined;
}

/**
 * Generate a new random encryption key suitable for MOUSE_MCP_ENCRYPTION_KEY.
 *
 * @returns Hex-encoded random key
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString("hex");
}
