import { Document } from "@langchain/core/documents";
import { logger } from "../logger.js";
import { readFileSync } from "fs";
import { join } from "path";

export interface Product {
  product_id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  stock_status: "in_stock" | "out_of_stock" | "low_stock";
  specifications?: Record<string, string>;
}

export function loadProductsFromJSON(filePath: string): Product[] {
  logger.debug({ filePath }, "Loading products from JSON file");
  
  try {
    const fullPath = join(process.cwd(), filePath);
    const fileContent = readFileSync(fullPath, "utf-8");
    const products: Product[] = JSON.parse(fileContent);
    
    logger.debug({ count: products.length }, "Products loaded successfully");
    return products;
  } catch (error) {
    logger.error({ error, filePath }, "Failed to load products from JSON");
    throw new Error(
      `Failed to load products: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function productsToDocuments(products: Product[]): Document[] {
  return products.map((product) => {
    const content = `Product ID: ${product.product_id}
Name: ${product.name}
Description: ${product.description}
Price: $${product.price.toFixed(2)}
Category: ${product.category}
Stock Status: ${product.stock_status}
${product.specifications ? `Specifications: ${JSON.stringify(product.specifications)}` : ""}`;

    const metadata: Record<string, string | number | null> = {
      product_id: product.product_id,
      name: product.name,
      price: product.price,
      category: product.category,
      stock_status: product.stock_status,
      sourceId: `product-${product.product_id}`,
      os: product.specifications?.os || null,
      sub_category: (product as any).sub_category || null,
    };

    if (product.specifications) {
      Object.entries(product.specifications).forEach(([key, value]) => {
        metadata[`spec_${key}`] = value || null;
      });
    }

    return new Document({
      pageContent: content,
      metadata,
    });
  });
}
