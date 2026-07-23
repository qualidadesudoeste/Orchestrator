CREATE TABLE `non_functional_findings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`tool` enum('K6','ZAP','AXE') NOT NULL,
	`severity` enum('INFO','BAIXO','MEDIO','ALTO','CRITICO') NOT NULL,
	`ruleId` varchar(255),
	`title` varchar(500) NOT NULL,
	`description` text,
	`helpUrl` text,
	`occurrences` int NOT NULL DEFAULT 1,
	`rawPayload` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `non_functional_findings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `non_functional_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalRunId` varchar(128) NOT NULL,
	`clientId` int,
	`projectId` int,
	`sprintId` int,
	`clientName` varchar(255),
	`projectName` varchar(255) NOT NULL,
	`sprintName` varchar(255),
	`targetUrl` varchar(1000) NOT NULL,
	`status` enum('PASSOU','FALHOU','PARCIAL','ERRO') NOT NULL,
	`k6Status` enum('PASSOU','FALHOU','NAO_EXECUTADO','ERRO') NOT NULL,
	`k6P95Ms` int,
	`k6FailureRateBasisPoints` int,
	`k6Requests` int NOT NULL DEFAULT 0,
	`zapStatus` enum('PASSOU','FALHOU','NAO_EXECUTADO','ERRO') NOT NULL,
	`zapHigh` int NOT NULL DEFAULT 0,
	`zapMedium` int NOT NULL DEFAULT 0,
	`zapLow` int NOT NULL DEFAULT 0,
	`axeStatus` enum('PASSOU','FALHOU','NAO_EXECUTADO','ERRO') NOT NULL,
	`axeCritical` int NOT NULL DEFAULT 0,
	`axeSerious` int NOT NULL DEFAULT 0,
	`axeModerate` int NOT NULL DEFAULT 0,
	`axeMinor` int NOT NULL DEFAULT 0,
	`reportDirectory` text,
	`startedAt` timestamp,
	`finishedAt` timestamp,
	`rawPayload` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `non_functional_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `non_functional_runs_external_id_unique` UNIQUE(`externalRunId`)
);
--> statement-breakpoint
CREATE INDEX `non_functional_findings_run_idx` ON `non_functional_findings` (`runId`);--> statement-breakpoint
CREATE INDEX `non_functional_findings_tool_idx` ON `non_functional_findings` (`tool`);--> statement-breakpoint
CREATE INDEX `non_functional_findings_severity_idx` ON `non_functional_findings` (`severity`);--> statement-breakpoint
CREATE INDEX `non_functional_runs_project_idx` ON `non_functional_runs` (`projectId`);--> statement-breakpoint
CREATE INDEX `non_functional_runs_sprint_idx` ON `non_functional_runs` (`sprintId`);--> statement-breakpoint
CREATE INDEX `non_functional_runs_finished_at_idx` ON `non_functional_runs` (`finishedAt`);