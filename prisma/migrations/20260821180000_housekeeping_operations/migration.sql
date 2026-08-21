-- Phase 10 — housekeeping operations.
--
-- The module could record that a room was cleaned, and almost nothing else. Who
-- assigned the work, when it was assigned, who signed the room off, why a task was
-- cancelled and what made the room dirty in the first place were all either absent or
-- only inferable from the activity log — which exists to be prunable and therefore
-- cannot be the operational record of anything.
--
-- Every column here is additive and nullable, so the migration is safe on the rows
-- that already exist: a historical task keeps its timestamps and simply has no actor.

ALTER TABLE `housekeeping_tasks`
  ADD COLUMN `source` ENUM('CHECKOUT', 'MANUAL', 'INSPECTION_FAILED') NOT NULL DEFAULT 'MANUAL' AFTER `notes`,
  ADD COLUMN `sourceReservationId` VARCHAR(30) NULL AFTER `source`,
  ADD COLUMN `assignedAt` DATETIME(3) NULL AFTER `sourceReservationId`,
  ADD COLUMN `assignedById` VARCHAR(30) NULL AFTER `assignedAt`,
  ADD COLUMN `startedById` VARCHAR(30) NULL AFTER `startedAt`,
  ADD COLUMN `completedById` VARCHAR(30) NULL AFTER `completedAt`,
  ADD COLUMN `cancelledAt` DATETIME(3) NULL AFTER `completedById`,
  ADD COLUMN `cancelledById` VARCHAR(30) NULL AFTER `cancelledAt`,
  ADD COLUMN `cancellationReason` VARCHAR(255) NULL AFTER `cancelledById`,
  ADD COLUMN `createdById` VARCHAR(30) NULL AFTER `cancellationReason`;

-- Inspection describes the room as it stands now, so it sits beside the room's
-- housekeeping status rather than on the task that happened to precede it.
ALTER TABLE `units`
  ADD COLUMN `inspectedAt` DATETIME(3) NULL AFTER `maintenanceStatus`,
  ADD COLUMN `inspectedById` VARCHAR(30) NULL AFTER `inspectedAt`;

ALTER TABLE `housekeeping_tasks`
  ADD CONSTRAINT `housekeeping_tasks_sourceReservationId_fkey`
    FOREIGN KEY (`sourceReservationId`) REFERENCES `reservations`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `housekeeping_tasks_assignedById_fkey`
    FOREIGN KEY (`assignedById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `housekeeping_tasks_startedById_fkey`
    FOREIGN KEY (`startedById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `housekeeping_tasks_completedById_fkey`
    FOREIGN KEY (`completedById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `housekeeping_tasks_cancelledById_fkey`
    FOREIGN KEY (`cancelledById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `housekeeping_tasks_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `units`
  ADD CONSTRAINT `units_inspectedById_fkey`
    FOREIGN KEY (`inspectedById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- The board's default view: open work in a property, most urgent first.
CREATE INDEX `housekeeping_tasks_propertyId_status_priority_idx`
  ON `housekeeping_tasks`(`propertyId`, `status`, `priority`);
