ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(255);--> statement-breakpoint
SET @add_username = (
	SELECT IF(
		COUNT(*) = 0,
		'ALTER TABLE `users` ADD COLUMN `username` varchar(64)',
		'SELECT 1'
	)
	FROM information_schema.columns
	WHERE table_schema = DATABASE()
		AND table_name = 'users'
		AND column_name = 'username'
);--> statement-breakpoint
PREPARE add_username_stmt FROM @add_username;--> statement-breakpoint
EXECUTE add_username_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_username_stmt;--> statement-breakpoint
SET @add_password_hash = (
	SELECT IF(
		COUNT(*) = 0,
		'ALTER TABLE `users` ADD COLUMN `passwordHash` varchar(255)',
		'SELECT 1'
	)
	FROM information_schema.columns
	WHERE table_schema = DATABASE()
		AND table_name = 'users'
		AND column_name = 'passwordHash'
);--> statement-breakpoint
PREPARE add_password_hash_stmt FROM @add_password_hash;--> statement-breakpoint
EXECUTE add_password_hash_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_password_hash_stmt;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `trail_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`completedTopics` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trail_progress_id` PRIMARY KEY(`id`),
	CONSTRAINT `trail_progress_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `qa_plan_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdById` int NOT NULL,
	`projectName` varchar(255) NOT NULL,
	`clientName` varchar(255),
	`sprintName` varchar(100),
	`version` varchar(50) DEFAULT '1.0',
	`redator` varchar(255),
	`baseName` varchar(500) NOT NULL,
	`texStorageKey` varchar(500),
	`texUrl` varchar(1000),
	`pdfStorageKey` varchar(500),
	`pdfUrl` varchar(1000),
	`pdfError` text,
	`projectJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `qa_plan_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `test_executions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalExecutionId` varchar(128) NOT NULL,
	`clientId` int,
	`projectId` int,
	`sprintId` int,
	`clientName` varchar(255),
	`projectName` varchar(255) NOT NULL,
	`sprintName` varchar(255),
	`systemUrl` varchar(1000),
	`status` enum('PASSOU','FALHOU','BLOQUEADO','ERRO_AUTOMACAO') NOT NULL,
	`totalScenarios` int NOT NULL DEFAULT 0,
	`passedScenarios` int NOT NULL DEFAULT 0,
	`failedScenarios` int NOT NULL DEFAULT 0,
	`blockedScenarios` int NOT NULL DEFAULT 0,
	`automationErrors` int NOT NULL DEFAULT 0,
	`coveragePercent` int NOT NULL DEFAULT 0,
	`defectsFound` int NOT NULL DEFAULT 0,
	`criticalDefects` int NOT NULL DEFAULT 0,
	`escapedDefects` int NOT NULL DEFAULT 0,
	`evidenceDocxUrl` text,
	`regressionBundleId` varchar(64),
	`startedAt` timestamp,
	`finishedAt` timestamp,
	`rawPayload` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `test_executions_id` PRIMARY KEY(`id`),
	CONSTRAINT `test_executions_external_id_unique` UNIQUE(`externalExecutionId`)
);
--> statement-breakpoint
CREATE TABLE `test_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`executionId` int NOT NULL,
	`externalScenarioId` varchar(160) NOT NULL,
	`title` varchar(500) NOT NULL,
	`moduleName` varchar(255),
	`gherkin` text,
	`status` enum('PASSOU','FALHOU','BLOQUEADO','ERRO_AUTOMACAO') NOT NULL,
	`risk` enum('BAIXO','MEDIO','ALTO','CRITICO') NOT NULL DEFAULT 'MEDIO',
	`summary` text,
	`realDefects` int NOT NULL DEFAULT 0,
	`automationFailures` int NOT NULL DEFAULT 0,
	`durationMs` int,
	`evidenceJson` text,
	`failuresJson` text,
	`regressionCodeUrl` text,
	`executedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `test_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `test_executions_project_idx` ON `test_executions` (`projectId`);--> statement-breakpoint
CREATE INDEX `test_executions_sprint_idx` ON `test_executions` (`sprintId`);--> statement-breakpoint
CREATE INDEX `test_executions_finished_at_idx` ON `test_executions` (`finishedAt`);--> statement-breakpoint
CREATE INDEX `test_results_execution_idx` ON `test_results` (`executionId`);--> statement-breakpoint
CREATE INDEX `test_results_status_idx` ON `test_results` (`status`);--> statement-breakpoint
CREATE INDEX `test_results_module_idx` ON `test_results` (`moduleName`);
