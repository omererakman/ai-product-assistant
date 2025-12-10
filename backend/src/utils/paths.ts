/**
 * Resolves the data directory path based on the current working directory.
 * Handles both development (running from backend/) and production scenarios.
 */
export function getDataPath(): string {
  return process.cwd().includes("backend") ? "../data" : "data";
}
