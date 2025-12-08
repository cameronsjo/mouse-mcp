/**
 * MCP Prompt Type Definitions
 *
 * Types for MCP prompts per the 2025-11-25 specification.
 */

/**
 * A prompt argument that can be templated.
 */
export interface PromptArgument {
  /** The name of the argument */
  readonly name: string;
  /** Human-readable description */
  readonly description?: string;
  /** Whether this argument is required */
  readonly required?: boolean;
}

/**
 * A prompt definition.
 */
export interface PromptDefinition {
  /** Unique name for the prompt */
  readonly name: string;
  /** Human-readable description */
  readonly description?: string;
  /** Arguments that can be templated */
  readonly arguments?: readonly PromptArgument[];
}

/**
 * A message in a prompt response.
 */
export interface PromptMessage {
  /** Role: user or assistant */
  readonly role: "user" | "assistant";
  /** Content of the message */
  readonly content: PromptContent;
}

/**
 * Content types for prompt messages.
 */
export type PromptContent = TextContent | ImageContent | EmbeddedResource;

/**
 * Text content in a prompt message.
 */
export interface TextContent {
  readonly type: "text";
  readonly text: string;
}

/**
 * Image content in a prompt message.
 */
export interface ImageContent {
  readonly type: "image";
  readonly data: string;
  readonly mimeType: string;
}

/**
 * Embedded resource in a prompt message.
 */
export interface EmbeddedResource {
  readonly type: "resource";
  readonly resource: {
    readonly uri: string;
    readonly mimeType?: string;
    readonly text?: string;
  };
}

/**
 * Result of getting a prompt.
 */
export interface GetPromptResult {
  /** Optional description */
  readonly description?: string;
  /** The prompt messages */
  readonly messages: readonly PromptMessage[];
}

/**
 * Handler function for getting a prompt.
 */
export type PromptHandler = (
  args: Record<string, string>
) => GetPromptResult | Promise<GetPromptResult>;

/**
 * A registered prompt with definition and handler.
 */
export interface RegisteredPrompt {
  readonly definition: PromptDefinition;
  readonly handler: PromptHandler;
}
