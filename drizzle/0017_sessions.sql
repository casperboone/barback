-- Left over from the Google sign-in branch, which was applied to production
-- but never merged. Its sessions table had another shape.
DROP TABLE IF EXISTS `sessions`;--> statement-breakpoint
DROP TABLE IF EXISTS `users`;--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`sub` text NOT NULL,
	`name` text,
	`refresh_token` text,
	`checked_at` integer NOT NULL,
	`refreshing_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_sub_idx` ON `sessions` (`sub`);