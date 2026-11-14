CREATE TABLE `composite_components` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`composite_id` integer NOT NULL,
	`component_id` integer NOT NULL,
	`quantity` real NOT NULL,
	`reference_price` real,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`composite_id`) REFERENCES `assortment_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_id`) REFERENCES `assortment_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `composite_components_pair_idx` ON `composite_components` (`composite_id`,`component_id`);--> statement-breakpoint
CREATE INDEX `composite_components_component_idx` ON `composite_components` (`component_id`);--> statement-breakpoint
ALTER TABLE `assortment_items` ADD `sale_price_reference` real;