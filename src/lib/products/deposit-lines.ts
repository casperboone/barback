import { sql } from "drizzle-orm";
import { db } from "@/db";
import { toDay } from "@/lib/items/quantity-history";
import type { DepositLine } from "./deposits";
import { DEPOSIT_MATCH } from "./purchases";

// Every deposit line on the imported invoices and credit notes, plus the date
// of the first document, which is where the balance starts counting. Open
// orders are left out: their deposit is only charged once they are invoiced.
export async function getDepositLines(): Promise<{
  lines: DepositLine[];
  since: Date | null;
}> {
  const [rows, [first]] = await Promise.all([
    db.all<{
      document_no: string;
      document_type: "invoice" | "creditmemo";
      document_date: number;
      item_no: string;
      description: string | null;
      quantity: number;
      unit_price: number | null;
      amount: number | null;
    }>(sql`
      select document_no, document_type, document_date, item_no, description,
             quantity, unit_price, amount
      from supplier_invoice_lines
      where document_type in ('invoice', 'creditmemo')
        and document_date is not null
        and quantity is not null
        and ${DEPOSIT_MATCH}
      order by document_date, id
    `),
    db.all<{ first: number | null }>(sql`
      select min(document_date) as first
      from supplier_invoice_lines
      where document_type in ('invoice', 'creditmemo')
    `),
  ]);

  return {
    lines: rows.map((row) => ({
      documentNo: row.document_no,
      documentType: row.document_type,
      day: toDay(new Date(row.document_date * 1000)),
      itemNo: row.item_no,
      description: row.description,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      // Deposit lines carry no discount, so this is the quantity times the price.
      amount: row.amount ?? row.quantity * (row.unit_price ?? 0),
    })),
    since: first?.first ? new Date(first.first * 1000) : null,
  };
}
