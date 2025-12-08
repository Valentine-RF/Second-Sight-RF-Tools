ALTER TABLE `signal_captures` MODIFY COLUMN `metaFileKey` varchar(512);--> statement-breakpoint
ALTER TABLE `signal_captures` MODIFY COLUMN `metaFileUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `signal_captures` MODIFY COLUMN `dataFileKey` varchar(512);--> statement-breakpoint
ALTER TABLE `signal_captures` MODIFY COLUMN `dataFileUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `signal_captures` ADD `localMetaPath` varchar(512);--> statement-breakpoint
ALTER TABLE `signal_captures` ADD `localDataPath` varchar(512);--> statement-breakpoint
ALTER TABLE `signal_captures` ADD `s3SyncStatus` enum('none','pending','synced','failed') DEFAULT 'none';