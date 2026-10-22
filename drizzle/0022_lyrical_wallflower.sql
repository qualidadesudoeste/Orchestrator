CREATE TABLE `execution_workers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL,
	`mode` enum('LOCAL','REMOTE') NOT NULL DEFAULT 'LOCAL',
	`status` enum('ONLINE','OFFLINE','PAUSED') NOT NULL DEFAULT 'ONLINE',
	`networkPool` enum('ANY','PUBLIC','COGEL','SEFAZ','OUTRA') NOT NULL DEFAULT 'ANY',
	`maxConcurrency` int NOT NULL DEFAULT 2,
	`minFreeMemoryMb` int NOT NULL DEFAULT 3072,
	`maxCpuPercent` int NOT NULL DEFAULT 75,
	`endpointUrl` varchar(1000),
	`apiTokenEncrypted` text,
	`currentPool` enum('PUBLIC','COGEL','SEFAZ','OUTRA'),
	`freeMemoryMb` int,
	`cpuPercent` int,
	`lastHeartbeatAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `execution_workers_id` PRIMARY KEY(`id`),
	CONSTRAINT `execution_workers_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `test_executions` ADD `queuePool` enum('PUBLIC','COGEL','SEFAZ','OUTRA') DEFAULT 'PUBLIC' NOT NULL;--> statement-breakpoint
ALTER TABLE `test_executions` ADD `assignedWorkerId` int;--> statement-breakpoint
ALTER TABLE `test_executions` ADD `dispatchPayloadEncrypted` longtext;--> statement-breakpoint
ALTER TABLE `test_executions` ADD `dispatchAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `test_executions` ADD `queuedAt` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `test_executions` ADD `dispatchedAt` timestamp;--> statement-breakpoint
ALTER TABLE `test_executions` ADD `leaseExpiresAt` timestamp;--> statement-breakpoint
CREATE INDEX `execution_workers_status_idx` ON `execution_workers` (`status`);--> statement-breakpoint
CREATE INDEX `execution_workers_network_pool_idx` ON `execution_workers` (`networkPool`);--> statement-breakpoint
CREATE INDEX `test_executions_queue_idx` ON `test_executions` (`executionState`,`queuePool`,`queuedAt`);--> statement-breakpoint
CREATE INDEX `test_executions_worker_idx` ON `test_executions` (`assignedWorkerId`,`executionState`);