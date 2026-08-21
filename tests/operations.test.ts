import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { recordMovement } from "@/server/services/inventory.service";
import { checkInReservation } from "@/server/services/checkin.service";
import { createReservation } from "@/server/services/reservation.service";
import { checkOut, completeHousekeepingTask } from "@/server/services/stay.service";

import {
  TEST_ACTOR,
  resetDatabase,
  seedCheckInGuest,
  seedProperty,
  setBusinessDate,
} from "./helpers";

/**
 * Operations — the stay lifecycle, housekeeping, maintenance and stock.
 *
 * These verify the linkages the brief asks for: a checkout must put the room into
 * the cleaning queue by itself, and completing that clean must return it to the
 * market. Nobody should have to remember to do either by hand.
 *
 * Arrivals themselves are Stage 9's subject and live in `checkin.test.ts`; here
 * check-in is only the setup a departure needs, performed through the same canonical
 * command the front desk uses so the fixture cannot drift from the real path.
 */

let ctx: Awaited<ReturnType<typeof seedProperty>>;
let guest: Awaited<ReturnType<typeof seedCheckInGuest>>;
let reservationId: string;

const arrive = (id: string) => checkInReservation({ reservationId: id }, TEST_ACTOR);

beforeEach(async () => {
  await resetDatabase();
  ctx = await seedProperty({ unitNumber: "101" });
  guest = await seedCheckInGuest();
  await setBusinessDate("2026-08-20");

  const reservation = await createReservation(
    {
      propertyId: ctx.property.id,
      guestId: guest.id,
      unitId: ctx.unit.id,
      unitTypeId: ctx.unitType.id,
      checkInDate: "2026-08-20",
      checkOutDate: "2026-08-23",
      adults: 2,
      nightlyRate: "450.00",
      status: "CONFIRMED",
    } as never,
    TEST_ACTOR,
  );
  reservationId = reservation.id;
});

async function unitState() {
  return prisma.unit.findUniqueOrThrow({
    where: { id: ctx.unit.id },
    select: { status: true, housekeepingStatus: true, maintenanceStatus: true },
  });
}

