CREATE TABLE `audit_log_table` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`user_id` integer,
	`username` text NOT NULL,
	`action` text NOT NULL,
	`target` text DEFAULT '' NOT NULL,
	`details` text,
	`ip` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_ts_idx` ON `audit_log_table` (`ts`);--> statement-breakpoint
CREATE INDEX `audit_log_action_idx` ON `audit_log_table` (`action`);