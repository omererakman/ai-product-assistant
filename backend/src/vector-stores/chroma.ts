import { Chroma } from "@langchain/community/vectorstores/chroma";
import { ChromaClient } from "chromadb";
import { Document } from "@langchain/core/documents";
import { getConfig } from "../config/env.js";
import { createOpenAIEmbeddings } from "../embeddings/index.js";
import { logger } from "../logger.js";

function createChromaClient(
  config: ReturnType<typeof getConfig>,
): ChromaClient {
  return new ChromaClient({
    host: config.chromaHost,
    port: config.chromaPort,
    ssl: config.chromaSsl,
    ...(config.chromaApiKey && {
      auth: {
        provider: "token",
        credentials: config.chromaApiKey,
      },
    }),
  });
}

export async function createChromaVectorStore(
  documents: Document[] | undefined,
  collectionName: string,
): Promise<Chroma> {
  const config = getConfig();
  const embeddings = createOpenAIEmbeddings(config);

  try {
    const client = createChromaClient(config);

    if (documents && documents.length > 0) {
      logger.debug(
        {
          documentCount: documents.length,
          collectionName,
        },
        "Creating ChromaDB collection with documents",
      );

      try {
        await client.deleteCollection({ name: collectionName });
        logger.debug(
          { collectionName },
          "Deleted existing ChromaDB collection",
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          !errorMessage?.includes("does not exist") &&
          !errorMessage?.includes("not found")
        ) {
          logger.debug(
            { error },
            "Error deleting ChromaDB collection (may not exist)",
          );
        }
      }

      return await Chroma.fromDocuments(documents, embeddings, {
        collectionName,
        index: client,
      });
    } else {
      logger.debug({ collectionName }, "Loading existing ChromaDB collection");

      return await Chroma.fromExistingCollection(embeddings, {
        collectionName,
        index: client,
      });
    }
  } catch (error) {
    logger.error({ error }, "Failed to create ChromaDB vector store");
    throw new Error(
      `Failed to create ChromaDB vector store: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function loadChromaVectorStore(
  collectionName: string,
): Promise<Chroma> {
  const config = getConfig();
  const embeddings = createOpenAIEmbeddings(config);

  try {
    logger.debug(
      { collectionName, host: config.chromaHost, port: config.chromaPort },
      "Connecting to ChromaDB",
    );

    const client = createChromaClient(config);
    logger.debug("ChromaDB client created, proceeding to load collection");

    logger.debug({ collectionName }, "Loading existing ChromaDB collection");

    const vectorStore = await Chroma.fromExistingCollection(embeddings, {
      collectionName,
      index: client,
    });

    logger.debug({ collectionName }, "ChromaDB collection loaded successfully");
    return vectorStore;
  } catch (error) {
    logger.error(
      {
        error,
        collectionName,
        host: config.chromaHost,
        port: config.chromaPort,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      "Failed to load ChromaDB vector store",
    );
    throw new Error(
      `Failed to load ChromaDB vector store: ${error instanceof Error ? error.message : String(error)}. Make sure ChromaDB is running at ${config.chromaHost}:${config.chromaPort}`,
    );
  }
}
