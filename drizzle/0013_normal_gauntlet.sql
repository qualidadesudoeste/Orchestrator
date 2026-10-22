ALTER TABLE `test_executions` ADD `executionState` enum('QUEUED','RUNNING','FINISHED','FAILED') DEFAULT 'QUEUED' NOT NULL;--> statement-breakpoint
ALTER TABLE `test_executions` ADD `completedScenarios` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `test_executions` ADD `currentScenarioIndex` int;--> statement-breakpoint
ALTER TABLE `test_executions` ADD `currentScenarioId` varchar(160);--> statement-breakpoint
ALTER TABLE `test_executions` ADD `currentScenarioTitle` varchar(500);--> statement-breakpoint
ALTER TABLE `test_executions` ADD `currentEnvironment` varchar(160);--> statement-breakpoint
ALTER TABLE `test_executions` ADD `currentStage` varchar(80);--> statement-breakpoint
ALTER TABLE `test_executions` ADD `progressMessage` varchar(1000);--> statement-breakpoint
ALTER TABLE `test_executions` ADD `liveProgressJson` text;--> statement-breakpoint
ALTER TABLE `test_executions` ADD `lastHeartbeatAt` timestamp;--> statement-breakpoint
UPDATE `test_executions`
SET
  `executionState` = CASE WHEN `status` = 'EM_ANDAMENTO' THEN 'FAILED' ELSE 'FINISHED' END,
  `completedScenarios` = CASE WHEN `status` = 'EM_ANDAMENTO' THEN 0 ELSE `totalScenarios` END,
  `currentStage` = CASE WHEN `status` = 'EM_ANDAMENTO' THEN 'EXECUCAO_INTERROMPIDA' ELSE 'CONCLUIDO' END,
  `progressMessage` = CASE
    WHEN `status` = 'EM_ANDAMENTO' THEN 'Execução anterior interrompida antes da implantação do progresso em tempo real.'
    ELSE 'Execução histórica concluída.'
  END;
