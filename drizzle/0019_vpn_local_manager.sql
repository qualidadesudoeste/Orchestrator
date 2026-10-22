ALTER TABLE `project_test_environments` ADD `vpnConnectionStrategy` enum('AUTO','CLI','AUTOCONNECT') DEFAULT 'AUTO' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_test_environments` ADD `vpnConfigFileName` varchar(255);--> statement-breakpoint
ALTER TABLE `project_test_environments` ADD `vpnConfigEncrypted` longtext;--> statement-breakpoint
ALTER TABLE `project_test_environments` ADD `vpnConfigPasswordEncrypted` text;--> statement-breakpoint
ALTER TABLE `project_test_environments` ADD `vpnConfigImportedAt` timestamp;--> statement-breakpoint
ALTER TABLE `project_test_environments` ADD `vpnInstallerUrl` text;--> statement-breakpoint
ALTER TABLE `project_test_environments` ADD `vpnInstallerSha256` varchar(64);--> statement-breakpoint
ALTER TABLE `project_test_environments` ADD `vpnVerificationUrl` varchar(1000);