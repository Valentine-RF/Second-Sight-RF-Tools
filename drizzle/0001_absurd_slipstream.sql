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
	`color` varchar(32) DEFAULT '#3b82f6',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `annotations_id` PRIMARY KEY(`id`)
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
