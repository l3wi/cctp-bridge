import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const bridgeBurnSubmissions = sqliteTable(
  "bridge_burn_submissions",
  {
    id: text("id").primaryKey(),
    burnHash: text("burn_hash").notNull(),
    sourceChainId: text("source_chain_id").notNull(),
    targetChainId: text("target_chain_id").notNull(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    transferType: text("transfer_type", {
      enum: ["fast", "standard"],
    }).notNull(),
    // USDC atomic amounts remain below SQLite/JavaScript's safe integer range
    // for all supported bridge limits, while keeping SQL aggregation simple.
    amountAtomic: integer("amount_atomic").notNull(),
    appFeeAtomic: integer("app_fee_atomic").notNull(),
    appFeeBps: integer("app_fee_bps"),
    circleFeeAtomic: integer("circle_fee_atomic").notNull(),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull(),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("bridge_burn_submissions_chain_hash_idx").on(
      table.sourceChainId,
      table.burnHash
    ),
    index("bridge_burn_submissions_submitted_at_idx").on(table.submittedAt),
    index("bridge_burn_submissions_transfer_type_idx").on(table.transferType),
    // Covers the rolling volume/fee/count report without reading table rows.
    index("bridge_burn_submissions_statistics_idx").on(
      table.submittedAt,
      table.transferType,
      table.amountAtomic,
      table.appFeeAtomic
    ),
    index("bridge_burn_submissions_route_idx").on(
      table.sourceChainId,
      table.targetChainId
    ),
    check(
      "bridge_burn_submissions_transfer_type_check",
      sql`${table.transferType} in ('fast', 'standard')`
    ),
    check(
      "bridge_burn_submissions_amounts_non_negative_check",
      sql`${table.amountAtomic} >= 0 and ${table.appFeeAtomic} >= 0 and ${table.circleFeeAtomic} >= 0`
    ),
  ]
);

export type BridgeBurnSubmission = typeof bridgeBurnSubmissions.$inferSelect;
export type NewBridgeBurnSubmission = typeof bridgeBurnSubmissions.$inferInsert;

// Separate from best-effort analytics: only verified burns advance these balances.
export const standardFeeAccounts = sqliteTable("standard_fee_accounts", {
  address: text("address").primaryKey(),
  volumeAtomic: integer("volume_atomic").notNull().default(0),
  nextThresholdAtomic: integer("next_threshold_atomic").notNull().default(1_000_000_000_000),
  feesPaidAtomic: integer("fees_paid_atomic").notNull().default(0),
  activeReservationId: text("active_reservation_id"),
});

export const standardFeeReservations = sqliteTable("standard_fee_reservations", {
  id: text("id").primaryKey(),
  token: text("token").notNull(),
  address: text("address").notNull(),
  sourceChainId: text("source_chain_id").notNull(),
  amountAtomic: integer("amount_atomic").notNull(),
  feeAtomic: integer("fee_atomic").notNull(),
  recipient: text("recipient").notNull(),
  nextThresholdAtomic: integer("next_threshold_atomic").notNull(),
  status: text("status", { enum: ["reserved", "broadcasting", "submitted", "confirmed", "cancelled", "failed"] }).notNull(),
  burnHash: text("burn_hash"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("standard_fee_burn_idx").on(table.sourceChainId, table.burnHash),
  index("standard_fee_account_idx").on(table.address, table.status),
]);
