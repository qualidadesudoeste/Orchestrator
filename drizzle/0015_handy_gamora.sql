CREATE TABLE `qa_test_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`projectId` int NOT NULL,
	`sprintId` int NOT NULL,
	`createdById` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`userStory` text NOT NULL,
	`systemType` varchar(80) NOT NULL,
	`criticality` varchar(40) NOT NULL,
	`resultJson` longtext NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `qa_test_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `qa_test_plans_sprint_idx` ON `qa_test_plans` (`sprintId`);--> statement-breakpoint
CREATE INDEX `qa_test_plans_project_idx` ON `qa_test_plans` (`projectId`);--> statement-breakpoint
CREATE INDEX `qa_test_plans_user_idx` ON `qa_test_plans` (`createdById`);