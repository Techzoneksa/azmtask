-- AlterTable
ALTER TABLE `reservations` ADD COLUMN `cancelledById` VARCHAR(30) NULL,
    ADD COLUMN `idempotencyKey` VARCHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `reservations_idempotencyKey_key` ON `reservations`(`idempotencyKey`);

-- CreateIndex
CREATE INDEX `reservations_unitTypeId_status_checkInDate_checkOutDate_idx` ON `reservations`(`unitTypeId`, `status`, `checkInDate`, `checkOutDate`);

-- AddForeignKey
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_cancelledById_fkey` FOREIGN KEY (`cancelledById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

