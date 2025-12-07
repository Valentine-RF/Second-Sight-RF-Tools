CREATE TABLE `batch_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`jobType` varchar(64) NOT NULL,
	`parameters` text,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`progress` int DEFAULT 0,
	`resultUrl` varchar(1024),
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`startedAt` timestamp,
	`completedAt` timestamp,
	CONSTRAINT `batch_jobs_id` PRIMARY KEY(`id`)
);
