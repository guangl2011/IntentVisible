CREATE TABLE `catalog_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`storage_ref` text NOT NULL,
	`url` text NOT NULL,
	`fetched_at` text NOT NULL,
	`synced_at` text NOT NULL,
	`raw` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_snapshots_store_hash_uq` ON `catalog_snapshots` (`store_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX `catalog_snapshots_store_idx` ON `catalog_snapshots` (`store_id`);--> statement-breakpoint
CREATE TABLE `intents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` text NOT NULL,
	`intent_id` text NOT NULL,
	`intent_version` integer NOT NULL,
	`payload` text NOT NULL,
	`scope` text NOT NULL,
	`brand_id` text NOT NULL,
	`intent_category` text NOT NULL,
	`buyer_stage` text NOT NULL,
	`country` text NOT NULL,
	`language` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `intents_store_id_version_uq` ON `intents` (`store_id`,`intent_id`,`intent_version`);--> statement-breakpoint
CREATE INDEX `intents_store_idx` ON `intents` (`store_id`);--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_domain` text NOT NULL,
	`encrypted_access_token` text,
	`granted_scopes` text,
	`connected` integer DEFAULT false NOT NULL,
	`brand_profile` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchants_shop_domain_unique` ON `merchants` (`shop_domain`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`shop_domain` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`pdp_url` text NOT NULL,
	`payload` text NOT NULL,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_store_product_uq` ON `products` (`store_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `products_store_idx` ON `products` (`store_id`);--> statement-breakpoint
CREATE TABLE `shopify_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`status_history` text NOT NULL,
	`error` text,
	`result` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shopify_jobs_store_idx` ON `shopify_jobs` (`store_id`);--> statement-breakpoint
CREATE TABLE `sku_intent_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` text NOT NULL,
	`mapping_id` text NOT NULL,
	`intent_id` text NOT NULL,
	`sku_id` text NOT NULL,
	`product_id` text,
	`payload` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`invalidated_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sku_intent_mappings_store_mapping_uq` ON `sku_intent_mappings` (`store_id`,`mapping_id`);--> statement-breakpoint
CREATE INDEX `sku_intent_mappings_store_product_idx` ON `sku_intent_mappings` (`store_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `skus` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`sku_id` text NOT NULL,
	`name` text,
	`price_amount` real,
	`price_currency` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skus_store_sku_uq` ON `skus` (`store_id`,`sku_id`);--> statement-breakpoint
CREATE INDEX `skus_store_product_idx` ON `skus` (`store_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`webhook_id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`shop_domain` text,
	`processed_at` text NOT NULL
);
