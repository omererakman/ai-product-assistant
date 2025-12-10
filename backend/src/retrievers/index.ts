import { BaseRetriever } from "@langchain/core/retrievers";
import { VectorStore } from "@langchain/core/vectorstores";
import { getConfig } from "../config/env.js";
import { createSimilarityRetriever } from "./similarity.js";
import { createMMRRetriever } from "./mmr.js";
import { createHybridRetriever } from "./hybrid.js";

export async function createRetriever(vectorStore: VectorStore): Promise<BaseRetriever> {
  const config = getConfig();

  if (config.retrieverType === "mmr") {
    return createMMRRetriever(vectorStore);
  } else if (config.retrieverType === "hybrid") {
    return await createHybridRetriever(vectorStore);
  } else {
    return createSimilarityRetriever(vectorStore);
  }
}
