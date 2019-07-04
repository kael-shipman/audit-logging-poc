-- Migration: init
-- Created at: 2019-07-02 23:16:08
-- ====  UP  ====

BEGIN;

CREATE TABLE `users` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `email` varchar(128) NOT NULL,
  `agreedTos` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

COMMIT;

-- ==== DOWN ====

BEGIN;

DROP TABLE `users`;

COMMIT;
