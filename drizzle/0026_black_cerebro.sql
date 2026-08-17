CREATE TABLE `project_test_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`key` varchar(80) NOT NULL,
	`label` varchar(160) NOT NULL,
	`valueEncrypted` text NOT NULL,
	`isSecret` int NOT NULL DEFAULT 1,
	`isActive` int NOT NULL DEFAULT 1,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_test_data_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_test_data_project_key_unique` UNIQUE(`projectId`,`key`)
);
--> statement-breakpoint
CREATE INDEX `project_test_data_project_idx` ON `project_test_data` (`projectId`);