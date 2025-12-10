import { BaseRetriever } from "@langchain/core/retrievers";
import { VectorStore } from "@langchain/core/vectorstores";
import { getConfig } from "../config/env.js";
import { logger } from "../logger.js";

export function createSimilarityRetriever(
  vectorStore: VectorStore,
): BaseRetriever {
  const config = getConfig();

  const retriever = vectorStore.asRetriever({
    k: config.topK,
    searchType: "similarity",
    ...(config.scoreThreshold > 0 && {
      searchKwargs: {
        scoreThreshold: config.scoreThreshold,
      },
    }),
  });

  logger.debug(
    {
      type: "similarity",
      topK: config.topK,
      scoreThreshold: config.scoreThreshold,
    },
    "Similarity retriever created",
  );

  return retriever;
}
