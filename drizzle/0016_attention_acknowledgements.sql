CREATE TABLE `attention_acknowledgements` (
	`key` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`acknowledged_at` integer DEFAULT (unixepoch()) NOT NULL
);
