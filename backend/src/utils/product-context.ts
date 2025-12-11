import { Document } from "@langchain/core/documents";
import { Product } from "../models/product.js";
import { ProductListItem, ChatMessage } from "../orchestrator/index.js";
import { logger } from "../logger.js";

export class ProductContextManager {
  static extractFromDocuments(docs: Document[]): ProductListItem[] {
    return docs.map((doc, index) => {
      const specifications: Record<string, string> | undefined = (() => {
        const specEntries: Array<[string, string]> = [];
        for (const [key, value] of Object.entries(doc.metadata)) {
          if (key.startsWith("spec_") && value != null) {
            const specKey = key.replace("spec_", "");
            specEntries.push([specKey, String(value)]);
          }
        }
        return specEntries.length > 0
          ? Object.fromEntries(specEntries)
          : undefined;
      })();

      return {
        position: index + 1,
        product_id: doc.metadata.product_id as string,
        name: doc.metadata.name as string,
        price: doc.metadata.price as number,
        category: doc.metadata.category as string,
        stock_status: doc.metadata.stock_status as string,
        specifications,
      };
    });
  }

  static extractFromProducts(products: Product[]): ProductListItem[] {
    return products.map((product, index) => ({
      position: index + 1,
      product_id: product.product_id,
      name: product.name,
      price: product.price,
      category: product.category,
      stock_status: product.stock_status,
      specifications: product.specifications,
    }));
  }

  static getLatestProductList(
    chatHistory: ChatMessage[],
  ): ProductListItem[] | null {
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const message = chatHistory[i];
      if (message.role === "assistant" && message.metadata?.productList) {
        return message.metadata.productList;
      }
    }
    return null;
  }

  static resolveOrdinalReference(
    reference: string,
    productList: ProductListItem[],
  ): ProductListItem | null {
    if (!productList || productList.length === 0) {
      logger.warn("Cannot resolve reference: empty product list");
      return null;
    }

    const normalized = reference.toLowerCase().trim();

    const patterns = [
      { regex: /(?:the\s+)?first(?:\s+one)?/i, position: 1 },
      { regex: /(?:the\s+)?second(?:\s+one)?/i, position: 2 },
      { regex: /(?:the\s+)?third(?:\s+one)?/i, position: 3 },
      { regex: /(?:the\s+)?fourth(?:\s+one)?/i, position: 4 },
      { regex: /(?:the\s+)?fifth(?:\s+one)?/i, position: 5 },
      { regex: /(?:the\s+)?last(?:\s+one)?/i, position: -1 },
      {
        regex: /(?:number\s+)?(\d+)(?:st|nd|rd|th)?/i,
        position: "match" as const,
      },
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern.regex);
      if (match) {
        let position =
          pattern.position === "match" ? parseInt(match[1]) : pattern.position;

        if (position === -1) {
          position = productList.length;
        }

        const product = productList.find((p) => p.position === position);
        if (product) {
          logger.debug(
            {
              reference,
              position,
              productId: product.product_id,
              productName: product.name,
            },
            "Resolved ordinal reference",
          );
          return product;
        }
      }
    }

    logger.warn(
      { reference, availablePositions: productList.length },
      "Could not resolve ordinal reference",
    );
    return null;
  }

  static containsOrdinalReference(query: string): boolean {
    const ordinalPatterns = [
      /\b(?:the\s+)?(?:first|second|third|fourth|fifth|last)(?:\s+one)?\b/i,
      /\bnumber\s+\d+\b/i,
      /\b\d+(?:st|nd|rd|th)\b/i,
    ];

    return ordinalPatterns.some((pattern) => pattern.test(query));
  }
}
