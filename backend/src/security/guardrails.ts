import { OpenAI } from "openai";
import { BaseOutputParser } from "@langchain/core/output_parsers";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { OutputFixingParser } from "@langchain/classic/output_parsers";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { getConfig } from "../config/env.js";
import { logger } from "../logger.js";

export interface GuardrailConfig {
  maxInputLength: number;
  maxOutputLength: number;
  enablePromptInjectionDetection: boolean;
  enableContentModeration: boolean;
  enablePIIDetection: boolean;
  allowedDomains?: string[];
  blockedPatterns?: RegExp[];
}

export const DEFAULT_CONFIG: GuardrailConfig = {
  maxInputLength: 5000,
  maxOutputLength: 10000,
  enablePromptInjectionDetection: true,
  enableContentModeration: true,
  enablePIIDetection: true,
  blockedPatterns: [
    /ignore\s+(previous|above|all)\s+(instructions|prompts?|rules?)/i,
    /forget\s+(previous|above|all)\s+(instructions|prompts?|rules?)/i,
    /you\s+are\s+now\s+(a|an)\s+/i,
    /system\s*:\s*(you|respond|act|behave)/i,
    /\[system\]/i,
    /<\|system\|>/i,
    /override\s+(system|instructions|prompt)/i,
    /new\s+instructions?\s*:/i,
    /disregard\s+(previous|above|all)/i,
    /jailbreak/i,
    /roleplay/i,
    /pretend\s+you\s+are/i,
  ],
};

export function detectPromptInjection(
  input: string,
  config: GuardrailConfig = DEFAULT_CONFIG,
): { isInjection: boolean; detectedPatterns: string[] } {
  if (!config.enablePromptInjectionDetection) {
    return { isInjection: false, detectedPatterns: [] };
  }

  const detectedPatterns: string[] = [];
  const patterns =
    config.blockedPatterns || DEFAULT_CONFIG.blockedPatterns || [];

  for (const pattern of patterns) {
    if (pattern.test(input)) {
      detectedPatterns.push(pattern.source);
    }
  }

  const suspiciousIndicators = [
    (input.match(/[<>[\]{}|]/g) || []).length > 10,
    (input.match(/\n{3,}/g) || []).length > 0,
    input.toLowerCase().includes("system:") &&
      input.toLowerCase().includes("respond"),
  ];

  if (suspiciousIndicators.some(Boolean)) {
    detectedPatterns.push("suspicious_formatting");
  }

  return {
    isInjection: detectedPatterns.length > 0,
    detectedPatterns,
  };
}

export function sanitizeInput(
  input: string,
  config: GuardrailConfig = DEFAULT_CONFIG,
): { sanitized: string; warnings: string[] } {
  const warnings: string[] = [];

  if (input.length > config.maxInputLength) {
    warnings.push(
      `Input truncated from ${input.length} to ${config.maxInputLength} characters`,
    );
    input = input.substring(0, config.maxInputLength);
  }

  const injectionCheck = detectPromptInjection(input, config);
  if (injectionCheck.isInjection) {
    warnings.push(
      `Potential prompt injection detected: ${injectionCheck.detectedPatterns.join(", ")}`,
    );
    logger.warn(
      {
        input: input.substring(0, 100),
        detectedPatterns: injectionCheck.detectedPatterns,
      },
      "Prompt injection detected in user input",
    );
  }

  let sanitized = input.replace(/\n{3,}/g, "\n\n").trim();

  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");

  return { sanitized, warnings };
}

export function validateOutput(
  output: string,
  config: GuardrailConfig = DEFAULT_CONFIG,
): { isValid: boolean; sanitized: string; errors: string[] } {
  const errors: string[] = [];
  let sanitized = output;

  if (output.length > config.maxOutputLength) {
    errors.push(
      `Output exceeds maximum length of ${config.maxOutputLength} characters`,
    );
    sanitized = output.substring(0, config.maxOutputLength);
  }

  if (output.includes("\x00")) {
    errors.push("Output contains null bytes");
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/\x00/g, "");
  }

  const controlCharCount = // eslint-disable-next-line no-control-regex
    (sanitized.match(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g) || []).length;
  if (controlCharCount > 10) {
    errors.push(
      `Output contains excessive control characters: ${controlCharCount}`,
    );
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");
  }

  return {
    isValid: errors.length === 0,
    sanitized,
    errors,
  };
}

