CREATE TABLE `annotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`captureId` int NOT NULL,
	`sampleStart` int NOT NULL,
	`sampleCount` int NOT NULL,
	`freqLowerEdge` float,
	`freqUpperEdge` float,
	`label` varchar(255),
	`modulationType` varchar(64),
	`confidence` float,
	`estimatedSNR` float,
	`estimatedCFO` float,
	`estimatedBaud` float,
	`cfoRefinedHz` float,
	`cfoMethod` varchar(64),
	`cfoTimestamp` timestamp,
	`cfoLockDetected` boolean,
	`cfoPhaseErrorVar` float,
	`color` varchar(32) DEFAULT '#3b82f6',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `annotations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`key` varchar(64) NOT NULL,
	`lastUsed` timestamp,
	`requestCount` int NOT NULL DEFAULT 0,
	`rateLimit` int NOT NULL DEFAULT 100,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`captureId` int,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comparison_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255),
	`notes` text,
	`captureIds` text NOT NULL,
	`settings` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comparison_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processing_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`captureId` int NOT NULL,
	`annotationId` int,
	`jobType` enum('fam','classification','demodulation','snr_estimation','cfo_estimation') NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`parameters` text,
	`results` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `processing_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signal_captures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`metaFileKey` varchar(512) NOT NULL,
	`metaFileUrl` varchar(1024) NOT NULL,
	`dataFileKey` varchar(512) NOT NULL,
	`dataFileUrl` varchar(1024) NOT NULL,
	`datatype` varchar(64),
	`sampleRate` float,
	`hardware` text,
	`author` varchar(255),
	`sha512` varchar(128),
	`dataFileSize` int,
	`status` enum('uploaded','processing','ready','error') NOT NULL DEFAULT 'uploaded',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `signal_captures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
