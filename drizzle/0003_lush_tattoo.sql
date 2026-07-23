CREATE TABLE `defect_cards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalCardId` varchar(64) NOT NULL,
	`externalExecutionId` varchar(128) NOT NULL,
	`externalScenarioId` varchar(160) NOT NULL,
	`clientId` int,
	`projectId` int,
	`sprintId` int,
	`clientName` varchar(255),
	`projectName` varchar(255) NOT NULL,
	`sprintName` varchar(255),
	`systemUrl` varchar(1000),
	`scenarioTitle` varchar(500) NOT NULL,
	`title` varchar(500) NOT NULL,
	`severity` enum('BAIXO','MEDIO','ALTO','CRITICO') NOT NULL,
	`status` enum('ABERTO','COPIADO','RESOLVIDO') NOT NULL DEFAULT 'ABERTO',
	`summary` text NOT NULL,
	`expectedResult` text,
	`actualResult` text NOT NULL,
	`reproductionSteps` text NOT NULL,
	`evidenceJson` text,
	`markdown` text NOT NULL,
	`rawPayload` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `defect_cards_id` PRIMARY KEY(`id`),
	CONSTRAINT `defect_cards_external_id_unique` UNIQUE(`externalCardId`)
);
--> statement-breakpoint
CREATE INDEX `defect_cards_execution_idx` ON `defect_cards` (`externalExecutionId`);--> statement-breakpoint
CREATE INDEX `defect_cards_project_idx` ON `defect_cards` (`projectId`);--> statement-breakpoint
CREATE INDEX `defect_cards_sprint_idx` ON `defect_cards` (`sprintId`);--> statement-breakpoint
CREATE INDEX `defect_cards_severity_idx` ON `defect_cards` (`severity`);--> statement-breakpoint
CREATE INDEX `defect_cards_status_idx` ON `defect_cards` (`status`);