import { OpenAIEmbeddings } from "@langchain/openai";
import { Embeddings } from "@langchain/core/embeddings";
import { Config } from "../../config/env.js";
import { logger } from "../../logger.js";

export function createOpenAIEmbeddings(config: Config): Embeddings {
  if (!config.openaiApiKey) {
    throw new Error("OpenAI API key is required for embeddings");
  }

  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: config.openaiApiKey,
    modelName: config.embeddingModel,
  });

  logger.debug(
    { provider: "openai", model: config.embeddingModel },
    "OpenAI Embeddings instance created",
  );
  return embeddings;
}
