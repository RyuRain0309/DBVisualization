-- Tables whose .ibd files back the sample in the ibd viewer and the parser tests.
SET SESSION cte_max_recursion_depth = 10000;
CREATE DATABASE sample;
USE sample;

-- Enough rows for a two-level clustered index, a secondary index, a few values long enough to
-- go to LOB pages, and some deleted rows.
CREATE TABLE users (
  id         INT PRIMARY KEY,
  name       VARCHAR(20)  NOT NULL,
  email      VARCHAR(100) NULL,
  bio        TEXT         NULL,
  created_at DATETIME     NOT NULL,
  KEY idx_name (name)
) ENGINE=InnoDB;

INSERT INTO users
WITH RECURSIVE n (i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 10000)
SELECT
  i,
  CONCAT('user', LPAD(i, 4, '0')),
  IF(i % 7 = 0, NULL, CONCAT('user', i, '@example.com')),
  CASE
    WHEN i % 1000 = 0 THEN REPEAT(CONCAT('long bio of user ', i, '. '), 1000)
    WHEN i % 5 = 0 THEN NULL
    ELSE CONCAT('hello, I am user ', i)
  END,
  TIMESTAMP('2026-01-01') + INTERVAL i MINUTE
FROM n;

DELETE FROM users WHERE id % 50 = 25;

-- ROW_FORMAT=COMPRESSED: the viewer has to recognise it and say it cannot read it.
CREATE TABLE zipped (id INT PRIMARY KEY, v VARCHAR(50))
  ENGINE=InnoDB ROW_FORMAT=COMPRESSED KEY_BLOCK_SIZE=8;
INSERT INTO zipped VALUES (1, 'a'), (2, 'b');
