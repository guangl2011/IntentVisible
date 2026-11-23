CREATE TABLE `affiliate_visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` text NOT NULL,
	`visit_id` text NOT NULL,
	`channel` text NOT NULL,
	`partner` text NOT NULL,
	`tracking_code` text NOT NULL,
	`landed_intent_id` text,
	`order_id` text,
	`landed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_visits_shop_visit_uq` ON `affiliate_visits` (`shop_id`,`visit_id`);--> statement-breakpoint
CREATE INDEX `affiliate_visits_shop_tracking_idx` ON `affiliate_visits` (`shop_id`,`tracking_code`);--> statement-breakpoint
CREATE TABLE `ai_referral_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` text NOT NULL,
	`session_id` text NOT NULL,
	`source` text NOT NULL,
	`referrer_url` text NOT NULL,
	`landed_url` text NOT NULL,
	`landed_intent_id` text,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_referral_sessions_shop_session_uq` ON `ai_referral_sessions` (`shop_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `ai_referral_sessions_shop_source_idx` ON `ai_referral_sessions` (`shop_id`,`source`);--> statement-breakpoint
CREATE TABLE `commission_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` text NOT NULL,
	`order_id` text NOT NULL,
	`intent_id` text,
	`channel` text NOT NULL,
	`tracking_code` text,
	`payload` text NOT NULL,
	`billed_period_start` text NOT NULL,
	`billed_period_end` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `commission_entries_shop_order_idx` ON `commission_entries` (`shop_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `commission_entries_shop_idx` ON `commission_entries` (`shop_id`);--> statement-breakpoint
CREATE TABLE `intent_prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` text NOT NULL,
	`intent_id` text NOT NULL,
	`prompt_text` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `intent_prompts_shop_intent_text_uq` ON `intent_prompts` (`shop_id`,`intent_id`,`prompt_text`);--> statement-breakpoint
CREATE INDEX `intent_prompts_shop_intent_idx` ON `intent_prompts` (`shop_id`,`intent_id`);--> statement-breakpoint
CREATE TABLE `intent_units` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` text NOT NULL,
	`intent_id` text NOT NULL,
	`intent_version` integer NOT NULL,
	`intent_name` text NOT NULL,
	`scope` text NOT NULL,
	`buyer_stage` text NOT NULL,
	`intent_category` text NOT NULL,
	`persona` text NOT NULL,
	`pain_point` text NOT NULL,
	`status` text NOT NULL,
	`confidence` text NOT NULL,
	`evidence_urls` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `intent_units_shop_id_version_uq` ON `intent_units` (`shop_id`,`intent_id`,`intent_version`);--> statement-breakpoint
CREATE INDEX `intent_units_shop_idx` ON `intent_units` (`shop_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` text NOT NULL,
	`order_id` text NOT NULL,
	`order_number` text NOT NULL,
	`net_sales` real NOT NULL,
	`currency` text NOT NULL,
	`attribution` text NOT NULL,
	`is_first_order` integer DEFAULT false NOT NULL,
	`refunded_at` text,
	`ordered_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_shop_order_uq` ON `orders` (`shop_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `orders_shop_idx` ON `orders` (`shop_id`);--> statement-breakpoint
CREATE TABLE `shops` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_domain` text NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`installed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shops_shop_domain_unique` ON `shops` (`shop_domain`);--> statement-breakpoint
CREATE TABLE `visibility_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` text NOT NULL,
	`intent_id` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visibility_snapshots_shop_intent_uq` ON `visibility_snapshots` (`shop_id`,`intent_id`);--> statement-breakpoint
CREATE INDEX `visibility_snapshots_shop_idx` ON `visibility_snapshots` (`shop_id`);