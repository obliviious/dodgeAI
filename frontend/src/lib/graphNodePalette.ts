/** Neo4j labels used in O2C graph — matches ingestion. */
export const NODE_TYPE_PALETTE: Record<string, { fill: string; border: string }> = {
  SalesOrder: { fill: "#60a5fa", border: "#1e40af" },
  Delivery: { fill: "#22d3ee", border: "#0e7490" },
  BillingDocument: { fill: "#a78bfa", border: "#5b21b6" },
  JournalEntry: { fill: "#2dd4bf", border: "#0f766e" },
  Payment: { fill: "#4ade80", border: "#166534" },
  BusinessPartner: { fill: "#f472b6", border: "#9d174d" },
  Product: { fill: "#fb923c", border: "#9a3412" },
  Plant: { fill: "#bef264", border: "#3f6212" },
  SalesOrderItem: { fill: "#fca5a5", border: "#991b1b" },
};

export const NODE_DEFAULT_PALETTE = { fill: "#cbd5e1", border: "#475569" };

export const GRANULAR_LABELS = new Set([
  "SalesOrderItem",
  "Product",
  "Plant",
  "BusinessPartner",
]);

/** Legend rows: document key → short UI title. */
export const GRAPH_LEGEND_ROWS: { typeKey: string; label: string }[] = [
  { typeKey: "SalesOrder", label: "Sales order" },
  { typeKey: "Delivery", label: "Delivery" },
  { typeKey: "BillingDocument", label: "Billing / invoice" },
  { typeKey: "JournalEntry", label: "Journal entry" },
  { typeKey: "Payment", label: "Payment" },
  { typeKey: "BusinessPartner", label: "Customer / partner" },
  { typeKey: "Product", label: "Product" },
  { typeKey: "Plant", label: "Plant" },
  { typeKey: "SalesOrderItem", label: "Order line item" },
  { typeKey: "__other__", label: "Other" },
];

export function paletteForLabel(label: string) {
  return NODE_TYPE_PALETTE[label] ?? NODE_DEFAULT_PALETTE;
}
