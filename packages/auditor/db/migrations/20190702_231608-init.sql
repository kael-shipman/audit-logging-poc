-- Migration: init
-- Created at: 2019-07-02 23:16:08
-- ====  UP  ====

BEGIN;

CREATE TABLE `data-events` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `action` ENUM("viewed", "created", "changed", "deleted") NOT NULL,
  `timestamp` BIGINT UNSIGNED NOT NULL,
  `actorType` VARCHAR(64) NOT NULL,
  `actorId` INT UNSIGNED NOT NULL,
  `targetType` VARCHAR(64) NOT NULL,
  `targetId` INT UNSIGNED NOT NULL,
  `fieldName` VARCHAR(64) NULL,
  `prevData` TEXT NULL,
  `newData` TEXT NULL,
  `eventName` VARCHAR(64) NULL COMMENT "An optional canonical name for this event that can be used to map localized text",
  INDEX `actorIndex` (`actorType`,`actorId`),
  INDEX `targetIndex` (`targetType`,`targetId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

COMMIT;

-- ==== DOWN ====

BEGIN;

DROP TABLE `data-events`;

COMMIT;
