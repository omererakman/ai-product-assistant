import { z } from "zod";

export const OrderItemSchema = z.object({
  product_id: z.string().min(1),
  product_name: z.string().min(1),
  quantity: z.number().int().gt(0),
  price: z.number().gt(0),
});

export const OrderSchema = z.object({
  order_id: z.string().min(1),
  items: z.array(OrderItemSchema).min(1),
  total_price: z.number().gt(0),
  customer_name: z.string().min(1),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
  shipping_address: z.string().optional(),
  // Invoice information (required for order placement)
  billing_address: z.string().min(1).describe("Billing address for invoice"),
  invoice_email: z.string().email().describe("Email address where invoice will be sent"),
  status: z.enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]).default("pending"),
  created_at: z.string().datetime().or(z.date()),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;
export type Order = z.infer<typeof OrderSchema>;

// Validation function with custom business logic
export function validateOrder(order: unknown): Order {
  const parsed = OrderSchema.parse(order);
  
  // Calculate total price from items
  const calculatedTotal = parsed.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  
  // Validate total price matches calculated value (allow small floating point differences)
  if (Math.abs(calculatedTotal - parsed.total_price) > 0.01) {
    throw new Error(
      `Total price mismatch: calculated ${calculatedTotal.toFixed(2)}, provided ${parsed.total_price.toFixed(2)}`,
    );
  }
  
  return parsed;
}
