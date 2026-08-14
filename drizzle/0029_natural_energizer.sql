CREATE TABLE `project_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('VIEWER','EXECUTOR') NOT NULL DEFAULT 'VIEWER',
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_members_project_user_unique` UNIQUE(`projectId`,`userId`)
);
--> statement-breakpoint
CREATE INDEX `project_members_project_idx` ON `project_members` (`projectId`);--> statement-breakpoint
CREATE INDEX `project_members_user_idx` ON `project_members` (`userId`);