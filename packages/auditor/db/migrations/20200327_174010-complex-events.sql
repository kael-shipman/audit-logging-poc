-- Migration: complex-events
-- Created at: 2020-03-27 17:40:10
-- ====  UP  ====

BEGIN;

  ALTER TABLE `data-events`
  DROP COLUMN `fieldName`,
  DROP COLUMN `prevData`,
  DROP COLUMN `newData`;

  CREATE TABLE `data-mutations` (
    `eventId` INT(10) UNSIGNED NOT NULL,
    `fieldName` VARCHAR(64) NOT NULL,
    `prev` TEXT,
    `next` TEXT,
    FOREIGN KEY `fk_eventId` (`eventId`) REFERENCES `data-events` (`id`) ON UPDATE CASCADE ON DELETE CASCADE,
    INDEX `fieldIndex` (`fieldName`)
  ) ENGINE=InnoDB;

COMMIT;

-- ==== DOWN ====

BEGIN;

  DROP TABLE `data-mutations`;

  ALTER TABLE `data-events`
  ADD COLUMN `fieldName` VARCHAR(64) NULL,
  ADD COLUMN `prevData` TEXT NULL,
  ADD COLUMN `newData` TEXT NULL;

COMMIT;
