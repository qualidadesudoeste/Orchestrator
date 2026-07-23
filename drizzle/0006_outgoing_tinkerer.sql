CREATE TABLE `defect_card_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalCardId` varchar(64) NOT NULL,
	`fromStatus` enum('ABERTO','COPIADO','RESOLVIDO','REABERTO','DESCARTADO'),
	`toStatus` enum('ABERTO','COPIADO','RESOLVIDO','REABERTO','DESCARTADO') NOT NULL,
	`source` enum('AGENTE','USUARIO','SISTEMA') NOT NULL,
	`reason` varchar(1000),
	`changedById` int,
	`changedByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `defect_card_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
INSERT INTO `defect_card_history`
	(`externalCardId`, `fromStatus`, `toStatus`, `source`, `reason`)
SELECT
	`externalCardId`,
	NULL,
	`status`,
	'SISTEMA',
	'Histórico inicial criado durante a implantação do ciclo de vida.'
FROM `defect_cards`;--> statement-breakpoint
ALTER TABLE `defect_cards` MODIFY COLUMN `status` enum('ABERTO','COPIADO','RESOLVIDO','REABERTO','DESCARTADO') NOT NULL DEFAULT 'ABERTO';--> statement-breakpoint
CREATE INDEX `defect_card_history_card_idx` ON `defect_card_history` (`externalCardId`);--> statement-breakpoint
CREATE INDEX `defect_card_history_status_idx` ON `defect_card_history` (`toStatus`);--> statement-breakpoint
CREATE INDEX `defect_card_history_created_idx` ON `defect_card_history` (`createdAt`);
