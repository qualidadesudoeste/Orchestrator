CREATE TABLE `sig_mcp_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`endpointUrl` varchar(1000) NOT NULL,
	`username` varchar(320) NOT NULL,
	`passwordEncrypted` text,
	`cardsToolName` varchar(255),
	`isActive` int NOT NULL DEFAULT 1,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sig_mcp_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `sig_mcp_settings_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `sigProjectId` varchar(128);--> statement-breakpoint
ALTER TABLE `sprints` ADD `sigSprintId` varchar(128);--> statement-breakpoint
CREATE INDEX `sig_mcp_settings_active_idx` ON `sig_mcp_settings` (`isActive`);