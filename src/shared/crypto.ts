/**
 * Cryptography Utilities
 *
 * AES-256-GCM authenticated encryption for sensitive data at rest.
 * Uses Node.js crypto module with no external dependencies.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypted data structure with initialization vector and authentication tag.
 */
export interface EncryptedData {
  /** Base64-encoded ciphertext */
  readonly ciphertext: string;
  /** Base64-encoded initialization vector */
  readonly iv: string;
  /** Base64-encoded authentication tag */
  readonly authTag: string;
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Encrypt plaintext using AES-256-GCM.
 *
 * AES-256-GCM provides:
 * - Confidentiality through encryption
 * - Integrity and authenticity through the authentication tag
 * - Protection against tampering
 *
 * @param plaintext - Data to encrypt
 * @param key - 32-byte (256-bit) encryption key
 * @returns Encrypted data with IV and auth tag
 * @throws Error if key is not 32 bytes or encryption fails
 */
export function encrypt(plaintext: string, key: Buffer): EncryptedData {
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (256 bits)");
  }

  if (!plaintext) {
    throw new Error("Plaintext cannot be empty");
  }

  // Generate random IV for each encryption operation
  // WHY: Using a unique IV for each encryption is critical for GCM security
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  // Encrypt the plaintext
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  // Get the authentication tag
  // WHY: The auth tag ensures data integrity and authenticity
  const authTag = cipher.getAuthTag();

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: ${authTag.length}`);
  }

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 *
 * Verifies the authentication tag to ensure data has not been tampered with.
 *
 * @param ciphertext - Base64-encoded encrypted data
 * @param iv - Base64-encoded initialization vector
 * @param authTag - Base64-encoded authentication tag
 * @param key - 32-byte (256-bit) encryption key
 * @returns Decrypted plaintext
 * @throws Error if decryption fails or authentication tag is invalid
 */
export function decrypt(ciphertext: string, iv: string, authTag: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (256 bits)");
  }

  if (!ciphertext || !iv || !authTag) {
    throw new Error("Ciphertext, IV, and auth tag are required");
  }

  try {
    const ivBuffer = Buffer.from(iv, "base64");
    const authTagBuffer = Buffer.from(authTag, "base64");
    const ciphertextBuffer = Buffer.from(ciphertext, "base64");

    if (ivBuffer.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: ${ivBuffer.length}`);
    }

    if (authTagBuffer.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: ${authTagBuffer.length}`);
    }

    const decipher = createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);

    const decrypted = Buffer.concat([
      decipher.update(ciphertextBuffer),
      decipher.final(), // This will throw if auth tag verification fails
    ]);

    return decrypted.toString("utf8");
  } catch (error) {
    // WHY: Provide clear error message while hiding implementation details
    if (error instanceof Error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
    throw new Error("Decryption failed");
  }
}

/**
 * Check if data appears to be encrypted (has the structure of EncryptedData).
 *
 * @param data - String to check
 * @returns True if data appears to be in encrypted format
 */
export function isEncrypted(data: string): boolean {
  try {
    const parsed = JSON.parse(data);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.ciphertext === "string" &&
      typeof parsed.iv === "string" &&
      typeof parsed.authTag === "string"
    );
  } catch {
    return false;
  }
}
