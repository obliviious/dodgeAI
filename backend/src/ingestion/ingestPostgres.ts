import fs from "node:fs";
import path from "node:path";
import type pg from "pg";
import {
  DATA_FOLDERS,
  TABLE_COLUMNS,
  readJsonlFiles,
  rowToInsert,
} from "./util.js";

const CONFLICT_TARGETS: Record<string, string[]> = {
  sales_order_headers: ["sales_order"],
  sales_order_items: ["sales_order", "sales_order_item"],
  sales_order_schedule_lines: ["sales_order", "sales_order_item", "schedule_line"],
  outbound_delivery_headers: ["delivery_document"],
  outbound_delivery_items: ["delivery_document", "delivery_document_item"],
  billing_document_headers: ["billing_document"],
  billing_document_items: ["billing_document", "billing_document_item"],
  billing_document_cancellations: ["billing_document"],
  journal_entry_items_accounts_receivable: [
    "company_code",
    "fiscal_year",
    "accounting_document",
    "accounting_document_item",
  ],
  payments_accounts_receivable: [
    "company_code",
    "fiscal_year",
    "accounting_document",
    "accounting_document_item",
  ],
  business_partners: ["business_partner"],
  business_partner_addresses: ["business_partner", "address_id"],
  customer_company_assignments: ["customer", "company_code"],
  customer_sales_area_assignments: [
    "customer",
    "sales_organization",
    "distribution_channel",
    "division",
  ],
  products: ["product"],
  product_descriptions: ["product", "language"],
  product_plants: ["product", "plant"],
  product_storage_locations: ["product", "plant", "storage_location"],
  plants: ["plant"],
};

const TRUNCATE_ORDER = [
  "product_storage_locations",
  "product_plants",
  "product_descriptions",
  "products",
  "plants",
  "customer_sales_area_assignments",
  "customer_company_assignments",
  "business_partner_addresses",
  "business_partners",
  "payments_accounts_receivable",
  "journal_entry_items_accounts_receivable",
  "billing_document_items",
  "billing_document_cancellations",
  "billing_document_headers",
  "outbound_delivery_items",
  "outbound_delivery_headers",
  "sales_order_schedule_lines",
  "sales_order_items",
  "sales_order_headers",
];

export async function ingestPostgres(pool: pg.Pool, dataRoot: string, truncate = true) {
  if (truncate) {
    await pool.query(`TRUNCATE TABLE ${TRUNCATE_ORDER.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY`);
  }

  for (const [folder, table] of Object.entries(DATA_FOLDERS)) {
    const dir = path.join(dataRoot, folder);
    if (!fs.existsSync(dir)) {
      console.error(`postgres: skip missing folder ${dir}`);
      continue;
    }
    const cols = [...TABLE_COLUMNS[table], "doc"];
    const conflict = CONFLICT_TARGETS[table];
    if (!conflict) throw new Error(`No conflict target for ${table}`);

    const setClause = cols
      .filter((c) => !conflict.includes(c))
      .map((c) => `"${c}" = EXCLUDED."${c}"`)
      .join(", ");

    const conflictSql = conflict.map((c) => `"${c}"`).join(", ");
    const colSql = cols.map((c) => `"${c}"`).join(", ");
    const ph = cols.map((_, i) => `$${i + 1}`).join(", ");

    const sql = `
      INSERT INTO "${table}" (${colSql})
      VALUES (${ph})
      ON CONFLICT (${conflictSql}) DO UPDATE SET ${setClause}
    `;

    let n = 0;
    for await (const { obj } of readJsonlFiles(dir)) {
      const row = rowToInsert(table, obj);
      const values = cols.map((c) => row[c] ?? null);
      await pool.query(sql, values);
      n++;
    }
    console.error(`postgres: ${table} <- ${folder}: ${n} rows`);
  }
}
