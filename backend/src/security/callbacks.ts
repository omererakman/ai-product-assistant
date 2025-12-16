import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import {
  validateOutput,
  moderateContent,
  GuardrailConfig,
  DEFAULT_CONFIG,
} from "./guardrails.js";
import { logger } from "../logger.js";

export class GuardrailsCallbackHandler extends BaseCallbackHandler {
  name = "guardrails_callback";
  private config: GuardrailConfig;

  constructor(config: GuardrailConfig = DEFAULT_CONFIG) {
    super();
    this.config = config;
  }

  async handleLLMStart(_llm: unknown, _prompts: string[]): Promise<void> {
    // Skip validation in handleLLMStart - prompts here are the final templates
    // that include system instructions. User input validation should happen
    // earlier in the middleware layer before being inserted into templates.
    // Validating the final prompt would cause false positives on legitimate
    // system instructions.
    return;
  }

  async handleLLMEnd(output: unknown): Promise<void> {
    const text = this.extractTextFromOutput(output);
    if (!text) {
      return;
    }

    const validation = validateOutput(text, this.config);
    if (!validation.isValid) {
      logger.error(
        {
          errors: validation.errors,
          callback: this.name,
          outputLength: text.length,
        },
        "Guardrails callback: Output validation failed",
      );
    }

    if (this.config.enableContentModeration) {
      const moderation = await moderateContent(text);
      if (!moderation.isSafe) {
        logger.warn(
          {
            flaggedCategories: moderation.flaggedCategories,
            score: moderation.score,
            callback: this.name,
          },
          "Guardrails callback: Content moderation flagged output",
        );
      }
    }
  }

  async handleLLMError(err: Error): Promise<void> {
    logger.error(
      {
        error: err.message,
        callback: this.name,
      },
      "Guardrails callback: LLM call failed",
    );
  }

  private extractTextFromOutput(output: unknown): string | null {
    try {
      if (
        output &&
        typeof output === "object" &&
        "generations" in output &&
        Array.isArray(output.generations)
      ) {
        const firstGeneration = output.generations[0];
        if (
          firstGeneration &&
          Array.isArray(firstGeneration) &&
          firstGeneration[0]
        ) {
          const gen = firstGeneration[0];
          if (gen && typeof gen === "object") {
            if ("text" in gen && typeof gen.text === "string") {
              return gen.text;
            }
            if (
              "message" in gen &&
              gen.message &&
              typeof gen.message === "object" &&
              "content" in gen.message &&
              typeof gen.message.content === "string"
            ) {
              return gen.message.content;
            }
          }
          if (typeof gen === "string") {
            return gen;
          }
        }
      }

      if (
        output &&
        typeof output === "object" &&
        "content" in output &&
        typeof output.content === "string"
      ) {
        return output.content;
      }

      if (typeof output === "string") {
        return output;
      }

      return null;
    } catch (error) {
      logger.warn(
        { error, callback: this.name },
        "Failed to extract text from LLM output",
      );
      return null;
    }
  }
}
