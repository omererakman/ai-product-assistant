import Database from "better-sqlite3";
import { Order, OrderItem } from "../models/order.js";
import { logger } from "../logger.js";
import { v4 as uuidv4 } from "uuid";

export function createOrder(db: Database.Database, order: Omit<Order, "order_id" | "created_at">): Order {
  const orderId = `ORD-${uuidv4().split("-")[0].toUpperCase()}-${Date.now().toString().slice(-6)}`;
  
  const orderRecord: Order = {
    ...order,
    order_id: orderId,
    created_at: new Date().toISOString(),
  };

  const stmt = db.prepare(`
    INSERT INTO orders (
      order_id, items, total_price, customer_name, customer_email,
      customer_phone, shipping_address, billing_address, invoice_email,
      status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  if (!orderRecord.customer_name || orderRecord.customer_name.trim() === "") {
    throw new Error("Customer name is required");
  }

  stmt.run(
    orderRecord.order_id,
    JSON.stringify(orderRecord.items),
    orderRecord.total_price,
    orderRecord.customer_name,
    orderRecord.customer_email || null,
    orderRecord.customer_phone || null,
    orderRecord.shipping_address || null,
    orderRecord.billing_address,
    orderRecord.invoice_email,
    orderRecord.status,
    orderRecord.created_at,
  );

  logger.info({ orderId: orderRecord.order_id }, "Order created successfully");
  return orderRecord;
}

export function getOrderById(db: Database.Database, orderId: string): Order | null {
  const stmt = db.prepare("SELECT * FROM orders WHERE order_id = ?");
  const row = stmt.get(orderId) as {
    order_id: string;
    items: string;
    total_price: number;
    customer_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    shipping_address: string | null;
    billing_address: string | null;
    invoice_email: string | null;
    status: string;
    created_at: string;
  } | undefined;

  if (!row) {
    return null;
  }

  const billingAddress = row.billing_address || row.shipping_address || "Address not provided";
  const invoiceEmail = row.invoice_email || row.customer_email || "noreply@example.com";

  return {
    order_id: row.order_id,
    items: JSON.parse(row.items) as OrderItem[],
    total_price: row.total_price,
    customer_name: row.customer_name || undefined,
    customer_email: row.customer_email || undefined,
    customer_phone: row.customer_phone || undefined,
    shipping_address: row.shipping_address || undefined,
    billing_address: billingAddress,
    invoice_email: invoiceEmail,
    status: row.status as Order["status"],
    created_at: row.created_at,
  };
}

export function getAllOrders(db: Database.Database): Order[] {
  const stmt = db.prepare("SELECT * FROM orders ORDER BY created_at DESC");
  const rows = stmt.all() as Array<{
    order_id: string;
    items: string;
    total_price: number;
    customer_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    shipping_address: string | null;
    billing_address: string | null;
    invoice_email: string | null;
    status: string;
    created_at: string;
  }>;

  return rows.map((row) => {
    const billingAddress = row.billing_address || row.shipping_address || "Address not provided";
    const invoiceEmail = row.invoice_email || row.customer_email || "noreply@example.com";

    return {
      order_id: row.order_id,
      items: JSON.parse(row.items) as OrderItem[],
      total_price: row.total_price,
      customer_name: row.customer_name || undefined,
      customer_email: row.customer_email || undefined,
      customer_phone: row.customer_phone || undefined,
      shipping_address: row.shipping_address || undefined,
      billing_address: billingAddress,
      invoice_email: invoiceEmail,
      status: row.status as Order["status"],
      created_at: row.created_at,
    };
  });
}

export function cancelOrder(db: Database.Database, orderId: string): Order | null {
  const stmt = db.prepare("UPDATE orders SET status = ? WHERE order_id = ?");
  const result = stmt.run("cancelled", orderId);
  
  if (result.changes > 0) {
    logger.info({ orderId }, "Order cancelled successfully");
    return getOrderById(db, orderId);
  }
  
  logger.warn({ orderId }, "Order not found for cancellation");
  return null;
}

export function deleteOrder(db: Database.Database, orderId: string): boolean {
  const stmt = db.prepare("DELETE FROM orders WHERE order_id = ?");
  const result = stmt.run(orderId);
  
  if (result.changes > 0) {
    logger.info({ orderId }, "Order deleted successfully");
    return true;
  }
  
  logger.warn({ orderId }, "Order not found for deletion");
  return false;
}
