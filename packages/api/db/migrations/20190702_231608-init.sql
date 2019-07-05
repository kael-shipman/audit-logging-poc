-- Migration: init
-- Created at: 2019-07-02 23:16:08
-- ====  UP  ====

BEGIN;

CREATE TABLE `users` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(64) NOT NULL,
  `email` varchar(128) NOT NULL,
  `agreedTos` tinyint(1) NOT NULL DEFAULT '0',
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB;

CREATE TABLE `notes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `timestamp` INT UNSIGNED NOT NULL,
  `targetType` VARCHAR(64) NOT NULL,
  `targetId` INT UNSIGNED NOT NULL,
  `fieldName` VARCHAR(64) NULL,
  `data` TEXT NOT NULL,
  `creatorId` INT UNSIGNED NOT NULL,
  FOREIGN KEY (`creatorId`) REFERENCES `users` (`id`),
  INDEX `combinedKey` (`targetType`, `targetId`, `fieldName`)
) ENGINE=InnoDB;

COMMIT;

-- ==== DOWN ====

BEGIN;

DROP TABLE `notes`;
DROP TABLE `users`;

COMMIT;
