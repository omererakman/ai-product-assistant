import { BaseRetriever } from "@langchain/core/retrievers";
import { VectorStore } from "@langchain/core/vectorstores";
import { Document } from "@langchain/core/documents";
import { BM25Retriever } from "@langchain/community/retrievers/bm25";
import { EnsembleRetriever } from "@langchain/classic/retrievers/ensemble";
import { getConfig } from "../config/env.js";
import { logger } from "../logger.js";
import { loadProductsFromDirectory } from "../loaders/directory-loader.js";

export async function createHybridRetriever(vectorStore: VectorStore): Promise<BaseRetriever> {
  const config = getConfig();

  const fetchK = Math.max(config.topK * 2, 10);

  const vectorRetriever = vectorStore.asRetriever({
    k: fetchK,
    searchType: "similarity",
  });

  const products = await loadProductsFromDirectory("data");
  const bm25Docs = products.map((product) => {
    const searchableText = [
      product.name,
      product.description,
      product.category,
      (product as any).sub_category || "",
      ...Object.values(product.specifications || {}),
    ]
      .filter(Boolean)
      .join(" ");

    const metadata: Record<string, string | number | null> = {
      product_id: product.product_id,
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      stock_status: product.stock_status,
      os: product.specifications?.os || null,
      sub_category: (product as any).sub_category || null,
      sourceId: `product-${product.product_id}`,
    };

    if (product.specifications) {
      Object.entries(product.specifications).forEach(([key, value]) => {
        metadata[`spec_${key}`] = value || null;
      });
    }

    return new Document({
      pageContent: searchableText,
      metadata,
    });
  });

  const bm25Retriever = BM25Retriever.fromDocuments(bm25Docs, {
    k: fetchK,
  });

  const ensembleRetriever = new EnsembleRetriever({
    retrievers: [vectorRetriever, bm25Retriever],
    weights: [0.5, 0.5],
  });

  const hybridRetriever = {
    ...ensembleRetriever,
    async invoke(query: string): Promise<Document[]> {
      const results = await ensembleRetriever.invoke(query);
      return results.slice(0, config.topK);
    },
  } as unknown as BaseRetriever;

  logger.debug(
    {
      type: "hybrid",
      finalTopK: config.topK,
      vectorFetchK: fetchK,
      bm25FetchK: fetchK,
      vectorWeight: 0.5,
      bm25Weight: 0.5,
      totalDocs: bm25Docs.length,
    },
    "Hybrid retriever created (vector + BM25 with RRF)",
  );

  return hybridRetriever;
}
