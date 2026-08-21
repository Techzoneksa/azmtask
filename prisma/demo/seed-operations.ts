import type { PrismaClient } from "../../src/generated/prisma/client";

import { addDays } from "../../src/lib/datetime";

import { DEMO_BUSINESS_DATE } from "./constants";
import type { Random } from "./random";
import { instantOn } from "./seed-scenario";
import type { Foundation } from "./seed-foundation";
import type { UnitRole } from "./seed-reservations";

/**
 * Operations: housekeeping, maintenance, and the unit states that follow from them.
 *
 * Unit status is a derived field, so it is written here last — after the records
 * that justify it exist. A room is CLEANING because a task is in progress, not
 * because the seed decided so; a room is MAINTENANCE because a request is open. The
 * validator re-checks every one of these implications.
 */

const MAINTENANCE_ISSUES = [
  "المكيف لا يبرد بشكل كافٍ",
  "تسريب بسيط أسفل مغسلة الحمام",
  "عطل في القفل الإلكتروني للباب",
  "إضاءة الممر داخل الغرفة لا تعمل",
  "ضغط المياه منخفض في الدش",
  "التلفزيون لا يستقبل القنوات",
  "مقبض النافذة مكسور",
  "صرير في باب الخزانة",
] as const;

const HOUSEKEEPING_NOTES = [
  "تنظيف كامل بعد المغادرة",
  "تغيير المفارش والمناشف",
  "تنظيف عميق مطلوب — بقع على السجاد",
  "تجهيز الغرفة لوصول مبكر",
  "فحص وتدقيق قبل التسليم",
] as const;

