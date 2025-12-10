import { Langfuse } from "langfuse";

let langfuseInstance: Langfuse | null = null;

export function getLangfuse(): Langfuse | null {
  if (process.env.LANGFUSE_ENABLED !== "true") {
    return null;
  }

  if (langfuseInstance) {
    return langfuseInstance;
  }

  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com";

  if (!secretKey || !publicKey) {
    console.warn(
      "Langfuse is enabled but LANGFUSE_SECRET_KEY or LANGFUSE_PUBLIC_KEY is not set. Langfuse tracking will be disabled."
    );
    return null;
  }

  try {
    langfuseInstance = new Langfuse({
      secretKey,
      publicKey,
      baseUrl,
    });
    console.log("Langfuse initialized successfully");
    return langfuseInstance;
  } catch (error) {
    console.error("Failed to initialize Langfuse:", error);
    return null;
  }
}

export async function safeLangfuseOperation<T>(
  operation: (langfuse: Langfuse) => Promise<T> | T,
  fallback?: T
): Promise<T | undefined> {
  const langfuse = getLangfuse();
  if (!langfuse) {
    return fallback;
  }

  try {
    return await operation(langfuse);
  } catch (error) {
    console.error("Langfuse operation failed:", error);
    return fallback;
  }
}

export { getLangfuse as langfuse };
