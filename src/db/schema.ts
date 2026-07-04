import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const persons = sqliteTable("person", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
});

export const months = sqliteTable(
  "month",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1-12
    status: text("status", { enum: ["open", "closed"] })
      .notNull()
      .default("open"),
  },
  (t) => [uniqueIndex("month_year_month_unique").on(t.year, t.month)],
);

export const openingBalances = sqliteTable(
  "opening_balance",
  {
    monthId: integer("month_id")
      .notNull()
      .references(() => months.id),
    personId: integer("person_id")
      .notNull()
      .references(() => persons.id),
    // +ve = the house owes them, -ve = they owe the house
    amountCents: integer("amount_cents").notNull(),
    source: text("source", { enum: ["manual", "carried"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.monthId, t.personId] })],
);

export const bills = sqliteTable("bill", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  monthId: integer("month_id")
    .notNull()
    .references(() => months.id),
  source: text("source", { enum: ["keells", "manual"] }).notNull(),
  status: text("status", { enum: ["draft", "confirmed"] })
    .notNull()
    .default("draft"),
  payerPersonId: integer("payer_person_id").references(() => persons.id),
  billDate: text("bill_date").notNull(), // ISO date
  storeName: text("store_name"),
  transactionRef: text("transaction_ref").unique(),
  sourceUrl: text("source_url"),
  rawHtml: text("raw_html"),
  grossCents: integer("gross_cents").notNull().default(0),
  discountCents: integer("discount_cents").notNull().default(0),
  netCents: integer("net_cents").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const billItems = sqliteTable("bill_item", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  billId: integer("bill_id")
    .notNull()
    .references(() => bills.id, { onDelete: "cascade" }),
  lineNo: integer("line_no").notNull(),
  itemCode: text("item_code"),
  rawName: text("raw_name").notNull(),
  displayName: text("display_name").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  quantity: real("quantity").notNull(),
  lineTotalCents: integer("line_total_cents").notNull(),
  /** Item-wise (promotion) discount taken off this line, e.g. "25.00% Dis" */
  discountCents: integer("discount_cents").notNull().default(0),
  discountNote: text("discount_note"),
  status: text("status", { enum: ["shared", "personal", "excluded"] })
    .notNull()
    .default("shared"),
  ownerPersonId: integer("owner_person_id").references(() => persons.id),
});

export const billDiscounts = sqliteTable("bill_discount", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  billId: integer("bill_id")
    .notNull()
    .references(() => bills.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
});

export const repayments = sqliteTable("repayment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  monthId: integer("month_id")
    .notNull()
    .references(() => months.id),
  fromPersonId: integer("from_person_id")
    .notNull()
    .references(() => persons.id),
  toPersonId: integer("to_person_id")
    .notNull()
    .references(() => persons.id),
  amountCents: integer("amount_cents").notNull(),
  paidDate: text("paid_date").notNull(), // ISO date
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const itemAliases = sqliteTable("item_alias", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // item_code when the source provides one, else the normalized raw name
  matchKey: text("match_key").notNull().unique(),
  friendlyName: text("friendly_name").notNull(),
});

export type Person = typeof persons.$inferSelect;
export type Month = typeof months.$inferSelect;
export type OpeningBalance = typeof openingBalances.$inferSelect;
export type Bill = typeof bills.$inferSelect;
export type BillItem = typeof billItems.$inferSelect;
export type BillDiscount = typeof billDiscounts.$inferSelect;
export type Repayment = typeof repayments.$inferSelect;
export type ItemAlias = typeof itemAliases.$inferSelect;
