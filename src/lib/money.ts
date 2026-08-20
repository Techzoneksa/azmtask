import { Prisma } from "@/generated/prisma/client";

/**
 * Money.
 *
 * Every riyal amount in this system is a fixed-point decimal, never a JavaScript
 * number. `0.1 + 0.2 === 0.30000000000000004` is not an abstract concern for a
 * property that adds a laundry charge to a room rate a few hundred times a day —
 * the drift lands in a guest's invoice.
 *
 * The rule this module enforces: amounts stay `Decimal` from the database through
 * every calculation, and become a `number` or a string only at the display edge.
 */

export type Money = Prisma.Decimal;
export const Money = Prisma.Decimal;

/** Scale of every monetary column: Decimal(12, 2). */
export const MONEY_SCALE = 2;

export const ZERO: Money = new Prisma.Decimal(0);

export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

/**
 * Coerces any accepted representation to a Decimal rounded to two places.
 * Null, undefined and unparseable input become zero rather than NaN — a total that
 * silently becomes NaN corrupts every figure downstream of it.
 */
export function money(value: MoneyInput): Money {
  if (value === null || value === undefined || value === "") return ZERO;

  try {
    const decimal = new Prisma.Decimal(value);
    if (!decimal.isFinite()) return ZERO;
    return decimal.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
  } catch {
    return ZERO;
  }
}

export function add(...values: MoneyInput[]): Money {
  return values
    .reduce<Money>((sum, value) => sum.plus(money(value)), ZERO)
    .toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

export function subtract(from: MoneyInput, ...values: MoneyInput[]): Money {
  return values
    .reduce<Money>((total, value) => total.minus(money(value)), money(from))
    .toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

export function multiply(value: MoneyInput, factor: MoneyInput): Money {
  return money(value)
    .times(money(factor))
    .toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/** Percentage of an amount — VAT, service charge, a percentage discount. */
export function percentOf(value: MoneyInput, percent: MoneyInput): Money {
  return money(value)
    .times(money(percent))
    .dividedBy(100)
    .toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

export function isZero(value: MoneyInput): boolean {
  return money(value).isZero();
}

export function isNegative(value: MoneyInput): boolean {
  return money(value).isNegative();
}

export function isPositive(value: MoneyInput): boolean {
  return money(value).greaterThan(0);
}

export function equals(a: MoneyInput, b: MoneyInput): boolean {
  return money(a).equals(money(b));
}

export function greaterThan(a: MoneyInput, b: MoneyInput): boolean {
  return money(a).greaterThan(money(b));
}

export function max(a: MoneyInput, b: MoneyInput): Money {
  const left = money(a);
  const right = money(b);
  return left.greaterThan(right) ? left : right;
}

/** Clamps a negative result to zero — a balance never goes below nothing. */
export function atLeastZero(value: MoneyInput): Money {
  const amount = money(value);
  return amount.isNegative() ? ZERO : amount;
}

/**
 * Plain number, for the display layer only. Never feed the result back into a
 * calculation: that is exactly the float round-trip this module exists to prevent.
 */
export function toNumber(value: MoneyInput): number {
  return money(value).toNumber();
}

/** Canonical "1234.50" string — for JSON payloads crossing to the client. */
export function toAmountString(value: MoneyInput): string {
  return money(value).toFixed(MONEY_SCALE);
}
