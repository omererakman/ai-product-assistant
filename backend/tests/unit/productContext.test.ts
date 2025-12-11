import { describe, test, expect } from "vitest";
import { ProductContextManager } from "../../src/utils/product-context.js";
import { Product } from "../../src/models/product.js";
import { ProductListItem } from "../../src/orchestrator/index.js";

describe("Product Context Utilities", () => {
  const mockProducts: Product[] = [
    {
      product_id: "prod-1",
      name: "iPhone 15 Pro",
      description: "Latest iPhone",
      price: 999,
      category: "phones",
      stock_status: "in_stock",
      specifications: { storage: "256GB", color: "Blue" },
    },
    {
      product_id: "prod-2",
      name: "MacBook Pro",
      description: "Powerful laptop",
      price: 2499,
      category: "laptops",
      stock_status: "in_stock",
      specifications: { screen: "16-inch", chip: "M3" },
    },
    {
      product_id: "prod-3",
      name: "AirPods Pro",
      description: "Wireless earbuds",
      price: 249,
      category: "audio",
      stock_status: "in_stock",
    },
  ];

  describe("extractFromProducts", () => {
    test("should extract product list items from products", () => {
      const result = ProductContextManager.extractFromProducts(mockProducts);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        position: 1,
        product_id: "prod-1",
        name: "iPhone 15 Pro",
        price: 999,
        category: "phones",
        stock_status: "in_stock",
        specifications: { storage: "256GB", color: "Blue" },
      });
      expect(result[1].position).toBe(2);
      expect(result[2].position).toBe(3);
    });

    test("should handle empty products array", () => {
      const result = ProductContextManager.extractFromProducts([]);
      expect(result).toHaveLength(0);
    });

    test("should handle products without specifications", () => {
      const productsWithoutSpecs: Product[] = [
        {
          product_id: "prod-1",
          name: "Product 1",
          description: "Description",
          price: 100,
          category: "category",
          stock_status: "in_stock",
        },
      ];

      const result =
        ProductContextManager.extractFromProducts(productsWithoutSpecs);
      expect(result[0].specifications).toBeUndefined();
    });
  });

  describe("resolveOrdinalReference", () => {
    const productList: ProductListItem[] = [
      {
        position: 1,
        product_id: "prod-1",
        name: "iPhone 15 Pro",
        price: 999,
        category: "phones",
        stock_status: "in_stock",
      },
      {
        position: 2,
        product_id: "prod-2",
        name: "MacBook Pro",
        price: 2499,
        category: "laptops",
        stock_status: "in_stock",
      },
      {
        position: 3,
        product_id: "prod-3",
        name: "AirPods Pro",
        price: 249,
        category: "audio",
        stock_status: "in_stock",
      },
    ];

    test('should resolve "first" reference', () => {
      const result = ProductContextManager.resolveOrdinalReference(
        "first",
        productList,
      );
      expect(result).not.toBeNull();
      expect(result?.position).toBe(1);
      expect(result?.product_id).toBe("prod-1");
    });

    test('should resolve "the first one" reference', () => {
      const result = ProductContextManager.resolveOrdinalReference(
        "the first one",
        productList,
      );
      expect(result?.position).toBe(1);
    });

    test('should resolve "second" reference', () => {
      const result = ProductContextManager.resolveOrdinalReference(
        "second",
        productList,
      );
      expect(result?.position).toBe(2);
      expect(result?.product_id).toBe("prod-2");
    });

    test('should resolve "last" reference', () => {
      const result = ProductContextManager.resolveOrdinalReference(
        "last",
        productList,
      );
      expect(result?.position).toBe(3);
      expect(result?.product_id).toBe("prod-3");
    });

    test('should resolve numeric references like "number 2"', () => {
      const result = ProductContextManager.resolveOrdinalReference(
        "number 2",
        productList,
      );
      expect(result?.position).toBe(2);
    });

    test('should resolve ordinal suffixes like "1st"', () => {
      const result = ProductContextManager.resolveOrdinalReference(
        "1st",
        productList,
      );
      expect(result?.position).toBe(1);
    });

    test('should resolve "2nd" reference', () => {
      const result = ProductContextManager.resolveOrdinalReference(
        "2nd",
        productList,
      );
      expect(result?.position).toBe(2);
    });

    test('should resolve "3rd" reference', () => {
      const result = ProductContextManager.resolveOrdinalReference(
        "3rd",
        productList,
      );
      expect(result?.position).toBe(3);
    });

    test("should return null for invalid reference", () => {
      const result = ProductContextManager.resolveOrdinalReference(
        "tenth",
        productList,
      );
      expect(result).toBeNull();
    });

    test("should return null for empty product list", () => {
      const result = ProductContextManager.resolveOrdinalReference("first", []);
      expect(result).toBeNull();
    });

    test("should handle case-insensitive references", () => {
      const result = ProductContextManager.resolveOrdinalReference(
        "FIRST",
        productList,
      );
      expect(result?.position).toBe(1);
    });
  });

  describe("containsOrdinalReference", () => {
    test('should detect "first" in query', () => {
      expect(
        ProductContextManager.containsOrdinalReference("I want the first one"),
      ).toBe(true);
    });

    test('should detect "second" in query', () => {
      expect(
        ProductContextManager.containsOrdinalReference(
          "show me the second product",
        ),
      ).toBe(true);
    });

    test('should detect "last" in query', () => {
      expect(
        ProductContextManager.containsOrdinalReference("I will take the last"),
      ).toBe(true);
    });

    test("should detect numeric references", () => {
      expect(
        ProductContextManager.containsOrdinalReference("number 3 please"),
      ).toBe(true);
    });

    test("should detect ordinal suffixes", () => {
      expect(
        ProductContextManager.containsOrdinalReference("I want the 1st item"),
      ).toBe(true);
      expect(
        ProductContextManager.containsOrdinalReference("show me the 2nd"),
      ).toBe(true);
      expect(
        ProductContextManager.containsOrdinalReference("the 3rd one"),
      ).toBe(true);
    });

    test("should return false for queries without ordinal references", () => {
      expect(
        ProductContextManager.containsOrdinalReference("I want an iPhone"),
      ).toBe(false);
      expect(
        ProductContextManager.containsOrdinalReference("what is the price"),
      ).toBe(false);
    });

    test("should handle case-insensitive detection", () => {
      expect(
        ProductContextManager.containsOrdinalReference("THE FIRST ONE"),
      ).toBe(true);
    });
  });
});
