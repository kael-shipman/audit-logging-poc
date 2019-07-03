-- Migration: seed
-- Created at: 2019-07-02 23:18:03
-- ====  UP  ====

BEGIN;

  INSERT INTO `users` VALUES (1, "James Chavo", "jim.chavo@happi.com", 1);

COMMIT;

-- ==== DOWN ====

BEGIN;

  DELETE FROM `users` WHERE `id` = 1;

COMMIT;
