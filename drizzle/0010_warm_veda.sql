CREATE TABLE `project_test_environments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`type` enum('PORTAL','RETAGUARDA','SITE','API','OUTRO') NOT NULL,
	`loginUrl` varchar(1000) NOT NULL,
	`username` varchar(320) NOT NULL,
	`passwordEncrypted` text NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_test_environments_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_test_environments_project_name_unique` UNIQUE(`projectId`,`name`)
);
--> statement-breakpoint
CREATE INDEX `project_test_environments_project_idx` ON `project_test_environments` (`projectId`);