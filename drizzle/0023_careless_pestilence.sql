ALTER TABLE `test_executions` MODIFY COLUMN `status` enum('EM_ANDAMENTO','PASSOU','FALHOU','BLOQUEADO','ERRO_AUTOMACAO','CANCELADO') NOT NULL;--> statement-breakpoint
ALTER TABLE `test_executions` MODIFY COLUMN `executionState` enum('QUEUED','RUNNING','PAUSED','FINISHED','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED';--> statement-breakpoint
ALTER TABLE `test_executions` ADD `controlState` enum('RUN','PAUSE','CANCEL') DEFAULT 'RUN' NOT NULL;--> statement-breakpoint
ALTER TABLE `test_executions` ADD `controlRequestedAt` timestamp;--> statement-breakpoint
ALTER TABLE `test_executions` ADD `controlRequestedById` int;