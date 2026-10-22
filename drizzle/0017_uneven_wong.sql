ALTER TABLE `checklists` ADD `responsibleUserId` int;--> statement-breakpoint
UPDATE `checklists` SET `responsibleUserId` = `analystId` WHERE `responsibleUserId` IS NULL;
