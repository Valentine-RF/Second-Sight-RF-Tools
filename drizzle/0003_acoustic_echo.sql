ALTER TABLE `annotations` ADD `cfoRefinedHz` float;--> statement-breakpoint
ALTER TABLE `annotations` ADD `cfoMethod` varchar(64);--> statement-breakpoint
ALTER TABLE `annotations` ADD `cfoTimestamp` timestamp;--> statement-breakpoint
ALTER TABLE `annotations` ADD `cfoLockDetected` boolean;--> statement-breakpoint
ALTER TABLE `annotations` ADD `cfoPhaseErrorVar` float;