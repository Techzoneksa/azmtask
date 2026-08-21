import "server-only";

import { ReservationStatus, UnitStatus } from "@/generated/prisma/enums";

/**
 * What the occupancy numbers mean.
 *
 * This module exists because two screens showed a figure called "مغادرات اليوم" and
 * gave different answers — 5 on the dashboard, 10 on the calendar. Both were correct
 * under their own definition, which is precisely the problem: a manager reading one
 * number on one screen and a different number with the same name on the next has no
 * way to tell which is wrong, and concludes that both are.
 *
 * There are genuinely two families of question here, and they are not the same:
 *
 * **What is happening in the building right now.** A room with a guest asleep in it is
 * occupied, even if that guest leaves at eleven. A room is ready when it is empty,
 * clean and working. These come from the unit's own state column, which the operations
 * screens maintain, and they are what a receptionist standing at the desk needs.
 *
 * **What is sold for a given night.** A room whose guest departs this morning is *not*
 * sold tonight — it is on the market again. A room booked for tonight is sold even if
 * nobody has arrived yet. These come from the reservation calendar, and they are what
 * decides whether the next booking can be taken.
 *
 * Neither is more true than the other. They answer different questions, so they carry
 * different names — and nothing in the system is allowed to call two of them the same
 * thing. The labels below are the vocabulary; the predicates are the single definition
 * of each, imported by both the dashboard and the calendar so they cannot drift.
 */

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/**
 * The Arabic label for every occupancy figure in the system.
 *
 * Kept together deliberately: two labels that would read the same are visible as a
 * collision here, at the moment someone adds one, rather than as a contradiction a
 * manager finds between two screens.
 */
export const OCCUPANCY_LABELS = {
  /** Rooms with a guest physically in them, including today's departures. */
  occupiedNow: "مشغولة الآن",
  /** Rooms empty, clean and working — sellable to someone standing at the desk. */
  readyNow: "متاحة وجاهزة الآن",
  /** Rooms sold for the selected night. Today's departures are not among them. */
  soldOnDate: "مبيعة الليلة",
  /** Rooms not sold for that night, whatever their housekeeping state. */
  sellableOnDate: "قابلة للبيع الليلة",
  /** Bookings due to arrive that have not been checked in yet. */
  expectedArrivals: "وصولات متوقعة اليوم",
  /** Everyone arriving that day, including those already checked in. */
  allArrivals: "إجمالي وصولات اليوم",
  /** Guests still in the building who are due to leave. */
  remainingDepartures: "مغادرات متبقية اليوم",
  /** Everyone leaving that day, including those already gone. */
  allDepartures: "إجمالي مغادرات اليوم",
} as const;

// ---------------------------------------------------------------------------
// Building state — the unit's own status column
// ---------------------------------------------------------------------------

/**
 * A room with a guest in it right now.
 *
 * Read from the unit's status rather than the calendar, because that is the question:
 * is somebody in there. A guest checking out at eleven occupies the room until they
 * do, and the room is not available to hand to anyone until housekeeping has been.
 */
export const OCCUPIED_NOW_STATUS = UnitStatus.OCCUPIED;

/**
 * A room that can be handed to somebody standing at the desk.
 *
 * Deliberately narrow: `AVAILABLE` means empty *and* clean *and* operational. A room
 * awaiting a clean is not ready, even though it is perfectly sellable for tonight —
 * which is exactly why that other figure has its own name.
 */
export const READY_NOW_STATUS = UnitStatus.AVAILABLE;

// ---------------------------------------------------------------------------
// Night inventory — the reservation calendar
// ---------------------------------------------------------------------------

/**
 * Bookings that hold a room for a night.
 *
 * Re-exported from availability so there is one definition of "sold"; see that module
 * for why PENDING is not among them.
 */
export { INVENTORY_STATUSES } from "./services/availability.service";

/**
 * A reservation covers a night when it started on or before it and has not ended.
 *
 * Half-open, exactly as everywhere else: a booking of 20→22 covers the nights of the
 * 20th and 21st. A guest whose check-out is the 20th did not sleep there on the 20th,
 * so their room is sold to somebody else that night — which is why the number of rooms
 * sold tonight is smaller than the number of rooms with a guest in them this morning.
 */
export const coversNight = (date: Date) => ({
  checkInDate: { lte: date },
  checkOutDate: { gt: date },
});

// ---------------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------------

/**
 * Bookings due to arrive on a date and not yet checked in.
 *
 * PENDING is included here and nowhere else in the occupancy figures: an unconfirmed
 * booking takes no inventory, but somebody may still walk through the door with it,
 * and the arrivals list is a list of people to expect rather than rooms committed.
 */
export const expectedArrivalsOn = (date: Date) => ({
  checkInDate: date,
  status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.PENDING] },
});

/** Everyone arriving on a date, including those who have already checked in. */
export const allArrivalsOn = (date: Date) => ({
  checkInDate: date,
  status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN] },
});

/**
 * Guests still in the building who are due to leave.
 *
 * The desk's working list: who still has to be checked out before the day is done.
 */
export const remainingDeparturesOn = (date: Date) => ({
  checkOutDate: date,
  status: { in: [ReservationStatus.CHECKED_IN] },
});

/**
 * Everyone leaving on a date, whether or not they have gone.
 *
 * The day's total, which is what a calendar reports — and roughly twice the desk's
 * remaining list by mid-morning, because half of them have already left.
 */
export const allDeparturesOn = (date: Date) => ({
  checkOutDate: date,
  status: { in: [ReservationStatus.CHECKED_IN, ReservationStatus.CHECKED_OUT] },
});
