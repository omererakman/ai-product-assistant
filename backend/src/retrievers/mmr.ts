import { BaseRetriever } from "@langchain/core/retrievers";
import { VectorStore } from "@langchain/core/vectorstores";
import { getConfig } from "../config/env.js";
import { logger } from "../logger.js";

export function createMMRRetriever(vectorStore: VectorStore): BaseRetriever {
  const config = getConfig();

  const retriever = vectorStore.asRetriever({
    k: config.topK,
    searchType: "mmr",
    searchKwargs: {
      fetchK: config.topK * 2,
    },
  });

  logger.debug(
    {
      type: "mmr",
      topK: config.topK,
      fetchK: config.topK * 2,
    },
    "MMR retriever created",
  );

  return retriever;
}