let moderationClient: OpenAI | null = null;

function getModerationClient(): OpenAI {
  if (!moderationClient) {
    const config = getConfig();
    moderationClient = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return moderationClient;
}

export async function moderateContent(text: string): Promise<{
  isSafe: boolean;
  flaggedCategories: string[];
  score: number;
}> {
  try {
    const client = getModerationClient();
    const moderation = await client.moderations.create({ input: text });
    const result = moderation.results[0];

    const flaggedCategories: string[] = [];
    let maxScore = 0;

    for (const [category, flagged] of Object.entries(result.categories)) {
      if (flagged) {
        flaggedCategories.push(category);
        const categoryScore =
          result.category_scores[
            category as keyof typeof result.category_scores
          ] || 0;
        maxScore = Math.max(maxScore, categoryScore);
      }
    }

    return {
      isSafe: !result.flagged,
      flaggedCategories,
      score: maxScore,
    };
  } catch (error) {
    logger.error(
      { error },
      "Failed to call OpenAI Moderation API, falling back to safe default",
    );
    return {
      isSafe: false,
      flaggedCategories: ["moderation_api_error"],
      score: 1.0,
    };
  }
}

export class SecureOutputParser extends BaseOutputParser<string> {
  private config: GuardrailConfig;

  lc_namespace = ["security", "guardrails"];

  constructor(config: GuardrailConfig = DEFAULT_CONFIG) {
    super();
    this.config = config;
  }

  async parse(text: string): Promise<string> {
    const validation = validateOutput(text, this.config);

    if (!validation.isValid) {
      const errorMessage = `Validation failed: ${validation.errors.join(", ")}`;
      logger.warn(
        {
          errors: validation.errors,
          outputLength: text.length,
        },
        "Output validation failed",
      );
      throw new Error(errorMessage);
    }

    if (this.config.enableContentModeration) {
      const moderation = await moderateContent(validation.sanitized);
      if (!moderation.isSafe) {
        logger.warn(
          {
            flaggedCategories: moderation.flaggedCategories,
            score: moderation.score,
          },
          "Content moderation flagged output",
        );
        return "I apologize, but I cannot provide that type of content. How can I help you with product information or orders instead?";
      }
    }

    return validation.sanitized;
  }

  getFormatInstructions(): string {
    return "Return a safe, validated response.";
  }
}

export function createSecureParserWithRetry(
  llm: BaseChatModel,
  config: GuardrailConfig = DEFAULT_CONFIG,
  _maxRetries = 3, // Kept for API compatibility
): BaseOutputParser<string> {
  const baseParser = new SecureOutputParser(config);
  return OutputFixingParser.fromLLM(llm, baseParser);
}

export function createSecureParserWithFixing(
  llm: BaseChatModel,
  config: GuardrailConfig = DEFAULT_CONFIG,
): BaseOutputParser<string> {
  const baseParser = new SecureOutputParser(config);
  return OutputFixingParser.fromLLM(llm, baseParser);
}

export function createSecureParserWithRetryAndFixing(
  llm: BaseChatModel,
  config: GuardrailConfig = DEFAULT_CONFIG,
  _maxRetries = 3, // Kept for API compatibility
): BaseOutputParser<string> {
  const baseParser = new SecureOutputParser(config);
  return OutputFixingParser.fromLLM(llm, baseParser);
}

export function createStructuredParserWithGuardrails<T extends z.ZodTypeAny>(
  schema: T,
  llm?: BaseChatModel,
  useRetryAndFixing: boolean = true,
): BaseOutputParser<z.infer<T>> {
  const baseParser = StructuredOutputParser.fromZodSchema(schema);

  if (!useRetryAndFixing || !llm) {
    return baseParser as BaseOutputParser<z.infer<T>>;
  }

  return OutputFixingParser.fromLLM(llm, baseParser) as BaseOutputParser<
    z.infer<T>
  >;
}
