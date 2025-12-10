import { z } from "zod";

export const ProductSchema = z.object({
  product_id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().gt(0),
  category: z.string().min(1),
  stock_status: z.enum(["in_stock", "out_of_stock", "low_stock"]),
  specifications: z.record(z.string(), z.string()).optional(),
});

export type Product = z.infer<typeof ProductSchema>;
