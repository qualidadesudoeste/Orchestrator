ALTER TABLE `projects` ADD `sourceCodePath` varchar(1000);--> statement-breakpoint
ALTER TABLE `projects` ADD `sourceCodeSummary` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `sourceCodeFileCount` int;--> statement-breakpoint
ALTER TABLE `projects` ADD `sourceCodeIndexedAt` timestamp;