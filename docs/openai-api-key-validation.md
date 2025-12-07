# OpenAI API Key Validation

## Overview

The mouse-mcp project includes built-in validation for OpenAI API keys to provide early error detection and secure handling of sensitive credentials.

## Features

### 1. Format Validation

OpenAI API keys MUST:

- Start with `sk-` prefix (standard keys or project-scoped keys like `sk-proj-`)
- Be at least 20 characters long
- Be non-empty

### 2. Key Masking for Logs

API keys are automatically masked in logs to prevent credential exposure:

- Shows first 3 characters and last 4 characters
- Masks the middle with `...`
- Example: `sk-1234567890abcdef1234567890abcdef` becomes `sk-...cdef`

### 3. Early Validation

Validation occurs at two points:

1. **Config Load Time**: When `getConfig()` is called, the `OPENAI_API_KEY` environment variable is validated if provided
2. **Provider Initialization**: When `OpenAIEmbeddingProvider` is instantiated, the API key is validated

## Usage

### Basic Validation

```typescript
import { validateOpenAIKey, maskApiKey } from './config/validation.js';

// Validate a key (throws on invalid format)
validateOpenAIKey('sk-1234567890abcdef1234567890abcdef');

// Mask a key for logging
const masked = maskApiKey('sk-1234567890abcdef1234567890abcdef');
console.log(`Using API key: ${masked}`); // Using API key: sk-...cdef
```

### Optional Validation

```typescript
import { validateOpenAIKeyIfProvided } from './config/validation.js';

// Only validates if key is provided (undefined is OK)
validateOpenAIKeyIfProvided(process.env.OPENAI_API_KEY);
```

### Provider Initialization

```typescript
import { OpenAIEmbeddingProvider } from './embeddings/openai.js';

// Validation happens automatically in constructor
const provider = new OpenAIEmbeddingProvider(apiKey);
// Throws descriptive error if key format is invalid
```

## Error Messages

### Invalid Prefix

```text
Invalid OpenAI API key format: must start with "sk-" (got: inv...rmat)
```

### Key Too Short

```text
Invalid OpenAI API key: key is too short (got 8 characters)
```

### Empty Key

```text
OpenAI API key is empty
```

### Config Load Error

```text
Invalid OPENAI_API_KEY environment variable: Invalid OpenAI API key format: must start with "sk-" (got: inv...rmat)
```

## Behavior

### No Key Provided

When no OpenAI API key is provided:

- **Config loads successfully** - No error is thrown
- **Provider falls back to Transformers.js** - Local embeddings are used instead
- **Explicit OpenAI provider requested** - Error is thrown with clear message

### Invalid Key Provided

When an invalid OpenAI API key is provided:

- **Config load fails** - Throws error immediately with masked key in message
- **Provider initialization fails** - Throws error in constructor
- **Application startup prevented** - Fail-fast behavior with clear error message

## Security

### Key Masking

Keys are ALWAYS masked in:

- Debug logs
- Error messages
- Validation output

### No Silent Failures

- Invalid keys are NEVER silently ignored
- Errors are thrown with descriptive messages
- Format issues are caught before API calls

## Implementation Details

### Circular Dependency Prevention

The validation module (`config/validation.ts`) intentionally does NOT use the logger to avoid circular dependencies:

```
config → logger → config (CIRCULAR!)
```

Instead:

- Validation throws errors
- Callers log masked keys if needed
- Separation of concerns maintained

### Validation Functions

```typescript
// Core validation (throws on invalid)
export function validateOpenAIKey(apiKey: string): void

// Safe masking for logs
export function maskApiKey(apiKey: string): string

// Conditional validation (undefined OK)
export function validateOpenAIKeyIfProvided(apiKey: string | undefined): void
```

## Testing

Run the validation test suite:

```bash
node test-validation.js
```

This tests:

- Valid standard keys
- Valid project-scoped keys
- Invalid prefixes
- Short keys
- Empty keys
- Key masking
- Optional validation

## Environment Variables

```bash
# Valid OpenAI API key (optional)
OPENAI_API_KEY=sk-1234567890abcdef1234567890abcdef

# If not provided, falls back to Transformers.js
# If invalid format, application fails to start with clear error
```

## Related Files

- `/src/config/validation.ts` - Validation and masking utilities
- `/src/config/index.ts` - Config loading with validation
- `/src/embeddings/openai.ts` - OpenAI provider with validation
- `/src/embeddings/index.ts` - Provider factory with fallback logic
- `/test-validation.js` - Validation test suite
