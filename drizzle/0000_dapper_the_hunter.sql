CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`round` integer DEFAULT 1 NOT NULL,
	`article_index` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`updated_at` integer NOT NULL,
	`police_token` text NOT NULL,
	`police_name` text NOT NULL,
	`police_ready` integer DEFAULT false NOT NULL,
	`police_progress` integer DEFAULT 0 NOT NULL,
	`police_correct` integer DEFAULT 0 NOT NULL,
	`police_typed` integer DEFAULT 0 NOT NULL,
	`police_seq` integer DEFAULT 0 NOT NULL,
	`police_seen_at` integer NOT NULL,
	`thief_token` text,
	`thief_name` text,
	`thief_ready` integer DEFAULT false NOT NULL,
	`thief_progress` integer DEFAULT 0 NOT NULL,
	`thief_correct` integer DEFAULT 0 NOT NULL,
	`thief_typed` integer DEFAULT 0 NOT NULL,
	`thief_seq` integer DEFAULT 0 NOT NULL,
	`thief_seen_at` integer,
	`winner` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_code_unique` ON `rooms` (`code`);