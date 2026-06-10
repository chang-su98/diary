-- AlterTable
ALTER TABLE `anniversaries` ADD COLUMN `authorId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `anniversaries` ADD CONSTRAINT `anniversaries_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
