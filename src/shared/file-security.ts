/**
 * File Security Utilities
 *
 * WHY: Secure database and cache files by setting restrictive permissions.
 * Only the owner should have access to sensitive data files.
 *
 * Permissions:
 * - Directories: 0700 (owner: rwx, group: ---, others: ---)
 * - Files: 0600 (owner: rw-, group: ---, others: ---)
 *
 * IMPORTANT: chmod is a no-op on Windows, so we check platform first.
 */

import { chmod } from "node:fs/promises";
import { chmodSync } from "node:fs";
import { createLogger } from "./logger.js";

const logger = createLogger("FileSecurity");

/**
 * Check if the current platform supports Unix-style permissions.
 * WHY: Windows doesn't support chmod, so we skip permission setting on Windows.
 */
function isUnixPlatform(): boolean {
  return process.platform !== "win32";
}

/**
 * Set secure permissions on a file (async).
 * File permissions: 0600 (owner read/write only)
 *
 * @param filePath - Absolute path to the file
 * @returns true if permissions were set, false if skipped or failed
 */
export async function setSecureFilePermissions(filePath: string): Promise<boolean> {
  if (!isUnixPlatform()) {
    logger.debug("Skipping file permissions on Windows", { path: filePath });
    return false;
  }

  try {
    await chmod(filePath, 0o600);
    logger.debug("Set secure file permissions (0600)", { path: filePath });
    return true;
  } catch (error) {
    logger.warn("Failed to set file permissions", { path: filePath, error });
    return false;
  }
}

/**
 * Set secure permissions on a file (sync).
 * File permissions: 0600 (owner read/write only)
 *
 * @param filePath - Absolute path to the file
 * @returns true if permissions were set, false if skipped or failed
 */
export function setSecureFilePermissionsSync(filePath: string): boolean {
  if (!isUnixPlatform()) {
    logger.debug("Skipping file permissions on Windows", { path: filePath });
    return false;
  }

  try {
    chmodSync(filePath, 0o600);
    logger.debug("Set secure file permissions (0600)", { path: filePath });
    return true;
  } catch (error) {
    logger.warn("Failed to set file permissions", { path: filePath, error });
    return false;
  }
}

/**
 * Set secure permissions on a directory (async).
 * Directory permissions: 0700 (owner read/write/execute only)
 *
 * @param dirPath - Absolute path to the directory
 * @returns true if permissions were set, false if skipped or failed
 */
export async function setSecureDirectoryPermissions(dirPath: string): Promise<boolean> {
  if (!isUnixPlatform()) {
    logger.debug("Skipping directory permissions on Windows", { path: dirPath });
    return false;
  }

  try {
    await chmod(dirPath, 0o700);
    logger.debug("Set secure directory permissions (0700)", { path: dirPath });
    return true;
  } catch (error) {
    logger.warn("Failed to set directory permissions", { path: dirPath, error });
    return false;
  }
}

/**
 * Set secure permissions on a directory (sync).
 * Directory permissions: 0700 (owner read/write/execute only)
 *
 * @param dirPath - Absolute path to the directory
 * @returns true if permissions were set, false if skipped or failed
 */
export function setSecureDirectoryPermissionsSync(dirPath: string): boolean {
  if (!isUnixPlatform()) {
    logger.debug("Skipping directory permissions on Windows", { path: dirPath });
    return false;
  }

  try {
    chmodSync(dirPath, 0o700);
    logger.debug("Set secure directory permissions (0700)", { path: dirPath });
    return true;
  } catch (error) {
    logger.warn("Failed to set directory permissions", { path: dirPath, error });
    return false;
  }
}