export async function seedOperations(
  prisma: PrismaClient,
  random: Random,
  foundation: Foundation,
  roles: UnitRole[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const bump = (key: string, by = 1) => {
    counts[key] = (counts[key] ?? 0) + by;
  };

  const housekeepers = [
    foundation.employeeIds.hk_1,
    foundation.employeeIds.hk_2,
    foundation.employeeIds.hk_3,
    foundation.employeeIds.hk_4,
  ];
  const technicians = [foundation.employeeIds.mt_1, foundation.employeeIds.mt_2];

  // --- historical completed cleans ----------------------------------------
  // Every past checkout was cleaned; a sample is recorded so the housekeeping
  // history and the activity screen have something real behind them.
  const pastCheckouts = await prisma.reservation.findMany({
    where: {
      propertyId: foundation.propertyId,
      status: "CHECKED_OUT",
      checkOutDate: { lt: DEMO_BUSINESS_DATE },
      unitId: { not: null },
    },
    select: { unitId: true, checkOutDate: true },
    orderBy: { checkOutDate: "desc" },
    take: 45,
  });

  for (const checkout of pastCheckouts) {
    const dayOffset = Math.round(
      (checkout.checkOutDate.getTime() - DEMO_BUSINESS_DATE.getTime()) / 86_400_000,
    );

    await prisma.housekeepingTask.create({
      data: {
        propertyId: foundation.propertyId,
        unitId: checkout.unitId!,
        assignedEmployeeId: random.pick(housekeepers),
        taskType: "CHECKOUT_CLEANING",
        status: "COMPLETED",
        priority: "NORMAL",
        notes: random.chance(0.3) ? random.pick(HOUSEKEEPING_NOTES) : null,
        startedAt: instantOn(dayOffset, random.int(11, 13), random.int(0, 59)),
        completedAt: instantOn(dayOffset, random.int(14, 16), random.int(0, 59)),
        createdAt: instantOn(dayOffset, random.int(10, 11), random.int(0, 59)),
      },
    });
    bump("housekeeping.COMPLETED");
  }

  // --- today's operational state ------------------------------------------
  for (const [index, unit] of foundation.units.entries()) {
    const role = roles[index];

    switch (role) {
      case "occupied":
      case "departing_today": {
        await prisma.unit.update({
          where: { id: unit.id },
          data: { status: "OCCUPIED", housekeepingStatus: "CLEAN", maintenanceStatus: "OPERATIONAL" },
        });
        // Mid-stay service for a few in-house rooms.
        if (random.chance(0.25)) {
          await prisma.housekeepingTask.create({
            data: {
              propertyId: foundation.propertyId,
              unitId: unit.id,
              assignedEmployeeId: random.pick(housekeepers),
              taskType: "STAY_OVER",
              status: "COMPLETED",
              priority: "LOW",
              startedAt: instantOn(0, 10, random.int(0, 59)),
              completedAt: instantOn(0, 11, random.int(0, 59)),
              createdAt: instantOn(0, 9, random.int(0, 59)),
            },
          });
          bump("housekeeping.COMPLETED");
        }
        break;
      }

      case "arriving_today": {
        await prisma.unit.update({
          where: { id: unit.id },
          data: { status: "RESERVED", housekeepingStatus: "INSPECTED", maintenanceStatus: "OPERATIONAL" },
        });
        // Inspected and signed off, ready for the arrival.
        await prisma.housekeepingTask.create({
          data: {
            propertyId: foundation.propertyId,
            unitId: unit.id,
            assignedEmployeeId: foundation.employeeIds.hk_super,
            taskType: "INSPECTION",
            status: "COMPLETED",
            priority: "NORMAL",
            notes: "تجهيز الغرفة لوصول اليوم",
            startedAt: instantOn(0, 8, random.int(0, 59)),
            completedAt: instantOn(0, 9, random.int(0, 59)),
            createdAt: instantOn(-1, 18, random.int(0, 59)),
          },
        });
        bump("housekeeping.COMPLETED");
        break;
      }

      case "dirty": {
        // Guest left this morning; nobody has started on the room yet.
        await prisma.unit.update({
          where: { id: unit.id },
          data: { status: "CLEANING", housekeepingStatus: "DIRTY", maintenanceStatus: "OPERATIONAL" },
        });
        await prisma.housekeepingTask.create({
          data: {
            propertyId: foundation.propertyId,
            unitId: unit.id,
            assignedEmployeeId: random.chance(0.5) ? random.pick(housekeepers) : null,
            taskType: "CHECKOUT_CLEANING",
            status: random.chance(0.5) ? "ASSIGNED" : "PENDING",
            priority: random.chance(0.3) ? "HIGH" : "NORMAL",
            notes: random.pick(HOUSEKEEPING_NOTES),
            createdAt: instantOn(0, random.int(11, 12), random.int(0, 59)),
          },
        });
        bump("housekeeping.PENDING");
        break;
      }

      case "cleaning": {
        // Housekeeping is in the room right now.
        await prisma.unit.update({
          where: { id: unit.id },
          data: { status: "CLEANING", housekeepingStatus: "CLEANING", maintenanceStatus: "OPERATIONAL" },
        });
        await prisma.housekeepingTask.create({
          data: {
            propertyId: foundation.propertyId,
            unitId: unit.id,
            assignedEmployeeId: random.pick(housekeepers),
            taskType: random.chance(0.3) ? "DEEP_CLEANING" : "CHECKOUT_CLEANING",
            status: "IN_PROGRESS",
            priority: "HIGH",
            notes: "جارٍ التنظيف الآن",
            startedAt: instantOn(0, random.int(12, 14), random.int(0, 59)),
            createdAt: instantOn(-1, random.int(12, 14), random.int(0, 59)),
          },
        });
        bump("housekeeping.IN_PROGRESS");
        break;
      }

      case "maintenance": {
        // Out of service until the fault is closed.
        await prisma.unit.update({
          where: { id: unit.id },
          data: { status: "MAINTENANCE", housekeepingStatus: "CLEAN", maintenanceStatus: "OUT_OF_SERVICE" },
        });
        await prisma.maintenanceRequest.create({
          data: {
            propertyId: foundation.propertyId,
            unitId: unit.id,
            issue: random.pick(MAINTENANCE_ISSUES),
            priority: random.chance(0.5) ? "HIGH" : "URGENT",
            status: random.chance(0.5) ? "IN_PROGRESS" : "ASSIGNED",
            assignedEmployeeId: random.pick(technicians),
            notes: "الغرفة خارج الخدمة حتى إصلاح العطل",
            openedAt: instantOn(-random.int(1, 3), random.int(9, 17), random.int(0, 59)),
            createdAt: instantOn(-random.int(1, 3), random.int(9, 17), random.int(0, 59)),
          },
        });
        bump("maintenance.active");
        break;
      }

      case "blocked": {
        /*
         * The block record is the reason the room is off the market, and Stage 5 made
         * it the canonical one — availability, the unit board and the calendar all
         * read it. The scenario used to set the unit's status and leave a note and
         * nothing else, which meant the demo had a room marked BLOCKED that no record
         * explained, and a calendar with nothing to draw.
         */
        await prisma.unitBlock.create({
          data: {
            propertyId: foundation.propertyId,
            unitId: unit.id,
            reason: "STAFF_USE",
            notes: "محجوزة لإقامة طاقم التشغيل خلال أعمال التجديد بالطابق الرابع",
            // Open-ended: it lifts when the renovation finishes, not on a date
            // anybody has committed to.
            startDate: addDays(DEMO_BUSINESS_DATE, -4),
            endDate: null,
            active: true,
            createdById: foundation.userIds.hotel_manager ?? null,
            createdAt: instantOn(-4, 9, 30),
          },
        });

        await prisma.unit.update({
          where: { id: unit.id },
          data: {
            status: "BLOCKED",
            housekeepingStatus: "CLEAN",
            maintenanceStatus: "OPERATIONAL",
            // The reason belongs on the record, not in someone's memory.
            notes: "محجوزة لإقامة طاقم التشغيل خلال أعمال التجديد بالطابق الرابع",
          },
        });
        break;
      }

      case "available":
      default: {
        await prisma.unit.update({
          where: { id: unit.id },
          data: { status: "AVAILABLE", housekeepingStatus: "CLEAN", maintenanceStatus: "OPERATIONAL" },
        });
        break;
      }
    }
  }

  // --- maintenance history -------------------------------------------------
  // A few closed faults on rooms that are back in service, plus one open request
  // that does not take a room out of service (a minor fault).
  const operationalUnits = foundation.units.filter((_, i) => roles[i] !== "maintenance");

  for (let i = 0; i < 4; i++) {
    const unit = random.pick(operationalUnits);
    const openedOffset = -random.int(6, 30);
    const closedOffset = openedOffset + random.int(1, 4);

    await prisma.maintenanceRequest.create({
      data: {
        propertyId: foundation.propertyId,
        unitId: unit.id,
        issue: random.pick(MAINTENANCE_ISSUES),
        priority: random.pick(["LOW", "NORMAL", "HIGH"]),
        status: "COMPLETED",
        assignedEmployeeId: random.pick(technicians),
        notes: "تم الإصلاح وإعادة الغرفة للخدمة",
        openedAt: instantOn(openedOffset, random.int(9, 16)),
        completedAt: instantOn(closedOffset, random.int(10, 17)),
        createdAt: instantOn(openedOffset, random.int(9, 16)),
      },
    });
    bump("maintenance.COMPLETED");
  }

  // A fault outside the rooms — the lobby lift. Proves unitId is legitimately null.
  await prisma.maintenanceRequest.create({
    data: {
      propertyId: foundation.propertyId,
      issue: "صوت غير معتاد في مصعد اللوبي — يحتاج فحص دوري",
      priority: "NORMAL",
      status: "OPEN",
      notes: "بانتظار زيارة الشركة المتعاقدة",
      openedAt: instantOn(-2, 11),
      createdAt: instantOn(-2, 11),
    },
  });
  bump("maintenance.OPEN");

  return counts;
}
