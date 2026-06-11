-- 썸네일 컬럼 추가.
-- 기존 행이 있어 NOT NULL을 바로 추가할 수 없으므로:
--   1) nullable로 추가 → 2) 기존 행은 원본(data)으로 백필 → 3) NOT NULL로 변경
ALTER TABLE `photos` ADD COLUMN `thumb` MEDIUMTEXT NULL;
UPDATE `photos` SET `thumb` = `data` WHERE `thumb` IS NULL;
ALTER TABLE `photos` MODIFY `thumb` MEDIUMTEXT NOT NULL;
