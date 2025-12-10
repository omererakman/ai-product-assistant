import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { Config } from "../../config/env.js";
import { logger } from "../../logger.js";

export interface LLMOptions {
  temperature?: number;
  callbacks?: BaseCallbackHandler[];
}

export function createOpenAILLM(
  config: Config,
  options?: LLMOptions & { streaming?: boolean },
): BaseChatModel {
  if (!config.openaiApiKey) {
    throw new Error("OpenAI API key is required");
  }

  const llm = new ChatOpenAI({
    openAIApiKey: config.openaiApiKey,
    modelName: config.llmModel,
    temperature: options?.temperature ?? 0.7,
    streaming: options?.streaming ?? false, // Only enable streaming when explicitly requested
    timeout: 60000, // 60 second timeout
    maxRetries: 2,
    callbacks: options?.callbacks,
  });

  logger.debug(
    {
      provider: "openai",
      model: config.llmModel,
      temperature: options?.temperature ?? 0.7,
      callbacksCount: options?.callbacks?.length ?? 0,
    },
    "OpenAI LLM instance created",
  );
  return llm;
}
