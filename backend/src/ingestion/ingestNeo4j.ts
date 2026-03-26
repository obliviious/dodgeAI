import type pg from "pg";
import type { Driver, Session } from "neo4j-driver";
import { documentPropertiesForNeo4j } from "./neo4jDocumentProperties.js";

const BATCH = 400;

/** Attach Neo4j-safe `props` map (no nested maps) for every row that carries `doc`. */
function rowsWithNeo4jProps(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    ...row,
    props: documentPropertiesForNeo4j(row.doc),
  }));
}

async function runBatch(session: Session, cypher: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  await session.executeWrite((tx) => tx.run(cypher, { rows }));
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function ingestNeo4j(pool: pg.Pool, driver: Driver) {
  const session = driver.session();
  try {
    await session.executeWrite((tx) => tx.run("MATCH (n) DETACH DELETE n"));

    const constraints = [
      "CREATE CONSTRAINT sales_order_uniq IF NOT EXISTS FOR (n:SalesOrder) REQUIRE n.sales_order IS UNIQUE",
      "CREATE CONSTRAINT delivery_uniq IF NOT EXISTS FOR (n:Delivery) REQUIRE n.delivery_document IS UNIQUE",
      "CREATE CONSTRAINT billing_uniq IF NOT EXISTS FOR (n:BillingDocument) REQUIRE n.billing_document IS UNIQUE",
      "CREATE CONSTRAINT journal_uniq IF NOT EXISTS FOR (n:JournalEntry) REQUIRE n.journal_key IS UNIQUE",
      "CREATE CONSTRAINT payment_uniq IF NOT EXISTS FOR (n:Payment) REQUIRE n.payment_key IS UNIQUE",
      "CREATE CONSTRAINT bp_uniq IF NOT EXISTS FOR (n:BusinessPartner) REQUIRE n.business_partner IS UNIQUE",
      "CREATE CONSTRAINT product_uniq IF NOT EXISTS FOR (n:Product) REQUIRE n.product IS UNIQUE",
      "CREATE CONSTRAINT plant_uniq IF NOT EXISTS FOR (n:Plant) REQUIRE n.plant IS UNIQUE",
      "CREATE CONSTRAINT so_item_uniq IF NOT EXISTS FOR (n:SalesOrderItem) REQUIRE n.item_key IS UNIQUE",
    ];
    for (const c of constraints) {
      try {
        await session.executeWrite((tx) => tx.run(c));
      } catch {
        /* ignore duplicate */
      }
    }

    const bpRows = (await pool.query(`SELECT business_partner, doc FROM business_partners`)).rows;
    for (const batch of chunks(bpRows, BATCH)) {
      await runBatch(
        session,
        `
        UNWIND $rows AS row
        MERGE (b:BusinessPartner { business_partner: row.business_partner })
        SET b += row.props,
            b.gid = 'BusinessPartner:' + row.business_partner
        `,
        rowsWithNeo4jProps(batch),
      );
    }

    const plantRows = (await pool.query(`SELECT plant, doc FROM plants`)).rows;
    for (const batch of chunks(plantRows, BATCH)) {
      await runBatch(
        session,
        `
        UNWIND $rows AS row
        MERGE (p:Plant { plant: row.plant })
        SET p += row.props,
            p.gid = 'Plant:' + row.plant
        `,
        rowsWithNeo4jProps(batch),
      );
    }

    const prodRows = (await pool.query(`SELECT product, doc FROM products`)).rows;
    for (const batch of chunks(prodRows, BATCH)) {
      await runBatch(
        session,
        `
        UNWIND $rows AS row
        MERGE (pr:Product { product: row.product })
        SET pr += row.props,
            pr.gid = 'Product:' + row.product
        `,
        rowsWithNeo4jProps(batch),
      );
    }

    const soRows = (await pool.query(`SELECT sales_order, doc FROM sales_order_headers`)).rows;
    for (const batch of chunks(soRows, BATCH)) {
      await runBatch(
        session,
        `
        UNWIND $rows AS row
        MERGE (so:SalesOrder { sales_order: row.sales_order })
        SET so += row.props,
            so.gid = 'SalesOrder:' + row.sales_order
        WITH so, row
        OPTIONAL MATCH (bp:BusinessPartner { business_partner: row.doc.soldToParty })
        FOREACH (_ IN CASE WHEN bp IS NULL THEN [] ELSE [1] END |
          MERGE (so)-[:SOLD_TO]->(bp))
        `,
        rowsWithNeo4jProps(batch),
      );
    }

    const itemRows = (
      await pool.query(
        `SELECT sales_order, sales_order_item, material, production_plant, doc FROM sales_order_items`,
      )
    ).rows;
    for (const batch of chunks(itemRows, BATCH)) {
      await runBatch(
        session,
        `
        UNWIND $rows AS row
        MERGE (so:SalesOrder { sales_order: row.sales_order })
        MERGE (i:SalesOrderItem { item_key: row.sales_order + '|' + row.sales_order_item })
        SET i += row.props,
            i.gid = 'SalesOrderItem:' + row.sales_order + ':' + row.sales_order_item
        MERGE (so)-[:HAS_ITEM]->(i)
        WITH i, row
        OPTIONAL MATCH (pr:Product { product: row.material })
        FOREACH (_ IN CASE WHEN pr IS NULL THEN [] ELSE [1] END |
          MERGE (i)-[:INCLUDES_PRODUCT]->(pr))
        WITH i, row
        OPTIONAL MATCH (pl:Plant { plant: row.production_plant })
        FOREACH (_ IN CASE WHEN pl IS NULL THEN [] ELSE [1] END |
          MERGE (i)-[:SUPPLIED_FROM_PLANT]->(pl))
        `,
        rowsWithNeo4jProps(batch),
      );
    }

    const delRows = (await pool.query(`SELECT delivery_document, doc FROM outbound_delivery_headers`)).rows;
    for (const batch of chunks(delRows, BATCH)) {
      await runBatch(
        session,
        `
        UNWIND $rows AS row
        MERGE (d:Delivery { delivery_document: row.delivery_document })
        SET d += row.props,
            d.gid = 'Delivery:' + row.delivery_document
        `,
        rowsWithNeo4jProps(batch),
      );
    }

    const soDel = (
      await pool.query(
        `SELECT DISTINCT delivery_document, reference_sd_document
         FROM outbound_delivery_items
         WHERE reference_sd_document IS NOT NULL AND reference_sd_document <> ''`,
      )
    ).rows;
    for (const batch of chunks(soDel, BATCH)) {
      await runBatch(
        session,
        `
        UNWIND $rows AS row
        MATCH (so:SalesOrder { sales_order: row.reference_sd_document })
        MATCH (d:Delivery { delivery_document: row.delivery_document })
        MERGE (so)-[:HAS_DELIVERY]->(d)
        `,
        batch,
      );
    }

    const billRows = (await pool.query(`SELECT billing_document, doc FROM billing_document_headers`)).rows;
    for (const batch of chunks(billRows, BATCH)) {
      await runBatch(
        session,
        `
        UNWIND $rows AS row
        MERGE (bd:BillingDocument { billing_document: row.billing_document })
        SET bd += row.props,
            bd.gid = 'BillingDocument:' + row.billing_document
        WITH bd, row
        OPTIONAL MATCH (bp:BusinessPartner { business_partner: row.doc.soldToParty })
        FOREACH (_ IN CASE WHEN bp IS NULL THEN [] ELSE [1] END |
          MERGE (bd)-[:BILL_TO]->(bp))
        `,
        rowsWithNeo4jProps(batch),
      );
    }

    const delBill = (
      await pool.query(
        `SELECT DISTINCT billing_document, reference_sd_document
         FROM billing_document_items
         WHERE reference_sd_document IS NOT NULL AND reference_sd_document <> ''`,
      )
    ).rows;
    for (const batch of chunks(delBill, BATCH)) {
      await runBatch(
        session,
        `
        UNWIND $rows AS row
        MATCH (d:Delivery { delivery_document: row.reference_sd_document })
        MATCH (bd:BillingDocument { billing_document: row.billing_document })
        MERGE (d)-[:BILLED_AS]->(bd)
        `,
        batch,
      );
    }

    const billJe = (
      await pool.query(
        `SELECT DISTINCT company_code, fiscal_year, accounting_document, billing_document
         FROM billing_document_headers
         WHERE accounting_document IS NOT NULL AND accounting_document <> ''
           AND billing_document IS NOT NULL`,
      )
    ).rows;
    for (const batch of chunks(billJe, BATCH)) {
      const rows = batch.map((r: Record<string, unknown>) => ({
        ...r,
        journal_key: `${r.company_code}|${r.fiscal_year}|${r.accounting_document}`,
      }));
      await runBatch(
        session,
        `
        UNWIND $rows AS row
        MERGE (j:JournalEntry { journal_key: row.journal_key })
        SET j.company_code = row.company_code,
            j.fiscal_year = row.fiscal_year,
            j.accounting_document = row.accounting_document,
            j.gid = 'JournalEntry:' + row.journal_key
        WITH j, row
        MATCH (bd:BillingDocument { billing_document: row.billing_document })
        MERGE (bd)-[:POSTED_AS]->(j)
        `,
        rows,
      );
    }

    const jeLines = (
      await pool.query(
        `SELECT DISTINCT ON (company_code, fiscal_year, accounting_document)
                company_code, fiscal_year, accounting_document, doc
         FROM journal_entry_items_accounts_receivable
         ORDER BY company_code, fiscal_year, accounting_document`,
      )
    ).rows;
    for (const batch of chunks(jeLines, BATCH)) {
      const rows = rowsWithNeo4jProps(
        batch.map((r: Record<string, unknown>) => ({
          ...r,
          journal_key: `${r.company_code}|${r.fiscal_year}|${r.accounting_document}`,
        })),
      );
      await runBatch(
        session,
        `
        UNWIND $rows AS row
        MATCH (j:JournalEntry { journal_key: row.journal_key })
        SET j += row.props
        `,
        rows,
      );
    }

    const payRows = (
      await pool.query(
        `SELECT company_code, fiscal_year, accounting_document, accounting_document_item, doc FROM payments_accounts_receivable`,
      )
    ).rows;
    for (const batch of chunks(payRows, BATCH)) {
      const rows = rowsWithNeo4jProps(
        batch.map((r: Record<string, unknown>) => ({
          ...r,
          payment_key: `${r.company_code}|${r.fiscal_year}|${r.accounting_document}|${r.accounting_document_item}`,
        })),
      );
      await runBatch(
        session,
        `
        UNWIND $rows AS row
        MERGE (pay:Payment { payment_key: row.payment_key })
        SET pay += row.props,
            pay.gid = 'Payment:' + row.payment_key
        `,
        rows,
      );
    }

    const jePay = (
      await pool.query(
        `SELECT DISTINCT company_code, fiscal_year, accounting_document, clearing_accounting_document
         FROM journal_entry_items_accounts_receivable
         WHERE clearing_accounting_document IS NOT NULL AND clearing_accounting_document <> ''`,
      )
    ).rows;
    for (const batch of chunks(jePay, BATCH)) {
      await runBatch(
        session,
        `
        UNWIND $rows AS row
        WITH row,
             row.company_code + '|' + row.fiscal_year + '|' + row.accounting_document AS journal_key
        MATCH (j:JournalEntry { journal_key: journal_key })
        MATCH (pay:Payment)
        WHERE pay.clearingAccountingDocument = row.clearing_accounting_document
          AND pay.companyCode = row.company_code
        MERGE (j)-[:CLEARED_BY]->(pay)
        `,
        batch,
      );
    }

    console.error("neo4j: ingest complete");
  } finally {
    await session.close();
  }
}
