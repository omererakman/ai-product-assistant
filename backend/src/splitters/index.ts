import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getConfig } from "../config/env.js";
import { logger } from "../logger.js";

export function createTextSplitter() {
  const config = getConfig();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
    separators: ["\n\n", "\n", ". ", "! ", "? ", " "],
  });

  logger.debug(
    { chunkSize: config.chunkSize, chunkOverlap: config.chunkOverlap },
    "Text splitter created",
  );

  return splitter;
}
