import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * pg merges `parse(connectionString)` over Pool config; URL `sslmode` / `sslrootcert`
 * produce `ssl: {}` that overwrites an explicit `ssl.ca`. Strip TLS query params so
 * `ssl: { ca: ... }` from createPool is preserved (fixes Aiven + ca.pem).
 */
function stripSslQueryParamsFromConnectionString(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    const strip = new Set([
      "sslmode",
      "ssl",
      "sslrootcert",
      "sslcert",
      "sslkey",
      "sslpassword",
      "uselibpqcompat",
    ]);
    for (const key of [...u.searchParams.keys()]) {
      if (strip.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return connectionString;
  }
}

/** Default: backend/ca.pem (works from src/db and dist/db via two levels up). */
function resolveCaPath(): string | null {
  const fromEnv = process.env.PGSSL_CA ?? process.env.DATABASE_SSL_CA;
  const candidates: string[] = [];
  if (fromEnv) {
    candidates.push(path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv));
  }
  candidates.push(path.join(__dirname, "..", "..", "ca.pem"));
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return path.resolve(p);
    } catch {
      /* continue */
    }
  }
  return null;
}

/**
 * CA for Aiven / managed Postgres. Order:
 * 1) DATABASE_SSL_CA_PEM or PGSSL_CA_PEM — full PEM text (required on Vercel; no file on disk).
 * 2) DATABASE_SSL_CA_BASE64 or PGSSL_CA_BASE64 — base64-encoded PEM (easier in some dashboards).
 * 3) File from PGSSL_CA / DATABASE_SSL_CA / backend/ca.pem
 */
function resolveCaBuffer(): Buffer | null {
  const inline =
    process.env.DATABASE_SSL_CA_PEM ?? process.env.PGSSL_CA_PEM ?? process.env.AIVEN_CA_PEM;
  if (inline?.trim()) {
    const normalized = inline.trim().replace(/\\n/g, "\n");
    return Buffer.from(normalized, "utf8");
  }

  const b64 =
    process.env.DATABASE_SSL_CA_BASE64 ??
    process.env.PGSSL_CA_BASE64 ??
    process.env.AIVEN_CA_BASE64;
  if (b64?.trim()) {
    try {
      return Buffer.from(b64.trim(), "base64");
    } catch {
      /* fall through */
    }
  }

  const caPath = resolveCaPath();
  if (caPath) {
    return fs.readFileSync(caPath);
  }

  return null;
}

function poolSslOptions(): { rejectUnauthorized: boolean; ca?: Buffer } | undefined {
  if (process.env.DATABASE_SSL === "false") return undefined;

  const needsSsl =
    process.env.DATABASE_SSL === "true" ||
    /(?:sslmode=require|aivencloud\.com)/i.test(process.env.DATABASE_URL ?? "");

  const ca = resolveCaBuffer();
  if (ca) {
    return {
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
      ca,
    };
  }

  if (needsSsl) {
    console.warn(
      "postgres: SSL expected (Aiven/remote) but no CA found. Set DATABASE_SSL_CA_PEM (or PGSSL_CA_PEM) with your CA PEM text in Vercel env, or DATABASE_SSL_CA_BASE64, or PGSSL_CA to a path on disk (local only).",
    );
    return { rejectUnauthorized: true };
  }

  return undefined;
}

export function createPool(connectionString: string) {
  const ssl = poolSslOptions();
  const connectionStringSafe =
    ssl ? stripSslQueryParamsFromConnectionString(connectionString) : connectionString;

  return new Pool({
    connectionString: connectionStringSafe,
    max: 10,
    ...(ssl ? { ssl } : {}),
  });
}

