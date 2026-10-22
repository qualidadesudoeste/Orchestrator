CREATE TABLE `project_qa_provisioning` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`endpointUrl` varchar(1000) NOT NULL,
	`tokenEncrypted` text,
	`isActive` int NOT NULL DEFAULT 1,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_qa_provisioning_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_qa_provisioning_project_unique` UNIQUE(`projectId`)
);