describe("check-out", () => {
  beforeEach(async () => {
    await arrive(reservationId);
  });

  it("blocks on an outstanding balance", async () => {
    await expect(checkOut(reservationId, TEST_ACTOR)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("completes when the balance is settled", async () => {
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { paidAmount: "1350.00", balance: "0.00", paymentStatus: "PAID" },
    });

    const result = await checkOut(reservationId, TEST_ACTOR);
    expect(result.status).toBe("CHECKED_OUT");
    expect(result.checkedOutAt).toBeInstanceOf(Date);
  });

  it("completes with an override when authorised", async () => {
    const result = await checkOut(reservationId, TEST_ACTOR, {
      allowOutstandingBalance: true,
    });
    expect(result.status).toBe("CHECKED_OUT");
  });

  it("puts the room into the cleaning queue automatically", async () => {
    await checkOut(reservationId, TEST_ACTOR, { allowOutstandingBalance: true });

    const unit = await unitState();
    expect(unit.status).toBe("CLEANING");
    expect(unit.housekeepingStatus).toBe("DIRTY");

    const tasks = await prisma.housekeepingTask.findMany({
      where: { unitId: ctx.unit.id },
      select: { status: true, taskType: true, priority: true },
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("PENDING");
    expect(tasks[0].taskType).toBe("CHECKOUT_CLEANING");
  });

  it("does not queue a duplicate clean for a room already waiting", async () => {
    /*
     * A clean is already queued for this room — a stay-over service booked while the
     * guest is still in it. The departure must not add a second one to the same room.
     *
     * This used to be written as two consecutive stays in the same room, which Stage 9
     * made impossible for the right reason: the first checkout leaves the room DIRTY,
     * and check-in now refuses a room that has not been cleaned. The scenario the test
     * is actually about — checkout finding an open task — is reached directly instead.
     */
    await prisma.housekeepingTask.create({
      data: {
        propertyId: ctx.property.id,
        unitId: ctx.unit.id,
        taskType: "STAY_OVER",
        status: "PENDING",
        priority: "NORMAL",
      },
    });

    await checkOut(reservationId, TEST_ACTOR, { allowOutstandingBalance: true });

    const openTasks = await prisma.housekeepingTask.count({
      where: { unitId: ctx.unit.id, status: "PENDING" },
    });
    expect(openTasks).toBe(1);
  });

  it("refuses to check out a stay that never checked in", async () => {
    const other = await createReservation(
      {
        propertyId: ctx.property.id,
        guestId: guest.id,
        unitTypeId: ctx.unitType.id,
        checkInDate: "2026-10-01",
        checkOutDate: "2026-10-02",
        adults: 1,
        nightlyRate: "400.00",
      } as never,
      TEST_ACTOR,
    );

    await expect(checkOut(other.id, TEST_ACTOR)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("housekeeping", () => {
  it("returns the room to available once cleaning completes", async () => {
    await arrive(reservationId);
    await checkOut(reservationId, TEST_ACTOR, { allowOutstandingBalance: true });

    const task = await prisma.housekeepingTask.findFirstOrThrow({
      where: { unitId: ctx.unit.id, status: "PENDING" },
    });

    await completeHousekeepingTask(task.id, TEST_ACTOR);

    const unit = await unitState();
    expect(unit.housekeepingStatus).toBe("CLEAN");
    expect(unit.status).toBe("AVAILABLE");
  });

  it("keeps a room out of service when maintenance is still open", async () => {
    await arrive(reservationId);
    await checkOut(reservationId, TEST_ACTOR, { allowOutstandingBalance: true });
    await prisma.unit.update({
      where: { id: ctx.unit.id },
      data: { maintenanceStatus: "OUT_OF_SERVICE" },
    });

    const task = await prisma.housekeepingTask.findFirstOrThrow({
      where: { unitId: ctx.unit.id, status: "PENDING" },
    });
    await completeHousekeepingTask(task.id, TEST_ACTOR);

    const unit = await unitState();
    expect(unit.housekeepingStatus).toBe("CLEAN");
    expect(unit.status).toBe("MAINTENANCE");
  });

  it("links a task to its unit and to an assignable employee", async () => {
    const employee = await prisma.employee.create({
      data: { propertyId: ctx.property.id, name: "عاملة نظافة", department: "HOUSEKEEPING" },
    });

    const task = await prisma.housekeepingTask.create({
      data: {
        propertyId: ctx.property.id,
        unitId: ctx.unit.id,
        assignedEmployeeId: employee.id,
        taskType: "DEEP_CLEANING",
        priority: "HIGH",
      },
      select: {
        unit: { select: { unitNumber: true } },
        assignee: { select: { name: true } },
        status: true,
      },
    });

    expect(task.unit.unitNumber).toBe("101");
    expect(task.assignee?.name).toBe("عاملة نظافة");
    expect(task.status).toBe("PENDING");
  });

  it("keeps the task when its assigned employee is removed", async () => {
    const employee = await prisma.employee.create({
      data: { propertyId: ctx.property.id, name: "موظف مغادر", department: "HOUSEKEEPING" },
    });
    const task = await prisma.housekeepingTask.create({
      data: { propertyId: ctx.property.id, unitId: ctx.unit.id, assignedEmployeeId: employee.id },
    });

    await prisma.employee.delete({ where: { id: employee.id } });

    const survivor = await prisma.housekeepingTask.findUniqueOrThrow({
      where: { id: task.id },
      select: { assignedEmployeeId: true },
    });
    expect(survivor.assignedEmployeeId).toBeNull();
  });
});

describe("maintenance", () => {
  it("moves through its status lifecycle with relationships intact", async () => {
    const employee = await prisma.employee.create({
      data: { propertyId: ctx.property.id, name: "فني صيانة", department: "MAINTENANCE" },
    });

    const request = await prisma.maintenanceRequest.create({
      data: {
        propertyId: ctx.property.id,
        unitId: ctx.unit.id,
        issue: "تسريب في المغسلة",
        priority: "HIGH",
      },
    });
    expect(request.status).toBe("OPEN");

    const assigned = await prisma.maintenanceRequest.update({
      where: { id: request.id },
      data: { assignedEmployeeId: employee.id, status: "ASSIGNED" },
      select: { status: true, assignee: { select: { name: true } }, unit: { select: { unitNumber: true } } },
    });
    expect(assigned.status).toBe("ASSIGNED");
    expect(assigned.assignee?.name).toBe("فني صيانة");
    expect(assigned.unit?.unitNumber).toBe("101");

    const completed = await prisma.maintenanceRequest.update({
      where: { id: request.id },
      data: { status: "COMPLETED", completedAt: new Date() },
      select: { status: true, completedAt: true },
    });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.completedAt).toBeInstanceOf(Date);
  });

  it("allows a request with no unit, for a fault outside the rooms", async () => {
    const request = await prisma.maintenanceRequest.create({
      data: { propertyId: ctx.property.id, issue: "عطل في مصعد اللوبي", priority: "URGENT" },
    });
    expect(request.unitId).toBeNull();
  });
});

describe("inventory", () => {
  it("derives the quantity from movements, never from a supplied figure", async () => {
    const category = await prisma.inventoryCategory.create({
      data: { propertyId: ctx.property.id, name: "مستلزمات النظافة" },
    });
    const item = await prisma.inventoryItem.create({
      data: {
        propertyId: ctx.property.id,
        categoryId: category.id,
        name: "مناشف",
        minimumQuantity: "20",
        unit: "PCS",
      },
    });

    await recordMovement({ itemId: item.id, type: "STOCK_IN", quantity: 100 } as never, TEST_ACTOR);
    await recordMovement({ itemId: item.id, type: "STOCK_OUT", quantity: 30 } as never, TEST_ACTOR);
    await recordMovement({ itemId: item.id, type: "ADJUSTMENT", quantity: -5 } as never, TEST_ACTOR);

    const stored = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: item.id },
      select: { quantity: true },
    });
    const movements = await prisma.inventoryTransaction.aggregate({
      where: { itemId: item.id },
      _sum: { quantity: true },
    });

    expect(stored.quantity.toFixed(2)).toBe("65.00");
    expect(stored.quantity.toFixed(2)).toBe(movements._sum.quantity?.toFixed(2));
  });

  it("refuses to issue more stock than exists", async () => {
    const category = await prisma.inventoryCategory.create({
      data: { propertyId: ctx.property.id, name: "مستلزمات" },
    });
    const item = await prisma.inventoryItem.create({
      data: { propertyId: ctx.property.id, categoryId: category.id, name: "صابون" },
    });

    await recordMovement({ itemId: item.id, type: "STOCK_IN", quantity: 10 } as never, TEST_ACTOR);

    await expect(
      recordMovement({ itemId: item.id, type: "STOCK_OUT", quantity: 50 } as never, TEST_ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const stored = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: item.id },
      select: { quantity: true },
    });
    expect(stored.quantity.toFixed(2)).toBe("10.00");
  });

  it("stays correct under concurrent movements", async () => {
    const category = await prisma.inventoryCategory.create({
      data: { propertyId: ctx.property.id, name: "تزامن" },
    });
    const item = await prisma.inventoryItem.create({
      data: { propertyId: ctx.property.id, categoryId: category.id, name: "أكياس" },
    });
    await recordMovement({ itemId: item.id, type: "STOCK_IN", quantity: 100 } as never, TEST_ACTOR);

    await Promise.all(
      Array.from({ length: 10 }, () =>
        recordMovement({ itemId: item.id, type: "STOCK_OUT", quantity: 5 } as never, TEST_ACTOR),
      ),
    );

    const stored = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: item.id },
      select: { quantity: true },
    });
    expect(stored.quantity.toFixed(2)).toBe("50.00");
  });
});
