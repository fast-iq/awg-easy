CREATE TABLE `traffic_counter_table` (
	`client_id` integer PRIMARY KEY NOT NULL,
	`tx` integer NOT NULL,
	`rx` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients_table`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `traffic_daily_table` (
	`client_id` integer NOT NULL,
	`date` text NOT NULL,
	`tx` integer DEFAULT 0 NOT NULL,
	`rx` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`client_id`, `date`),
	FOREIGN KEY (`client_id`) REFERENCES `clients_table`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `traffic_daily_date_idx` ON `traffic_daily_table` (`date`);