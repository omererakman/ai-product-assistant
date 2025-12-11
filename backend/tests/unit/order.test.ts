import { describe, test, expect } from "vitest";
import {
  validateOrder,
  OrderSchema,
  OrderItemSchema,
} from "../../src/models/order.js";
import { z } from "zod";

describe("Order Validation", () => {
  const validOrderItem = {
    product_id: "prod-1",
    product_name: "iPhone 15 Pro",
    quantity: 2,
    price: 999.99,
  };

  const validOrder = {
    order_id: "ORD-ABC123-1234567890",
    items: [validOrderItem],
    total_price: 1999.98,
    customer_name: "John Doe",
    customer_email: "john@example.com",
    billing_address: "123 Main St, New York, NY 10001",
    invoice_email: "john@example.com",
    status: "pending" as const,
    created_at: new Date().toISOString(),
  };

  describe("OrderItemSchema", () => {
    test("should validate valid order item", () => {
      const result = OrderItemSchema.safeParse(validOrderItem);
      expect(result.success).toBe(true);
    });

    test("should reject empty product_id", () => {
      const result = OrderItemSchema.safeParse({
        ...validOrderItem,
        product_id: "",
      });
      expect(result.success).toBe(false);
    });

    test("should reject zero quantity", () => {
      const result = OrderItemSchema.safeParse({
        ...validOrderItem,
        quantity: 0,
      });
      expect(result.success).toBe(false);
    });

    test("should reject negative quantity", () => {
      const result = OrderItemSchema.safeParse({
        ...validOrderItem,
        quantity: -1,
      });
      expect(result.success).toBe(false);
    });

    test("should reject zero price", () => {
      const result = OrderItemSchema.safeParse({
        ...validOrderItem,
        price: 0,
      });
      expect(result.success).toBe(false);
    });

    test("should reject negative price", () => {
      const result = OrderItemSchema.safeParse({
        ...validOrderItem,
        price: -10,
      });
      expect(result.success).toBe(false);
    });

    test("should reject non-integer quantity", () => {
      const result = OrderItemSchema.safeParse({
        ...validOrderItem,
        quantity: 1.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("OrderSchema", () => {
    test("should validate valid order", () => {
      const result = OrderSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
    });

    test("should reject empty items array", () => {
      const result = OrderSchema.safeParse({
        ...validOrder,
        items: [],
      });
      expect(result.success).toBe(false);
    });

    test("should reject invalid email format", () => {
      const result = OrderSchema.safeParse({
        ...validOrder,
        customer_email: "invalid-email",
      });
      expect(result.success).toBe(false);
    });

    test("should reject invalid invoice email format", () => {
      const result = OrderSchema.safeParse({
        ...validOrder,
        invoice_email: "invalid-email",
      });
      expect(result.success).toBe(false);
    });

    test("should accept order without optional fields", () => {
      const minimalOrder = {
        order_id: "ORD-123",
        items: [validOrderItem],
        total_price: 999.99,
        customer_name: "John Doe",
        billing_address: "123 Main St",
        invoice_email: "john@example.com",
        status: "pending" as const,
        created_at: new Date().toISOString(),
      };

      const result = OrderSchema.safeParse(minimalOrder);
      expect(result.success).toBe(true);
    });

    test("should validate status enum", () => {
      const validStatuses = [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ];

      for (const status of validStatuses) {
        const result = OrderSchema.safeParse({
          ...validOrder,
          status,
        });
        expect(result.success).toBe(true);
      }
    });

    test("should reject invalid status", () => {
      const result = OrderSchema.safeParse({
        ...validOrder,
        status: "invalid-status",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("validateOrder", () => {
    test("should validate order with correct total price", () => {
      const order = {
        ...validOrder,
        items: [{ ...validOrderItem, quantity: 2, price: 999.99 }],
        total_price: 1999.98,
      };

      const result = validateOrder(order);
      expect(result.total_price).toBe(1999.98);
    });

    test("should validate order with multiple items", () => {
      const order = {
        ...validOrder,
        items: [
          { ...validOrderItem, quantity: 1, price: 999.99 },
          {
            product_id: "prod-2",
            product_name: "MacBook Pro",
            quantity: 1,
            price: 2499.99,
          },
        ],
        total_price: 3499.98,
      };

      const result = validateOrder(order);
      expect(result.items).toHaveLength(2);
      expect(result.total_price).toBe(3499.98);
    });

    test("should throw error when total price mismatch is too large", () => {
      const order = {
        ...validOrder,
        items: [{ ...validOrderItem, quantity: 2, price: 999.99 }],
        total_price: 3000.0,
      };

      expect(() => validateOrder(order)).toThrow("Total price mismatch");
    });

    test("should allow small floating point differences", () => {
      const order = {
        ...validOrder,
        items: [{ ...validOrderItem, quantity: 1, price: 0.1 }],
        total_price: 0.1000001,
      };

      const result = validateOrder(order);
      expect(result).toBeDefined();
    });

    test("should calculate total correctly for complex order", () => {
      const order = {
        ...validOrder,
        items: [
          { ...validOrderItem, quantity: 3, price: 10.5 },
          {
            product_id: "prod-2",
            product_name: "Product 2",
            quantity: 2,
            price: 25.75,
          },
        ],
        total_price: 83.0,
      };

      const result = validateOrder(order);
      expect(result.total_price).toBe(83.0);
    });

    test("should throw error for invalid order structure", () => {
      const invalidOrder = {
        order_id: "",
        items: [],
        total_price: 0,
      };

      expect(() => validateOrder(invalidOrder)).toThrow();
    });
  });
});
