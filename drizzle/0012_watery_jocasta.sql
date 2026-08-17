ALTER TABLE `project_test_environments` ADD `vpnProvider` enum('NONE','COGEL','SEFAZ','OUTRA') DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_test_environments` ADD `vpnProfileName` varchar(160);--> statement-breakpoint
ALTER TABLE `project_test_environments` ADD `vpnUsername` varchar(320);--> statement-breakpoint
ALTER TABLE `project_test_environments` ADD `vpnPasswordEncrypted` text;--> statement-breakpoint
ALTER TABLE `project_test_environments` ADD `vpnAutoConnect` int DEFAULT 1 NOT NULL;