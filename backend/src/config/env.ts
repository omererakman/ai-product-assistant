import { z } from "zod";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const ConfigSchema = z.object({
  openaiApiKey: z.string().min(1, "OPENAI_API_KEY is required"),
  llmModel: z.string().default("gpt-4o-mini"),
  embeddingModel: z.string().default("text-embedding-3-small"),
  vectorStoreType: z.enum(["chromadb", "memory"]).default("chromadb"),
  chromaHost: z.string().default("localhost"),
  chromaPort: z.number().int().positive().default(8000),
  chromaSsl: z.boolean().default(false),
  chromaApiKey: z.string().optional(),
  databasePath: z.string().default("./data/orders.db"),
  chunkSize: z.number().int().positive().default(800),
  chunkOverlap: z.number().int().nonnegative().default(100),
  minChunkSize: z.number().int().positive().default(50),
  retrieverType: z.enum(["similarity", "mmr", "hybrid"]).default("hybrid"),
  topK: z.number().int().positive().default(5),
  scoreThreshold: z.number().min(0).max(1).default(0.5),
  port: z.number().int().positive().default(3001),
  corsOrigin: z.string().default("http://localhost:5173"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  langfuseEnabled: z.boolean().default(false),
  langfuseEvaluationEnabled: z.boolean().default(false),
  langfuseSecretKey: z.string().optional(),
  langfusePublicKey: z.string().optional(),
  langfuseBaseUrl: z.string().default("https://cloud.langfuse.com"),
});

export type Config = z.infer<typeof ConfigSchema>;

let config: Config | null = null;

export function getConfig(): Config {
  if (config) {
    return config;
  }

  const rawConfig = {
    openaiApiKey: process.env.OPENAI_API_KEY,
    llmModel: process.env.LLM_MODEL,
    embeddingModel: process.env.EMBEDDING_MODEL,
    vectorStoreType: process.env.VECTOR_STORE_TYPE,
    chromaHost: process.env.CHROMA_HOST,
    chromaPort: process.env.CHROMA_PORT
      ? parseInt(process.env.CHROMA_PORT, 10)
      : undefined,
    chromaSsl: process.env.CHROMA_SSL === "true",
    chromaApiKey: process.env.CHROMA_API_KEY,
    databasePath: process.env.DATABASE_PATH,
    chunkSize: process.env.CHUNK_SIZE
      ? parseInt(process.env.CHUNK_SIZE, 10)
      : undefined,
    chunkOverlap: process.env.CHUNK_OVERLAP
      ? parseInt(process.env.CHUNK_OVERLAP, 10)
      : undefined,
    minChunkSize: process.env.MIN_CHUNK_SIZE
      ? parseInt(process.env.MIN_CHUNK_SIZE, 10)
      : undefined,
    retrieverType: process.env.RETRIEVER_TYPE,
    topK: process.env.TOP_K ? parseInt(process.env.TOP_K, 10) : undefined,
    scoreThreshold: process.env.SCORE_THRESHOLD
      ? parseFloat(process.env.SCORE_THRESHOLD)
      : undefined,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
    corsOrigin: process.env.CORS_ORIGIN,
    logLevel: process.env.LOG_LEVEL,
    nodeEnv: process.env.NODE_ENV,
    langfuseEnabled: process.env.LANGFUSE_ENABLED === "true",
    langfuseEvaluationEnabled:
      process.env.LANGFUSE_EVALUATION_ENABLED === "true",
    langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY,
    langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY,
    langfuseBaseUrl: process.env.LANGFUSE_BASE_URL,
  };

  config = ConfigSchema.parse(rawConfig);
  return config;
}
