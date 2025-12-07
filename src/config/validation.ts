/**
 * Configuration Validation Utilities
 *
 * Provides validation and masking for sensitive configuration values.
 *
 * WHY: This module intentionally does NOT use the logger to avoid
 * circular dependencies (logger needs config, config needs validation).
 * Validation errors are thrown and logged by the caller.
 */

/**
 * Validate OpenAI API key format.
 *
 * OpenAI API keys should:
 * - Start with "sk-" (standard format) or "sk-proj-" (project-scoped keys)
 * - Be non-empty after the prefix
 *
 * WHY: Fail fast with clear error if key format is wrong, preventing
 * confusing API errors later.
 *
 * @param apiKey - The API key to validate
 * @throws Error if key format is invalid
 */
export function validateOpenAIKey(apiKey: string): void {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("OpenAI API key is empty");
  }

  // Check for standard OpenAI key format
  if (!apiKey.startsWith("sk-")) {
    throw new Error(
      `Invalid OpenAI API key format: must start with "sk-" (got: ${maskApiKey(apiKey)})`
    );
  }

  // Validate minimum length (sk- + content)
  if (apiKey.length < 20) {
    throw new Error(`Invalid OpenAI API key: key is too short (got ${apiKey.length} characters)`);
  }

  // Success - no logging here to avoid circular dependency
  // Caller can log if needed
}

/**
 * Mask an API key for safe logging.
 *
 * Shows first 3 and last 4 characters, masks the rest.
 * Example: sk-...xyz123
 *
 * WHY: Allow debugging key configuration issues without exposing
 * the full key in logs.
 *
 * @param apiKey - The API key to mask
 * @returns Masked key string
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) {
    return "***";
  }

  const prefix = apiKey.slice(0, 3);
  const suffix = apiKey.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Validate OpenAI API key if provided.
 *
 * Only validates if key is provided (non-empty).
 * Caller should log masked key if needed.
 *
 * WHY: Centralize validation logic for consistent error messages.
 * No logging here to avoid circular dependency with logger/config.
 *
 * @param apiKey - The API key to validate (or undefined)
 * @throws Error if key is provided but invalid
 */
export function validateOpenAIKeyIfProvided(apiKey: string | undefined): void {
  if (!apiKey) {
    return;
  }

  validateOpenAIKey(apiKey);
}
