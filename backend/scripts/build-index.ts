import { productsToDocuments } from "../src/loaders/json-loader.js";
import { loadProductsFromDirectory } from "../src/loaders/directory-loader.js";
import { createTextSplitter } from "../src/splitters/index.js";
import { createChromaVectorStore } from "../src/vector-stores/index.js";
import { logger } from "../src/logger.js";

async function buildIndex() {
  try {
    logger.info("Starting vector store index build");

    // Load products from directory using LangChain DirectoryLoader (supports both JSON and TXT files)
    logger.info("Loading products from data directory");
    // Resolve path relative to project root
    const dataPath = process.cwd().includes("backend") 
      ? "../data" 
      : "data";
    const products = await loadProductsFromDirectory(dataPath);
    logger.info({ count: products.length }, "Products loaded");

    // Convert to documents
    const documents = productsToDocuments(products);
    logger.info({ count: documents.length }, "Documents created");

    // Split documents
    logger.info("Splitting documents into chunks");
    const splitter = createTextSplitter();
    const chunks = await splitter.splitDocuments(documents);
    logger.info({ count: chunks.length }, "Chunks created");

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
