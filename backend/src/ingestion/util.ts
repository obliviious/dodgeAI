import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

/** camelCase or lowerCamel to snake_case */
export function toSnakeCase(key: string): string {
  return key
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

export function keysToSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[toSnakeCase(k)] = v;
  }
  return out;
}

const ISO = /^\d{4}-\d{2}-\d{2}T/;
export function coerceValue(
  col: string,
  val: unknown,
  jsonbCols: Set<string>,
): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val;
  if (typeof val === "object") {
    return jsonbCols.has(col) ? val : JSON.stringify(val);
  }
  if (typeof val === "string") {
    if (val === "") {
      if (col.endsWith("_date") || col.endsWith("_date_time")) return null;
      return val;
    }
    if ((col.endsWith("_date") || col.endsWith("_date_time")) && ISO.test(val)) {
      return val;
    }
    if (
      col.includes("_amount") ||
      col.includes("_quantity") ||
      col === "total_net_amount" ||
      col === "net_amount" ||
      col === "requested_quantity" ||
      col === "billing_quantity" ||
      col === "actual_delivery_quantity" ||
      col === "confd_order_qty_by_matl_avail_check" ||
      col === "gross_weight" ||
      col === "net_weight" ||
      col === "amount_in_transaction_currency" ||
      col === "amount_in_company_code_currency"
    ) {
      const n = Number(val);
      return Number.isFinite(n) ? n : null;
    }
    return val;
  }
  return val;
}

export async function* readJsonlFiles(dir: string): AsyncGenerator<{ file: string; obj: Record<string, unknown> }> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".jsonl")) continue;
    const file = path.join(dir, e.name);
    const stream = fs.createReadStream(file, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      const t = line.trim();
      if (!t) continue;
      try {
        const obj = JSON.parse(t) as Record<string, unknown>;
        yield { file, obj };
      } catch {
        /* skip bad line */
      }
    }
  }
}

export const DATA_FOLDERS: Record<string, string> = {
  sales_order_headers: "sales_order_headers",
  sales_order_items: "sales_order_items",
  sales_order_schedule_lines: "sales_order_schedule_lines",
  outbound_delivery_headers: "outbound_delivery_headers",
  outbound_delivery_items: "outbound_delivery_items",
  billing_document_headers: "billing_document_headers",
  billing_document_items: "billing_document_items",
  billing_document_cancellations: "billing_document_cancellations",
  journal_entry_items_accounts_receivable: "journal_entry_items_accounts_receivable",
  payments_accounts_receivable: "payments_accounts_receivable",
  business_partners: "business_partners",
  business_partner_addresses: "business_partner_addresses",
  customer_company_assignments: "customer_company_assignments",
  customer_sales_area_assignments: "customer_sales_area_assignments",
  products: "products",
  product_descriptions: "product_descriptions",
  product_plants: "product_plants",
  product_storage_locations: "product_storage_locations",
  plants: "plants",
};

