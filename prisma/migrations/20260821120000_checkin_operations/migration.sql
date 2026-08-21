-- Phase 9 — check-in and active stay operations.
--
-- Two operational facts the schema could not previously record:
--
--   checkedInById  who completed the arrival. `checkedInAt` already stored when,
--                  but a stay record that names the moment and not the person
--                  answers half of every question ever asked of it.
--
--   noShow*        a guest who never arrived is not a cancellation. Overloading the
--                  cancellation columns would make the two indistinguishable in
--                  every later report, and they carry different money.
--
-- All nullable, so the migration is safe on a table with existing rows: a booking
-- checked in before this migration keeps its timestamp and simply has no actor.

ALTER TABLE `reservations`
  ADD COLUMN `checkedInById` VARCHAR(30) NULL AFTER `checkedInAt`,
  ADD COLUMN `noShowAt` DATETIME(3) NULL AFTER `cancelledById`,
  ADD COLUMN `noShowById` VARCHAR(30) NULL AFTER `noShowAt`,
  ADD COLUMN `noShowReason` VARCHAR(255) NULL AFTER `noShowById`;

ALTER TABLE `reservations`
  ADD CONSTRAINT `reservations_checkedInById_fkey`
    FOREIGN KEY (`checkedInById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `reservations_noShowById_fkey`
    FOREIGN KEY (`noShowById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
