CREATE TABLE `qa_agent_memories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scopeKey` varchar(64) NOT NULL,
	`fingerprint` varchar(64) NOT NULL,
	`clientId` int,
	`projectId` int,
	`clientName` varchar(255),
	`projectName` varchar(255) NOT NULL,
	`systemHost` varchar(255) NOT NULL,
	`systemUrl` varchar(1000),
	`sourceSprintId` int,
	`sourceSprintName` varchar(255),
	`externalExecutionId` varchar(128),
	`externalScenarioId` varchar(160),
	`category` enum('REGRA_NEGOCIO','SELETOR','RISCO','DEFEITO','AUTOMACAO','OBSERVACAO') NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`confidence` int NOT NULL DEFAULT 70,
	`occurrences` int NOT NULL DEFAULT 1,
	`status` enum('ATIVA','ARQUIVADA') NOT NULL DEFAULT 'ATIVA',
	`firstSeenAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `qa_agent_memories_id` PRIMARY KEY(`id`),
	CONSTRAINT `qa_agent_memory_scope_fingerprint_unique` UNIQUE(`scopeKey`,`fingerprint`)
);
--> statement-breakpoint
CREATE INDEX `qa_agent_memory_scope_idx` ON `qa_agent_memories` (`scopeKey`);--> statement-breakpoint
CREATE INDEX `qa_agent_memory_project_idx` ON `qa_agent_memories` (`projectId`);--> statement-breakpoint
CREATE INDEX `qa_agent_memory_sprint_idx` ON `qa_agent_memories` (`sourceSprintId`);--> statement-breakpoint
CREATE INDEX `qa_agent_memory_category_idx` ON `qa_agent_memories` (`category`);--> statement-breakpoint
CREATE INDEX `qa_agent_memory_status_idx` ON `qa_agent_memories` (`status`);--> statement-breakpoint
CREATE INDEX `qa_agent_memory_last_seen_idx` ON `qa_agent_memories` (`lastSeenAt`);