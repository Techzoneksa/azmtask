import type { PrismaClient } from "../../src/generated/prisma/client";

import { toISODate } from "../../src/lib/datetime";

import type { Foundation } from "./seed-foundation";
import type { Random } from "./random";

/**
 * Activity history.
 *
 * Derived from the records that already exist rather than invented alongside them,
 * so the log tells the same story the data does: the check-in entry names the room
 * the reservation actually occupies, and its timestamp is the one on the stay.
 *
 * The acting identity is written into each row as a snapshot, which is what lets an
 * entry stay readable after a user is renamed or removed.
 */

type Actor = { id: string; name: string; email: string; roles: string[] };

export async function seedActivity(
  prisma: PrismaClient,
  random: Random,
  foundation: Foundation,
  actors: { reception: Actor; accountant: Actor; housekeeping: Actor; manager: Actor },
): Promise<number> {
  type Entry = {
    at: Date;
    actor: Actor;
    module: string;
    action: string;
    entityType: string;
    entityId: string;
    description: string;
    metadata?: Record<string, string | number | boolean | null>;
  };

  const entries: Entry[] = [];

  // --- reservations: created, checked in, checked out, cancelled -----------
  const reservations = await prisma.reservation.findMany({
    where: { propertyId: foundation.propertyId },
    select: {
      id: true, reservationNumber: true, status: true, createdAt: true,
      checkedInAt: true, checkedOutAt: true, cancelledAt: true, cancelReason: true,
      guest: { select: { fullName: true } },
      unit: { select: { unitNumber: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const reservation of reservations) {
    const room = reservation.unit?.unitNumber;

    entries.push({
      at: reservation.createdAt,
      actor: actors.reception,
      module: "reservations",
      action: "create",
      entityType: "Reservation",
      entityId: reservation.id,
      description: `إنشاء الحجز ${reservation.reservationNumber} باسم ${reservation.guest.fullName}`,
      metadata: { reservationNumber: reservation.reservationNumber, unit: room ?? null },
    });

    if (reservation.checkedInAt) {
      entries.push({
        at: reservation.checkedInAt,
        actor: actors.reception,
        module: "reservations",
        action: "checkin",
        entityType: "Reservation",
        entityId: reservation.id,
        description: `تسجيل دخول ${reservation.guest.fullName}${room ? ` — الغرفة ${room}` : ""}`,
      });
    }

    if (reservation.checkedOutAt) {
      entries.push({
        at: reservation.checkedOutAt,
        actor: actors.reception,
        module: "reservations",
        action: "checkout",
        entityType: "Reservation",
        entityId: reservation.id,
        description: `إتمام مغادرة ${reservation.guest.fullName}${room ? ` — الغرفة ${room}` : ""}`,
      });
    }

    if (reservation.cancelledAt) {
      entries.push({
        at: reservation.cancelledAt,
        actor: actors.reception,
        module: "reservations",
        action: "cancel",
        entityType: "Reservation",
        entityId: reservation.id,
        description: `إلغاء الحجز ${reservation.reservationNumber}${reservation.cancelReason ? ` — ${reservation.cancelReason}` : ""}`,
      });
    }
  }

  // --- payments ------------------------------------------------------------
  const payments = await prisma.payment.findMany({
    where: { propertyId: foundation.propertyId },
    select: {
      id: true, paymentNumber: true, amount: true, method: true, paymentDate: true,
      reservation: { select: { reservationNumber: true } },
    },
    orderBy: { paymentDate: "asc" },
    take: 60,
  });

  for (const payment of payments) {
    const isRefund = payment.amount.isNegative();
    entries.push({
      at: payment.paymentDate,
      actor: actors.accountant,
      module: "payments",
      action: isRefund ? "refund" : "create",
      entityType: "Payment",
      entityId: payment.id,
      description: isRefund
        ? `استرجاع مبلغ ${payment.amount.abs().toFixed(2)} ر.س للحجز ${payment.reservation.reservationNumber}`
        : `تسجيل دفعة ${payment.amount.toFixed(2)} ر.س للحجز ${payment.reservation.reservationNumber}`,
      metadata: { paymentNumber: payment.paymentNumber, method: payment.method },
    });
  }

  // --- invoices ------------------------------------------------------------
  const invoices = await prisma.invoice.findMany({
    where: { propertyId: foundation.propertyId },
    select: { id: true, invoiceNumber: true, total: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 30,
  });

  for (const invoice of invoices) {
    entries.push({
      at: invoice.createdAt,
      actor: actors.accountant,
      module: "invoices",
      action: "issue",
      entityType: "Invoice",
      entityId: invoice.id,
      description: `إصدار الفاتورة ${invoice.invoiceNumber} بمبلغ ${invoice.total.toFixed(2)} ر.س`,
    });
  }

  // --- housekeeping --------------------------------------------------------
  const tasks = await prisma.housekeepingTask.findMany({
    where: { propertyId: foundation.propertyId },
    select: {
      id: true, status: true, createdAt: true, completedAt: true,
      unit: { select: { unitNumber: true } },
      assignee: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  for (const task of tasks) {
    entries.push({
      at: task.createdAt,
      actor: actors.housekeeping,
      module: "housekeeping",
      action: task.assignee ? "assign" : "create",
      entityType: "HousekeepingTask",
      entityId: task.id,
      description: task.assignee
        ? `إسناد تنظيف الغرفة ${task.unit.unitNumber} إلى ${task.assignee.name}`
        : `إضافة مهمة تنظيف للغرفة ${task.unit.unitNumber}`,
    });

    if (task.completedAt) {
      entries.push({
        at: task.completedAt,
        actor: actors.housekeeping,
        module: "housekeeping",
        action: "complete",
        entityType: "HousekeepingTask",
        entityId: task.id,
        description: `إنهاء تنظيف الغرفة ${task.unit.unitNumber} وإعادتها للخدمة`,
      });
    }
  }

  // --- maintenance ---------------------------------------------------------
  const requests = await prisma.maintenanceRequest.findMany({
    where: { propertyId: foundation.propertyId },
    select: {
      id: true, issue: true, status: true, openedAt: true, completedAt: true,
      unit: { select: { unitNumber: true } },
    },
    orderBy: { openedAt: "desc" },
  });

  for (const request of requests) {
    const where = request.unit ? `الغرفة ${request.unit.unitNumber}` : "منطقة عامة";
    entries.push({
      at: request.openedAt,
      actor: actors.manager,
      module: "maintenance",
      action: "create",
      entityType: "MaintenanceRequest",
      entityId: request.id,
      description: `فتح بلاغ صيانة — ${where}: ${request.issue}`,
    });

    if (request.completedAt) {
      entries.push({
        at: request.completedAt,
        actor: actors.manager,
        module: "maintenance",
        action: "complete",
        entityType: "MaintenanceRequest",
        entityId: request.id,
        description: `إغلاق بلاغ صيانة — ${where}`,
      });
    }
  }

  // Chronological, so the activity screen reads as a narrative.
  entries.sort((a, b) => a.at.getTime() - b.at.getTime());

  // Trimmed to the recent tail: an audit screen wants the last few weeks, not a
  // wall of every event since the hotel opened.
  const kept = entries.slice(-150);

  await prisma.activityLog.createMany({
    data: kept.map((entry) => ({
      propertyId: foundation.propertyId,
      userId: entry.actor.id,
      userName: entry.actor.name,
      userEmail: entry.actor.email,
      userRoles: entry.actor.roles.join(","),
      module: entry.module,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      description: entry.description,
      metadata: entry.metadata ?? undefined,
      createdAt: entry.at,
    })),
  });

  return kept.length;
}

export { toISODate };
