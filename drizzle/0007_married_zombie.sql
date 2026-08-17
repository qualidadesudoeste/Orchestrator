ALTER TABLE `test_executions` ADD `createdById` int;--> statement-breakpoint
CREATE INDEX `test_executions_created_by_idx` ON `test_executions` (`createdById`);