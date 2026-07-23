ALTER TABLE `test_executions` ADD `flakyScenarios` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `test_executions` ADD `inconclusiveScenarios` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `test_executions` ADD `reliabilityReportUrl` text;--> statement-breakpoint
ALTER TABLE `test_results` ADD `reliabilityStatus` enum('ESTAVEL','FLAKY','FALHA_REAL','INCONCLUSIVO') DEFAULT 'INCONCLUSIVO' NOT NULL;--> statement-breakpoint
ALTER TABLE `test_results` ADD `attempts` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `test_results` ADD `passedAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `test_results` ADD `failedAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `test_results` ADD `automationErrorAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `test_results` ADD `attemptsJson` text;--> statement-breakpoint
UPDATE `test_results`
SET
  `reliabilityStatus` = CASE
    WHEN `status` = 'PASSOU' THEN 'ESTAVEL'
    WHEN `status` = 'FALHOU' THEN 'FALHA_REAL'
    ELSE 'INCONCLUSIVO'
  END,
  `passedAttempts` = CASE WHEN `status` = 'PASSOU' THEN 1 ELSE 0 END,
  `failedAttempts` = CASE WHEN `status` = 'FALHOU' THEN 1 ELSE 0 END,
  `automationErrorAttempts` = CASE WHEN `status` = 'ERRO_AUTOMACAO' THEN 1 ELSE 0 END;--> statement-breakpoint
CREATE INDEX `test_results_reliability_idx` ON `test_results` (`reliabilityStatus`);
