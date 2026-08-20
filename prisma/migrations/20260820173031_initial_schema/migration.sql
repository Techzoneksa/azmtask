-- CreateTable
CREATE TABLE `properties` (
    `id` VARCHAR(30) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `type` ENUM('HOTEL', 'SERVICED_APARTMENT', 'RESORT') NOT NULL,
    `city` VARCHAR(80) NOT NULL,
    `address` VARCHAR(255) NULL,
    `phone` VARCHAR(24) NULL,
    `email` VARCHAR(160) NULL,
    `taxNumber` VARCHAR(40) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `properties_taxNumber_key`(`taxNumber`),
    INDEX `properties_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `unit_types` (
    `id` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 2,
    `baseRate` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `unit_types_propertyId_status_idx`(`propertyId`, `status`),
    UNIQUE INDEX `unit_types_propertyId_name_key`(`propertyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `units` (
    `id` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `unitTypeId` VARCHAR(30) NOT NULL,
    `unitNumber` VARCHAR(20) NOT NULL,
    `floor` INTEGER NULL,
    `status` ENUM('AVAILABLE', 'RESERVED', 'OCCUPIED', 'CLEANING', 'MAINTENANCE', 'BLOCKED') NOT NULL DEFAULT 'AVAILABLE',
    `housekeepingStatus` ENUM('CLEAN', 'DIRTY', 'CLEANING', 'INSPECTED') NOT NULL DEFAULT 'CLEAN',
    `maintenanceStatus` ENUM('OPERATIONAL', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE') NOT NULL DEFAULT 'OPERATIONAL',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `units_propertyId_status_idx`(`propertyId`, `status`),
    INDEX `units_propertyId_housekeepingStatus_idx`(`propertyId`, `housekeepingStatus`),
    INDEX `units_unitTypeId_idx`(`unitTypeId`),
    UNIQUE INDEX `units_propertyId_unitNumber_key`(`propertyId`, `unitNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guests` (
    `id` VARCHAR(30) NOT NULL,
    `fullName` VARCHAR(160) NOT NULL,
    `nationality` VARCHAR(80) NULL,
    `mobile` VARCHAR(24) NULL,
    `email` VARCHAR(160) NULL,
    `identificationType` ENUM('NATIONAL_ID', 'IQAMA', 'PASSPORT', 'GCC_ID', 'OTHER') NULL,
    `identificationNumber` VARCHAR(40) NULL,
    `dateOfBirth` DATE NULL,
    `gender` ENUM('MALE', 'FEMALE') NULL,
    `notes` TEXT NULL,
    `preferences` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `guests_mobile_idx`(`mobile`),
    INDEX `guests_identificationNumber_idx`(`identificationNumber`),
    INDEX `guests_fullName_idx`(`fullName`),
    UNIQUE INDEX `guests_identificationType_identificationNumber_key`(`identificationType`, `identificationNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reservations` (
    `id` VARCHAR(30) NOT NULL,
    `reservationNumber` VARCHAR(24) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `guestId` VARCHAR(30) NOT NULL,
    `unitId` VARCHAR(30) NULL,
    `unitTypeId` VARCHAR(30) NOT NULL,
    `source` ENUM('DIRECT', 'WEBSITE', 'PHONE', 'WALK_IN', 'CHANNEL', 'CORPORATE') NOT NULL DEFAULT 'DIRECT',
    `checkInDate` DATE NOT NULL,
    `checkOutDate` DATE NOT NULL,
    `adults` INTEGER NOT NULL DEFAULT 1,
    `children` INTEGER NOT NULL DEFAULT 0,
    `nightlyRate` DECIMAL(12, 2) NOT NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `tax` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `additionalCharges` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `paidAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `balance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` ENUM('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'PENDING',
    `paymentStatus` ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED') NOT NULL DEFAULT 'UNPAID',
    `specialRequests` TEXT NULL,
    `internalNotes` TEXT NULL,
    `checkedInAt` DATETIME(3) NULL,
    `checkedOutAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelReason` VARCHAR(255) NULL,
    `createdById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `reservations_reservationNumber_key`(`reservationNumber`),
    INDEX `reservations_unitId_status_checkInDate_checkOutDate_idx`(`unitId`, `status`, `checkInDate`, `checkOutDate`),
    INDEX `reservations_propertyId_status_checkInDate_idx`(`propertyId`, `status`, `checkInDate`),
    INDEX `reservations_propertyId_checkOutDate_idx`(`propertyId`, `checkOutDate`),
    INDEX `reservations_guestId_idx`(`guestId`),
    INDEX `reservations_unitTypeId_idx`(`unitTypeId`),
    INDEX `reservations_paymentStatus_idx`(`paymentStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reservation_charges` (
    `id` VARCHAR(30) NOT NULL,
    `reservationId` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `outletId` VARCHAR(30) NULL,
    `category` ENUM('ROOM_SERVICE', 'LAUNDRY', 'RESTAURANT', 'EXTRA_BED', 'LATE_CHECKOUT', 'TRANSPORTATION', 'MINIBAR', 'OTHER') NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `quantity` DECIMAL(10, 2) NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(12, 2) NOT NULL,
    `tax` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL,
    `chargedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reservation_charges_reservationId_idx`(`reservationId`),
    INDEX `reservation_charges_propertyId_chargedAt_idx`(`propertyId`, `chargedAt`),
    INDEX `reservation_charges_outletId_idx`(`outletId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` VARCHAR(30) NOT NULL,
    `paymentNumber` VARCHAR(24) NOT NULL,
    `reservationId` VARCHAR(30) NOT NULL,
    `guestId` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `method` ENUM('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER') NOT NULL,
    `reference` VARCHAR(120) NULL,
    `notes` TEXT NULL,
    `paymentDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `payments_paymentNumber_key`(`paymentNumber`),
    INDEX `payments_reservationId_idx`(`reservationId`),
    INDEX `payments_propertyId_paymentDate_idx`(`propertyId`, `paymentDate`),
    INDEX `payments_guestId_idx`(`guestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` VARCHAR(30) NOT NULL,
    `invoiceNumber` VARCHAR(24) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `reservationId` VARCHAR(30) NOT NULL,
    `guestId` VARCHAR(30) NOT NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `tax` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `paid` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `balance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `issueDate` DATE NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invoices_invoiceNumber_key`(`invoiceNumber`),
    INDEX `invoices_reservationId_idx`(`reservationId`),
    INDEX `invoices_propertyId_status_idx`(`propertyId`, `status`),
    INDEX `invoices_guestId_idx`(`guestId`),
    INDEX `invoices_issueDate_idx`(`issueDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expenses` (
    `id` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `expenseNumber` VARCHAR(24) NOT NULL,
    `category` ENUM('MAINTENANCE', 'UTILITIES', 'SUPPLIES', 'CLEANING', 'SALARIES', 'MARKETING', 'OTHER') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `date` DATE NOT NULL,
    `paymentMethod` ENUM('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER') NOT NULL DEFAULT 'CASH',
    `description` TEXT NULL,
    `attachmentUrl` VARCHAR(500) NULL,
    `createdById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `expenses_expenseNumber_key`(`expenseNumber`),
    INDEX `expenses_propertyId_date_idx`(`propertyId`, `date`),
    INDEX `expenses_propertyId_category_idx`(`propertyId`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `housekeeping_tasks` (
    `id` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `unitId` VARCHAR(30) NOT NULL,
    `assignedEmployeeId` VARCHAR(30) NULL,
    `taskType` ENUM('CHECKOUT_CLEANING', 'STAY_OVER', 'DEEP_CLEANING', 'INSPECTION', 'TURNDOWN', 'OTHER') NOT NULL DEFAULT 'CHECKOUT_CLEANING',
    `status` ENUM('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `notes` TEXT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `housekeeping_tasks_unitId_status_idx`(`unitId`, `status`),
    INDEX `housekeeping_tasks_propertyId_status_idx`(`propertyId`, `status`),
    INDEX `housekeeping_tasks_assignedEmployeeId_status_idx`(`assignedEmployeeId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `maintenance_requests` (
    `id` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `unitId` VARCHAR(30) NULL,
    `assignedEmployeeId` VARCHAR(30) NULL,
    `issue` VARCHAR(255) NOT NULL,
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `status` ENUM('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `notes` TEXT NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `maintenance_requests_unitId_status_idx`(`unitId`, `status`),
    INDEX `maintenance_requests_propertyId_status_idx`(`propertyId`, `status`),
    INDEX `maintenance_requests_assignedEmployeeId_status_idx`(`assignedEmployeeId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employees` (
    `id` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `mobile` VARCHAR(24) NULL,
    `email` VARCHAR(160) NULL,
    `department` ENUM('MANAGEMENT', 'FRONT_OFFICE', 'HOUSEKEEPING', 'MAINTENANCE', 'FINANCE', 'FOOD_AND_BEVERAGE', 'SECURITY', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `position` VARCHAR(120) NULL,
    `employmentStatus` ENUM('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `employees_propertyId_employmentStatus_idx`(`propertyId`, `employmentStatus`),
    INDEX `employees_propertyId_department_idx`(`propertyId`, `department`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(30) NOT NULL,
    `employeeId` VARCHAR(30) NULL,
    `name` VARCHAR(160) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `passwordHash` VARCHAR(72) NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_employeeId_key`(`employeeId`),
    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` VARCHAR(30) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `module` VARCHAR(40) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `permissions_key_key`(`key`),
    INDEX `permissions_module_idx`(`module`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(30) NOT NULL,
    `key` VARCHAR(40) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `roleId` VARCHAR(30) NOT NULL,
    `permissionId` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `role_permissions_permissionId_idx`(`permissionId`),
    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `userId` VARCHAR(30) NOT NULL,
    `roleId` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_roles_roleId_idx`(`roleId`),
    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_logs` (
    `id` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NULL,
    `userId` VARCHAR(30) NULL,
    `userName` VARCHAR(160) NOT NULL,
    `userEmail` VARCHAR(160) NOT NULL,
    `userRoles` VARCHAR(255) NOT NULL,
    `module` VARCHAR(40) NOT NULL,
    `action` VARCHAR(60) NOT NULL,
    `entityType` VARCHAR(40) NOT NULL,
    `entityId` VARCHAR(30) NULL,
    `description` VARCHAR(500) NOT NULL,
    `metadata` JSON NULL,
    `ipAddress` VARCHAR(45) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_logs_userId_idx`(`userId`),
    INDEX `activity_logs_createdAt_idx`(`createdAt`),
    INDEX `activity_logs_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `activity_logs_propertyId_createdAt_idx`(`propertyId`, `createdAt`),
    INDEX `activity_logs_module_action_idx`(`module`, `action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_categories` (
    `id` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inventory_categories_propertyId_name_key`(`propertyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_items` (
    `id` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `categoryId` VARCHAR(30) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `sku` VARCHAR(60) NULL,
    `quantity` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `minimumQuantity` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `unit` VARCHAR(20) NOT NULL DEFAULT 'PCS',
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `inventory_items_propertyId_status_idx`(`propertyId`, `status`),
    INDEX `inventory_items_categoryId_idx`(`categoryId`),
    UNIQUE INDEX `inventory_items_propertyId_sku_key`(`propertyId`, `sku`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_transactions` (
    `id` VARCHAR(30) NOT NULL,
    `itemId` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `type` ENUM('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT') NOT NULL,
    `quantity` DECIMAL(12, 2) NOT NULL,
    `reference` VARCHAR(120) NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inventory_transactions_itemId_createdAt_idx`(`itemId`, `createdAt`),
    INDEX `inventory_transactions_propertyId_createdAt_idx`(`propertyId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outlets` (
    `id` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` ENUM('RESTAURANT', 'CAFE', 'LAUNDRY', 'ROOM_SERVICE', 'SPA', 'TRANSPORT', 'OTHER') NOT NULL,
    `location` VARCHAR(160) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `outlets_propertyId_status_idx`(`propertyId`, `status`),
    UNIQUE INDEX `outlets_propertyId_name_key`(`propertyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_settings` (
    `id` VARCHAR(30) NOT NULL,
    `propertyId` VARCHAR(30) NULL,
    `key` VARCHAR(80) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `system_settings_propertyId_key_key`(`propertyId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `unit_types` ADD CONSTRAINT `unit_types_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `units` ADD CONSTRAINT `units_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `units` ADD CONSTRAINT `units_unitTypeId_fkey` FOREIGN KEY (`unitTypeId`) REFERENCES `unit_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_guestId_fkey` FOREIGN KEY (`guestId`) REFERENCES `guests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_unitTypeId_fkey` FOREIGN KEY (`unitTypeId`) REFERENCES `unit_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation_charges` ADD CONSTRAINT `reservation_charges_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `reservations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation_charges` ADD CONSTRAINT `reservation_charges_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation_charges` ADD CONSTRAINT `reservation_charges_outletId_fkey` FOREIGN KEY (`outletId`) REFERENCES `outlets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation_charges` ADD CONSTRAINT `reservation_charges_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `reservations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_guestId_fkey` FOREIGN KEY (`guestId`) REFERENCES `guests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `reservations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_guestId_fkey` FOREIGN KEY (`guestId`) REFERENCES `guests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `housekeeping_tasks` ADD CONSTRAINT `housekeeping_tasks_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `housekeeping_tasks` ADD CONSTRAINT `housekeeping_tasks_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `housekeeping_tasks` ADD CONSTRAINT `housekeeping_tasks_assignedEmployeeId_fkey` FOREIGN KEY (`assignedEmployeeId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_requests` ADD CONSTRAINT `maintenance_requests_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_requests` ADD CONSTRAINT `maintenance_requests_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_requests` ADD CONSTRAINT `maintenance_requests_assignedEmployeeId_fkey` FOREIGN KEY (`assignedEmployeeId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_categories` ADD CONSTRAINT `inventory_categories_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `inventory_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `inventory_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outlets` ADD CONSTRAINT `outlets_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_settings` ADD CONSTRAINT `system_settings_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
