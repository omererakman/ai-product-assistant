import Database from "better-sqlite3";
import { getConfig } from "../config/env.js";
import { logger } from "../logger.js";
import { dirname } from "path";
import { existsSync, mkdirSync } from "fs";

export function initializeDatabase(db: Database.Database): void {
  logger.debug("Initializing database schema");

  // Create table with all fields (for new databases)
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      items TEXT NOT NULL,
      total_price REAL NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      customer_phone TEXT,
      shipping_address TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  `);

  // Migrate existing orders: add invoice fields if they don't exist
  // Check if columns exist by trying to query them
  const tableInfo = db.prepare("PRAGMA table_info(orders)").all() as Array<{
    name: string;
    notnull: number;
  }>;
  const columnNames = tableInfo.map((col) => col.name);
  const customerNameColumn = tableInfo.find(
    (col) => col.name === "customer_name",
  );

  // Migrate customer_name to NOT NULL if it exists but is nullable
  if (customerNameColumn && customerNameColumn.notnull === 0) {
    // Update any NULL values to a placeholder before making it NOT NULL
    db.exec(
      "UPDATE orders SET customer_name = 'Customer Name Required' WHERE customer_name IS NULL",
    );
    // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
    // For now, we'll handle this at insert time, but log a warning
    logger.warn(
      "customer_name column exists but is nullable. New orders will require customer_name.",
    );
  }

  if (!columnNames.includes("billing_address")) {
    db.exec("ALTER TABLE orders ADD COLUMN billing_address TEXT");
    logger.debug("Added billing_address column to orders table");
  }
  if (!columnNames.includes("invoice_email")) {
    db.exec("ALTER TABLE orders ADD COLUMN invoice_email TEXT");
    logger.debug("Added invoice_email column to orders table");
  }

  // Remove company_name and tax_id columns if they exist (these fields were removed from the model)
  if (columnNames.includes("company_name")) {
    // SQLite doesn't support DROP COLUMN directly, so we'll leave it but not use it
    // For a proper migration, we'd need to recreate the table
    logger.debug(
      "company_name column exists but is no longer used in the model",
    );
  }
  if (columnNames.includes("tax_id")) {
    // SQLite doesn't support DROP COLUMN directly, so we'll leave it but not use it
    // For a proper migration, we'd need to recreate the table
    logger.debug("tax_id column exists but is no longer used in the model");
  }

  logger.debug("Database schema initialized");
}

export function createDatabase(): Database.Database {
  const config = getConfig();

  // Ensure data directory exists
  const dir = dirname(config.databasePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(config.databasePath);
  initializeDatabase(db);
  return db;
}
