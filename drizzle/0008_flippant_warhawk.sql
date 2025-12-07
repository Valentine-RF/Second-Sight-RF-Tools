CREATE TABLE `model_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`dataset_id` int,
	`epochs` int NOT NULL,
	`batch_size` int NOT NULL,
	`learning_rate` float NOT NULL,
	`accuracy` float,
	`loss` float,
	`confusion_matrix` text,
	`model_path` text NOT NULL,
	`is_active` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_datasets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`format` varchar(50) NOT NULL,
	`sample_count` int NOT NULL,
	`modulation_types` text NOT NULL,
	`sample_rate` int,
	`file_size` int NOT NULL,
	`file_path` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `training_datasets_id` PRIMARY KEY(`id`)
);
