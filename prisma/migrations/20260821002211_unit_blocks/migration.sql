-- CreateTable
CREATE TABLE `unit_blocks` (
    `id` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `unitId` VARCHAR(30) NOT NULL,
    `reason` ENUM('RENOVATION', 'DEEP_CLEANING', 'STAFF_USE', 'OWNER_USE', 'LONG_TERM_MAINTENANCE', 'SEASONAL_CLOSURE', 'OTHER') NOT NULL,
    `notes` TEXT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `endedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(30) NULL,
    `endedById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `unit_blocks_unitId_active_startDate_idx`(`unitId`, `active`, `startDate`),
    INDEX `unit_blocks_propertyId_active_idx`(`propertyId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `unit_blocks` ADD CONSTRAINT `unit_blocks_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `unit_blocks` ADD CONSTRAINT `unit_blocks_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `unit_blocks` ADD CONSTRAINT `unit_blocks_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `unit_blocks` ADD CONSTRAINT `unit_blocks_endedById_fkey` FOREIGN KEY (`endedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