/** Full O2C schema: 19 tables matching sap-o2c-data folders. */
export const MIGRATE_SQL = `
CREATE TABLE IF NOT EXISTS sales_order_headers (
  sales_order TEXT PRIMARY KEY,
  sales_order_type TEXT,
  sales_organization TEXT,
  distribution_channel TEXT,
  organization_division TEXT,
  sales_group TEXT,
  sales_office TEXT,
  sold_to_party TEXT,
  creation_date TIMESTAMPTZ,
  created_by_user TEXT,
  last_change_date_time TIMESTAMPTZ,
  total_net_amount NUMERIC,
  overall_delivery_status TEXT,
  overall_ord_reltd_billg_status TEXT,
  overall_sd_doc_reference_status TEXT,
  transaction_currency TEXT,
  pricing_date TIMESTAMPTZ,
  requested_delivery_date TIMESTAMPTZ,
  header_billing_block_reason TEXT,
  delivery_block_reason TEXT,
  incoterms_classification TEXT,
  incoterms_location1 TEXT,
  customer_payment_terms TEXT,
  total_credit_check_status TEXT,
  doc JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS sales_order_items (
  sales_order TEXT NOT NULL,
  sales_order_item TEXT NOT NULL,
  sales_order_item_category TEXT,
  material TEXT,
  requested_quantity NUMERIC,
  requested_quantity_unit TEXT,
  transaction_currency TEXT,
  net_amount NUMERIC,
  material_group TEXT,
  production_plant TEXT,
  storage_location TEXT,
  sales_document_rjcn_reason TEXT,
  item_billing_block_reason TEXT,
  doc JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (sales_order, sales_order_item)
);

CREATE TABLE IF NOT EXISTS sales_order_schedule_lines (
  sales_order TEXT NOT NULL,
  sales_order_item TEXT NOT NULL,
  schedule_line TEXT NOT NULL,
  confirmed_delivery_date TIMESTAMPTZ,
  order_quantity_unit TEXT,
  confd_order_qty_by_matl_avail_check NUMERIC,
  doc JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (sales_order, sales_order_item, schedule_line)
);

CREATE TABLE IF NOT EXISTS outbound_delivery_headers (
  delivery_document TEXT PRIMARY KEY,
  actual_goods_movement_date TIMESTAMPTZ,
  actual_goods_movement_time JSONB,
  creation_date TIMESTAMPTZ,
  creation_time JSONB,
  delivery_block_reason TEXT,
  hdr_general_incompletion_status TEXT,
  header_billing_block_reason TEXT,
  last_change_date TIMESTAMPTZ,
  overall_goods_movement_status TEXT,
  overall_picking_status TEXT,
  overall_proof_of_delivery_status TEXT,
  shipping_point TEXT,
  doc JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS outbound_delivery_items (
  delivery_document TEXT NOT NULL,
  delivery_document_item TEXT NOT NULL,
  actual_delivery_quantity NUMERIC,
  batch TEXT,
  delivery_quantity_unit TEXT,
  item_billing_block_reason TEXT,
  last_change_date TIMESTAMPTZ,
  plant TEXT,
  reference_sd_document TEXT,
  reference_sd_document_item TEXT,
  storage_location TEXT,
  doc JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (delivery_document, delivery_document_item)
);

CREATE TABLE IF NOT EXISTS billing_document_headers (
  billing_document TEXT PRIMARY KEY,
  billing_document_type TEXT,
  creation_date TIMESTAMPTZ,
  creation_time JSONB,
  last_change_date_time TIMESTAMPTZ,
  billing_document_date TIMESTAMPTZ,
  billing_document_is_cancelled BOOLEAN,
  cancelled_billing_document TEXT,
  total_net_amount NUMERIC,
  transaction_currency TEXT,
  company_code TEXT,
  fiscal_year TEXT,
  accounting_document TEXT,
  sold_to_party TEXT,
  doc JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS billing_document_items (
  billing_document TEXT NOT NULL,
  billing_document_item TEXT NOT NULL,
  material TEXT,
  billing_quantity NUMERIC,
  billing_quantity_unit TEXT,
  net_amount NUMERIC,
  transaction_currency TEXT,
  reference_sd_document TEXT,
  reference_sd_document_item TEXT,
  doc JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (billing_document, billing_document_item)
);

CREATE TABLE IF NOT EXISTS billing_document_cancellations (
  billing_document TEXT PRIMARY KEY,
  billing_document_type TEXT,
  creation_date TIMESTAMPTZ,
  creation_time JSONB,
  last_change_date_time TIMESTAMPTZ,
  billing_document_date TIMESTAMPTZ,
  billing_document_is_cancelled BOOLEAN,
  cancelled_billing_document TEXT,
  total_net_amount NUMERIC,
  transaction_currency TEXT,
  company_code TEXT,
  fiscal_year TEXT,
  accounting_document TEXT,
  sold_to_party TEXT,
  doc JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS journal_entry_items_accounts_receivable (
  company_code TEXT NOT NULL,
  fiscal_year TEXT NOT NULL,
  accounting_document TEXT NOT NULL,
  accounting_document_item TEXT NOT NULL,
  gl_account TEXT,
  reference_document TEXT,
  cost_center TEXT,
  profit_center TEXT,
  transaction_currency TEXT,
  amount_in_transaction_currency NUMERIC,
  company_code_currency TEXT,
  amount_in_company_code_currency NUMERIC,
  posting_date TIMESTAMPTZ,
  document_date TIMESTAMPTZ,
  accounting_document_type TEXT,
  assignment_reference TEXT,
  last_change_date_time TIMESTAMPTZ,
  customer TEXT,
  financial_account_type TEXT,
  clearing_date TIMESTAMPTZ,
  clearing_accounting_document TEXT,
  clearing_doc_fiscal_year TEXT,
  doc JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_code, fiscal_year, accounting_document, accounting_document_item)
);

CREATE TABLE IF NOT EXISTS payments_accounts_receivable (
  company_code TEXT NOT NULL,
  fiscal_year TEXT NOT NULL,
  accounting_document TEXT NOT NULL,
  accounting_document_item TEXT NOT NULL,
  clearing_date TIMESTAMPTZ,
  clearing_accounting_document TEXT,
  clearing_doc_fiscal_year TEXT,
  amount_in_transaction_currency NUMERIC,
  transaction_currency TEXT,
  amount_in_company_code_currency NUMERIC,
  company_code_currency TEXT,
  customer TEXT,
  invoice_reference TEXT,
  invoice_reference_fiscal_year TEXT,
  sales_document TEXT,
  sales_document_item TEXT,
  posting_date TIMESTAMPTZ,
  document_date TIMESTAMPTZ,
  assignment_reference TEXT,
  gl_account TEXT,
  financial_account_type TEXT,
  profit_center TEXT,
  cost_center TEXT,
  doc JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_code, fiscal_year, accounting_document, accounting_document_item)
);

CREATE TABLE IF NOT EXISTS business_partners (
  business_partner TEXT PRIMARY KEY,
  customer TEXT,
  business_partner_category TEXT,
  business_partner_full_name TEXT,
  business_partner_grouping TEXT,
  business_partner_name TEXT,
  correspondence_language TEXT,
  created_by_user TEXT,
  creation_date TIMESTAMPTZ,
  creation_time JSONB,
  first_name TEXT,
  form_of_address TEXT,
  industry TEXT,
  last_change_date TIMESTAMPTZ,
  last_name TEXT,
  organization_bp_name1 TEXT,
  organization_bp_name2 TEXT,
  business_partner_is_blocked BOOLEAN,
  is_marked_for_archiving BOOLEAN,
  doc JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS business_partner_addresses (
  business_partner TEXT NOT NULL,
  address_id TEXT NOT NULL,
  validity_start_date TIMESTAMPTZ,
  validity_end_date TIMESTAMPTZ,
  address_uuid TEXT,
  address_time_zone TEXT,
  city_name TEXT,
  country TEXT,
  po_box TEXT,
  po_box_deviating_city_name TEXT,
  po_box_deviating_country TEXT,
  po_box_deviating_region TEXT,
  po_box_is_without_number BOOLEAN,
  po_box_lobby_name TEXT,
  po_box_postal_code TEXT,
  postal_code TEXT,
  region TEXT,
  street_name TEXT,
  tax_jurisdiction TEXT,
  transport_zone TEXT,
  doc JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (business_partner, address_id)
);

CREATE TABLE IF NOT EXISTS customer_company_assignments (
  customer TEXT NOT NULL,
  company_code TEXT NOT NULL,
  accounting_clerk TEXT,
  accounting_clerk_fax_number TEXT,
  accounting_clerk_internet_address TEXT,
  accounting_clerk_phone_number TEXT,
  alternative_payer_account TEXT,
  payment_blocking_reason TEXT,
  payment_methods_list TEXT,
  payment_terms TEXT,
  reconciliation_account TEXT,
  deletion_indicator BOOLEAN,
  customer_account_group TEXT,
  doc JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (customer, company_code)
);

CREATE TABLE IF NOT EXISTS customer_sales_area_assignments (
  customer TEXT NOT NULL,
  sales_organization TEXT NOT NULL,
  distribution_channel TEXT NOT NULL,
  division TEXT NOT NULL,
  billing_is_blocked_for_customer TEXT,
  complete_delivery_is_defined BOOLEAN,
  credit_control_area TEXT,
  currency TEXT,
  customer_payment_terms TEXT,
  delivery_priority TEXT,
  incoterms_classification TEXT,
  incoterms_location1 TEXT,
  sales_group TEXT,
  sales_office TEXT,
  shipping_condition TEXT,
  sls_unlmtd_ovrdeliv_is_allwd BOOLEAN,
  supplying_plant TEXT,
  sales_district TEXT,
  exchange_rate_type TEXT,
  doc JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (customer, sales_organization, distribution_channel, division)
);

CREATE TABLE IF NOT EXISTS products (
  product TEXT PRIMARY KEY,
  product_type TEXT,
  cross_plant_status TEXT,
  cross_plant_status_validity_date TIMESTAMPTZ,
  creation_date TIMESTAMPTZ,
  created_by_user TEXT,
  last_change_date TIMESTAMPTZ,
  last_change_date_time TIMESTAMPTZ,
  is_marked_for_deletion BOOLEAN,
  product_old_id TEXT,
  gross_weight NUMERIC,
  weight_unit TEXT,
  net_weight NUMERIC,
  product_group TEXT,
  base_unit TEXT,
  division TEXT,
  industry_sector TEXT,
  doc JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS product_descriptions (
  product TEXT NOT NULL,
  language TEXT NOT NULL,
  product_description TEXT,
  doc JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (product, language)
);

CREATE TABLE IF NOT EXISTS product_plants (
  product TEXT NOT NULL,
  plant TEXT NOT NULL,
  country_of_origin TEXT,
  region_of_origin TEXT,
  production_invtry_managed_loc TEXT,
  availability_check_type TEXT,
  fiscal_year_variant TEXT,
  profit_center TEXT,
  mrp_type TEXT,
  doc JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (product, plant)
);

CREATE TABLE IF NOT EXISTS product_storage_locations (
  product TEXT NOT NULL,
  plant TEXT NOT NULL,
  storage_location TEXT NOT NULL,
  physical_inventory_block_ind TEXT,
  date_of_last_posted_cnt_un_rstrcd_stk TIMESTAMPTZ,
  doc JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (product, plant, storage_location)
);

CREATE TABLE IF NOT EXISTS plants (
  plant TEXT PRIMARY KEY,
  plant_name TEXT,
  valuation_area TEXT,
  plant_customer TEXT,
  plant_supplier TEXT,
  factory_calendar TEXT,
  default_purchasing_organization TEXT,
  sales_organization TEXT,
  address_id TEXT,
  plant_category TEXT,
  distribution_channel TEXT,
  division TEXT,
  language TEXT,
  is_marked_for_archiving BOOLEAN,
  doc JSONB NOT NULL DEFAULT '{}'
);
`;

/** Dodge AI chat: conversations + one row per message (role/content columns). Applied after O2C DDL. */
export const CHAT_STORAGE_MIGRATE_SQL = `
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_role_chk CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id_created
  ON chat_messages (conversation_id, id);
`;

export async function migrate(pool: pg.Pool) {
  await pool.query(MIGRATE_SQL);
  await pool.query(CHAT_STORAGE_MIGRATE_SQL);
}
