import { readdir, readFile } from "fs/promises";
import { join, extname } from "path";
import { logger } from "../logger.js";
import { Product } from "./json-loader.js";

function parseTXTDocument(document: {
  pageContent: string;
  metadata?: Record<string, unknown>;
}): Product[] {
  const products: Product[] = [];
  const content = document.pageContent;
  const productBlocks = content.split(/\n\n+/);

  for (const block of productBlocks) {
    if (!block.trim()) continue;

    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l);
    if (lines.length === 0) continue;

    const product: Partial<Product> & {
      specifications?: Record<string, string>;
    } = {
      specifications: {},
    };

    let inSpecs = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith("PROD-")) {
        const match = line.match(/^PROD-(\d+)\s*-\s*(.+)$/);
        if (match) {
          product.product_id = `PROD-${match[1]}`;
          product.name = match[2].trim();
        }
        continue;
      }

      if (line.includes(":")) {
        const colonIndex = line.indexOf(":");
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        const keyLower = key.toLowerCase();

        if (keyLower === "category") {
          product.category = value;
        } else if (keyLower === "sub category") {
          product.specifications!["sub_category"] = value;
        } else if (keyLower === "price") {
          const priceMatch = value.match(/\$?(\d+(?:\.\d+)?)/);
          if (priceMatch) {
            product.price = parseFloat(priceMatch[1]);
          }
        } else if (keyLower === "stock status") {
          const status = value.toLowerCase().replace(/\s+/g, "_");
          if (["in_stock", "out_of_stock", "low_stock"].includes(status)) {
            product.stock_status = status as Product["stock_status"];
          } else {
            product.stock_status = "in_stock";
          }
        } else if (keyLower === "description") {
          product.description = value;
        } else if (keyLower === "specifications") {
          inSpecs = true;
          continue;
        } else if (inSpecs && line.startsWith("-")) {
          const specMatch = line.match(/^-\s*(.+?):\s*(.+)$/);
          if (specMatch) {
            product.specifications![specMatch[1].trim()] = specMatch[2].trim();
          }
        }
      } else if (inSpecs && line.startsWith("-")) {
        const specMatch = line.match(/^-\s*(.+?):\s*(.+)$/);
        if (specMatch) {
          product.specifications![specMatch[1].trim()] = specMatch[2].trim();
        }
      }
    }

    if (
      product.product_id &&
      product.name &&
      product.description &&
      product.price !== undefined &&
      product.category &&
      product.stock_status
    ) {
      const subCategory = product.specifications?.["sub_category"];
      const finalProduct: Product & { sub_category?: string } = {
        product_id: product.product_id,
        name: product.name,
        description: product.description,
        price: product.price,
        category: product.category,
        stock_status: product.stock_status,
        specifications:
          Object.keys(product.specifications || {}).length > 0
            ? Object.fromEntries(
                Object.entries(product.specifications || {}).filter(
                  ([k]) => k !== "sub_category",
                ),
              )
            : undefined,
      };

      if (subCategory) {
        (finalProduct as Product & { sub_category: string }).sub_category =
          subCategory;
      }

      products.push(finalProduct);
    } else {
      logger.warn(
        { product_id: product.product_id },
        "Skipping incomplete product from TXT file",
      );
    }
  }

  return products;
}

function parseJSONDocument(document: {
  pageContent: string;
  metadata?: Record<string, unknown>;
}): Product[] {
  try {
    const products: Product[] = JSON.parse(document.pageContent);
    return products;
  } catch (error) {
    logger.error({ error }, "Failed to parse JSON document");
    return [];
  }
}

export async function loadProductsFromDirectory(
  directoryPath: string,
): Promise<Product[]> {
  logger.info({ directoryPath }, "Loading products from directory");

  try {
    const fullPath = join(process.cwd(), directoryPath);
    const allProducts: Product[] = [];
    const files = await readdir(fullPath);
    const supportedFiles = files.filter(
      (file) => file.endsWith(".json") || file.endsWith(".txt"),
    );

    logger.debug({ fileCount: supportedFiles.length }, "Found supported files");

    for (const file of supportedFiles) {
      const filePath = join(fullPath, file);
      const ext = extname(file).toLowerCase();

      try {
        const content = await readFile(filePath, "utf-8");
        const doc: {
          pageContent: string;
          metadata: Record<string, unknown>;
        } = {
          pageContent: content,
          metadata: { source: filePath },
        };

        if (ext === ".json") {
          const products = parseJSONDocument(doc);
          allProducts.push(...products);
          logger.debug({ file, count: products.length }, "Parsed JSON file");
        } else if (ext === ".txt") {
          const products = parseTXTDocument(doc);
          allProducts.push(...products);
          logger.debug({ file, count: products.length }, "Parsed TXT file");
        }
      } catch (error) {
        logger.error(
          { error, file },
          "Failed to parse file, continuing with other files",
        );
      }
    }

    logger.info(
      { count: allProducts.length, filesProcessed: supportedFiles.length },
      "All products loaded from directory",
    );

    return allProducts;
  } catch (error) {
    logger.error(
      { error, directoryPath },
      "Failed to load products from directory",
    );
    throw new Error(
      `Failed to load products from directory: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export { productsToDocuments } from "./json-loader.js";
