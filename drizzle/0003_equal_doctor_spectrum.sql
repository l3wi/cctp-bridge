CREATE TABLE `standard_fee_accounts` (
	`address` text PRIMARY KEY NOT NULL,
	`volume_atomic` integer DEFAULT 0 NOT NULL,
	`next_threshold_atomic` integer DEFAULT 1000000000000 NOT NULL,
	`fees_paid_atomic` integer DEFAULT 0 NOT NULL,
	`active_reservation_id` text
);
--> statement-breakpoint
CREATE TABLE `standard_fee_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`address` text NOT NULL,
	`source_chain_id` text NOT NULL,
	`amount_atomic` integer NOT NULL,
	`fee_atomic` integer NOT NULL,
	`recipient` text NOT NULL,
	`next_threshold_atomic` integer NOT NULL,
	`status` text NOT NULL,
	`burn_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `standard_fee_burn_idx` ON `standard_fee_reservations` (`source_chain_id`,`burn_hash`);--> statement-breakpoint
CREATE INDEX `standard_fee_account_idx` ON `standard_fee_reservations` (`address`,`status`);
--> statement-breakpoint
-- Freeze current Standard totals at activation; all existing million-plus
-- accounts owe one payment, never retroactive catch-up fees.
INSERT INTO standard_fee_accounts (address, volume_atomic)
SELECT CASE WHEN source_chain_id IN ('Solana', 'Solana_Devnet')
  THEN from_address ELSE lower(from_address) END, sum(amount_atomic)
FROM bridge_burn_submissions WHERE transfer_type = 'standard'
GROUP BY CASE WHEN source_chain_id IN ('Solana', 'Solana_Devnet')
  THEN from_address ELSE lower(from_address) END;
