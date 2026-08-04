CREATE TABLE `ai_provider_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`provider` enum('OPENAI','GEMINI','GROQ','CUSTOM') NOT NULL,
	`apiUrl` varchar(1000) NOT NULL,
	`model` varchar(255) NOT NULL,
	`apiKeyEncrypted` text,
	`isActive` int NOT NULL DEFAULT 0,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_provider_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_provider_settings_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `vpn_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`provider` enum('COGEL','SEFAZ','OUTRA') NOT NULL,
	`profileName` varchar(160) NOT NULL,
	`username` varchar(320),
	`passwordEncrypted` text,
	`autoConnect` int NOT NULL DEFAULT 1,
	`connectionStrategy` enum('AUTO','CLI','AUTOCONNECT') NOT NULL DEFAULT 'AUTO',
	`configFileName` varchar(255),
	`configEncrypted` longtext,
	`configPasswordEncrypted` text,
	`configImportedAt` timestamp,
	`installerUrl` text,
	`installerSha256` varchar(64),
	`verificationUrl` varchar(1000),
	`isActive` int NOT NULL DEFAULT 1,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vpn_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `vpn_profiles_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `project_test_environments` ADD `vpnProfileId` int;--> statement-breakpoint
CREATE INDEX `ai_provider_settings_active_idx` ON `ai_provider_settings` (`isActive`);
--> statement-breakpoint
INSERT INTO `vpn_profiles` (`name`,`provider`,`profileName`,`username`,`passwordEncrypted`,`autoConnect`,`connectionStrategy`,`configFileName`,`configEncrypted`,`configPasswordEncrypted`,`configImportedAt`,`installerUrl`,`installerSha256`,`verificationUrl`,`isActive`,`createdById`,`createdAt`,`updatedAt`)
SELECT CONCAT('VPN ', environment.`vpnProvider`, ' - ', environment.`vpnProfileName`), environment.`vpnProvider`, environment.`vpnProfileName`, environment.`vpnUsername`, environment.`vpnPasswordEncrypted`, environment.`vpnAutoConnect`, environment.`vpnConnectionStrategy`, environment.`vpnConfigFileName`, environment.`vpnConfigEncrypted`, environment.`vpnConfigPasswordEncrypted`, environment.`vpnConfigImportedAt`, environment.`vpnInstallerUrl`, environment.`vpnInstallerSha256`, environment.`vpnVerificationUrl`, 1, environment.`createdById`, environment.`createdAt`, environment.`updatedAt`
FROM `project_test_environments` AS environment
LEFT JOIN `project_test_environments` AS previous ON previous.`vpnProvider` = environment.`vpnProvider` AND previous.`vpnProfileName` = environment.`vpnProfileName` AND previous.`id` < environment.`id`
WHERE environment.`vpnProvider` <> 'NONE' AND environment.`vpnProfileName` IS NOT NULL AND environment.`vpnProfileName` <> '' AND previous.`id` IS NULL;
--> statement-breakpoint
UPDATE `project_test_environments` AS environment
INNER JOIN `vpn_profiles` AS profile ON profile.`provider` = environment.`vpnProvider` AND profile.`profileName` = environment.`vpnProfileName`
SET environment.`vpnProfileId` = profile.`id`
WHERE environment.`vpnProvider` <> 'NONE';