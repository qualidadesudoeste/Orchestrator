ALTER TABLE `qa_test_plans` ADD `responsibleUserId` int;--> statement-breakpoint
UPDATE `qa_test_plans` SET `responsibleUserId` = `createdById` WHERE `responsibleUserId` IS NULL;--> statement-breakpoint
CREATE INDEX `qa_test_plans_responsible_idx` ON `qa_test_plans` (`responsibleUserId`);