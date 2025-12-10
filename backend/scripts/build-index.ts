import { productsToDocuments } from "../src/loaders/json-loader.js";
import { loadProductsFromDirectory } from "../src/loaders/directory-loader.js";
import { createTextSplitter } from "../src/splitters/index.js";
import { createChromaVectorStore } from "../src/vector-stores/index.js";
import { logger } from "../src/logger.js";
import { getConfig } from "../src/config/env.js";
import { getDataPath } from "../src/utils/paths.js";

async function buildIndex() {
  try {
    logger.info("Starting vector store index build");

    // Load products from directory using LangChain DirectoryLoader (supports both JSON and TXT files)
    logger.info("Loading products from data directory");
    const products = await loadProductsFromDirectory(getDataPath());
    logger.info({ count: products.length }, "Products loaded");

    // Convert to documents
    const documents = productsToDocuments(products);
    logger.info({ count: documents.length }, "Documents created");

    // Split documents
    logger.info("Splitting documents into chunks");
    const splitter = createTextSplitter();
    const chunks = await splitter.splitDocuments(documents);
    logger.info({ count: chunks.length }, "Chunks created");

    // Validate chunk sizes
    const config = getConfig();
    const invalidChunks = chunks.filter(
      (chunk) => chunk.pageContent.length < config.minChunkSize
    );

    if (invalidChunks.length > 0) {
      logger.error(
        {
          invalidChunkCount: invalidChunks.length,
          minChunkSize: config.minChunkSize,
          invalidChunks: invalidChunks.map((chunk, idx) => ({
            index: idx,
            size: chunk.pageContent.length,
            preview: chunk.pageContent.substring(0, 100),
          })),
        },
        "Indexing failed: Some chunks are below MIN_CHUNK_SIZE",
      );
      throw new Error(
        `Indexing failed: ${invalidChunks.length} chunk(s) are below MIN_CHUNK_SIZE (${config.minChunkSize} characters). ` +
          `Smallest chunk size: ${Math.min(...invalidChunks.map((c) => c.pageContent.length))} characters.`
      );
    }

    logger.info(
      { minChunkSize: config.minChunkSize },
      "All chunks meet minimum size requirement",
    );

    // Create vector store
    logger.info("Creating vector store with embeddings");
    const vectorStore = await createChromaVectorStore(chunks, "products");
    logger.info("Vector store created successfully");

    // Verify
    const sampleQuery = "iPhone";
    const results = await vectorStore.similaritySearch(sampleQuery, 3);
    logger.info(
      { query: sampleQuery, results: results.length },
      "Sample query test successful",
    );

    logger.info("Index build completed successfully");
  } catch (error) {
    logger.error({ error }, "Failed to build index");
    process.exit(1);
  }
}

buildIndex();