/** snake_case column names per table (excluding doc) */
export const TABLE_COLUMNS: Record<string, string[]> = {
  sales_order_headers: [
    "sales_order",
    "sales_order_type",
    "sales_organization",
    "distribution_channel",
    "organization_division",
    "sales_group",
    "sales_office",
    "sold_to_party",
    "creation_date",
    "created_by_user",
    "last_change_date_time",
    "total_net_amount",
    "overall_delivery_status",
    "overall_ord_reltd_billg_status",
    "overall_sd_doc_reference_status",
    "transaction_currency",
    "pricing_date",
    "requested_delivery_date",
    "header_billing_block_reason",
    "delivery_block_reason",
    "incoterms_classification",
    "incoterms_location1",
    "customer_payment_terms",
    "total_credit_check_status",
  ],
  sales_order_items: [
    "sales_order",
    "sales_order_item",
    "sales_order_item_category",
    "material",
    "requested_quantity",
    "requested_quantity_unit",
    "transaction_currency",
    "net_amount",
    "material_group",
    "production_plant",
    "storage_location",
    "sales_document_rjcn_reason",
    "item_billing_block_reason",
  ],
  sales_order_schedule_lines: [
    "sales_order",
    "sales_order_item",
    "schedule_line",
    "confirmed_delivery_date",
    "order_quantity_unit",
    "confd_order_qty_by_matl_avail_check",
  ],
  outbound_delivery_headers: [
    "delivery_document",
    "actual_goods_movement_date",
    "actual_goods_movement_time",
    "creation_date",
    "creation_time",
    "delivery_block_reason",
    "hdr_general_incompletion_status",
    "header_billing_block_reason",
    "last_change_date",
    "overall_goods_movement_status",
    "overall_picking_status",
    "overall_proof_of_delivery_status",
    "shipping_point",
  ],
  outbound_delivery_items: [
    "delivery_document",
    "delivery_document_item",
    "actual_delivery_quantity",
    "batch",
    "delivery_quantity_unit",
    "item_billing_block_reason",
    "last_change_date",
    "plant",
    "reference_sd_document",
    "reference_sd_document_item",
    "storage_location",
  ],
  billing_document_headers: [
    "billing_document",
    "billing_document_type",
    "creation_date",
    "creation_time",
    "last_change_date_time",
    "billing_document_date",
    "billing_document_is_cancelled",
    "cancelled_billing_document",
    "total_net_amount",
    "transaction_currency",
    "company_code",
    "fiscal_year",
    "accounting_document",
    "sold_to_party",
  ],
  billing_document_items: [
    "billing_document",
    "billing_document_item",
    "material",
    "billing_quantity",
    "billing_quantity_unit",
    "net_amount",
    "transaction_currency",
    "reference_sd_document",
    "reference_sd_document_item",
  ],
  billing_document_cancellations: [
    "billing_document",
    "billing_document_type",
    "creation_date",
    "creation_time",
    "last_change_date_time",
    "billing_document_date",
    "billing_document_is_cancelled",
    "cancelled_billing_document",
    "total_net_amount",
    "transaction_currency",
    "company_code",
    "fiscal_year",
    "accounting_document",
    "sold_to_party",
  ],
  journal_entry_items_accounts_receivable: [
    "company_code",
    "fiscal_year",
    "accounting_document",
    "accounting_document_item",
    "gl_account",
    "reference_document",
    "cost_center",
    "profit_center",
    "transaction_currency",
    "amount_in_transaction_currency",
    "amount_in_company_code_currency",
    "company_code_currency",
    "posting_date",
    "document_date",
    "accounting_document_type",
    "assignment_reference",
    "last_change_date_time",
    "customer",
    "financial_account_type",
    "clearing_date",
    "clearing_accounting_document",
    "clearing_doc_fiscal_year",
  ],
  payments_accounts_receivable: [
    "company_code",
    "fiscal_year",
    "accounting_document",
    "accounting_document_item",
    "clearing_date",
    "clearing_accounting_document",
    "clearing_doc_fiscal_year",
    "amount_in_transaction_currency",
    "transaction_currency",
    "amount_in_company_code_currency",
    "company_code_currency",
    "customer",
    "invoice_reference",
    "invoice_reference_fiscal_year",
    "sales_document",
    "sales_document_item",
    "posting_date",
    "document_date",
    "assignment_reference",
    "gl_account",
    "financial_account_type",
    "profit_center",
    "cost_center",
  ],
  business_partners: [
    "business_partner",
    "customer",
    "business_partner_category",
    "business_partner_full_name",
    "business_partner_grouping",
    "business_partner_name",
    "correspondence_language",
    "created_by_user",
    "creation_date",
    "creation_time",
    "first_name",
    "form_of_address",
    "industry",
    "last_change_date",
    "last_name",
    "organization_bp_name1",
    "organization_bp_name2",
    "business_partner_is_blocked",
    "is_marked_for_archiving",
  ],
  business_partner_addresses: [
    "business_partner",
    "address_id",
    "validity_start_date",
    "validity_end_date",
    "address_uuid",
    "address_time_zone",
    "city_name",
    "country",
    "po_box",
    "po_box_deviating_city_name",
    "po_box_deviating_country",
    "po_box_deviating_region",
    "po_box_is_without_number",
    "po_box_lobby_name",
    "po_box_postal_code",
    "postal_code",
    "region",
    "street_name",
    "tax_jurisdiction",
    "transport_zone",
  ],
  customer_company_assignments: [
    "customer",
    "company_code",
    "accounting_clerk",
    "accounting_clerk_fax_number",
    "accounting_clerk_internet_address",
    "accounting_clerk_phone_number",
    "alternative_payer_account",
    "payment_blocking_reason",
    "payment_methods_list",
    "payment_terms",
    "reconciliation_account",
    "deletion_indicator",
    "customer_account_group",
  ],
  customer_sales_area_assignments: [
    "customer",
    "sales_organization",
    "distribution_channel",
    "division",
    "billing_is_blocked_for_customer",
    "complete_delivery_is_defined",
    "credit_control_area",
    "currency",
    "customer_payment_terms",
    "delivery_priority",
    "incoterms_classification",
    "incoterms_location1",
    "sales_group",
    "sales_office",
    "shipping_condition",
    "sls_unlmtd_ovrdeliv_is_allwd",
    "supplying_plant",
    "sales_district",
    "exchange_rate_type",
  ],
  products: [
    "product",
    "product_type",
    "cross_plant_status",
    "cross_plant_status_validity_date",
    "creation_date",
    "created_by_user",
    "last_change_date",
    "last_change_date_time",
    "is_marked_for_deletion",
    "product_old_id",
    "gross_weight",
    "weight_unit",
    "net_weight",
    "product_group",
    "base_unit",
    "division",
    "industry_sector",
  ],
  product_descriptions: ["product", "language", "product_description"],
  product_plants: [
    "product",
    "plant",
    "country_of_origin",
    "region_of_origin",
    "production_invtry_managed_loc",
    "availability_check_type",
    "fiscal_year_variant",
    "profit_center",
    "mrp_type",
  ],
  product_storage_locations: [
    "product",
    "plant",
    "storage_location",
    "physical_inventory_block_ind",
    "date_of_last_posted_cnt_un_rstrcd_stk",
  ],
  plants: [
    "plant",
    "plant_name",
    "valuation_area",
    "plant_customer",
    "plant_supplier",
    "factory_calendar",
    "default_purchasing_organization",
    "sales_organization",
    "address_id",
    "plant_category",
    "distribution_channel",
    "division",
    "language",
    "is_marked_for_archiving",
  ],
};

const JSONB_COLS_BY_TABLE: Record<string, Set<string>> = {
  outbound_delivery_headers: new Set([
    "actual_goods_movement_time",
    "creation_time",
  ]),
  billing_document_headers: new Set(["creation_time"]),
  billing_document_cancellations: new Set(["creation_time"]),
  business_partners: new Set(["creation_time"]),
};

export function jsonbColsForTable(table: string): Set<string> {
  return JSONB_COLS_BY_TABLE[table] ?? new Set();
}

export function rowToInsert(
  table: string,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const snake = keysToSnake(raw);
  const cols = TABLE_COLUMNS[table];
  const j = jsonbColsForTable(table);
  const row: Record<string, unknown> = { doc: raw };
  for (const col of cols) {
    if (!(col in snake)) continue;
    row[col] = coerceValue(col, snake[col], j);
  }
  return row;
}
