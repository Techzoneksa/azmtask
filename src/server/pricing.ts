import "server-only";

import { cache } from "react";

import * as Money from "@/lib/money";
import { prisma } from "@/lib/db";

/**
 * Reservation pricing.
 *
 * One function computes a stay's money, and the server is the only place it runs.
 * The browser may preview a total to keep the form responsive, but nothing it
 * calculates is ever stored — a price agreed in JavaScript and recorded by SQL is two
 * prices, and the difference shows up in a folio nobody can reconcile.
 *
 * Every figure is fixed-point through `@/lib/money`. Floating point drifts by
 * fractions of a halala per line, which is invisible for one night and wrong by real
 * money across a folio of thirty.
 */

/** Where the VAT rate lives. A property row overrides the global default. */
export const VAT_RATE_KEY = "tax.vatRate";

/** Used only when nothing is configured. Saudi standard rate at time of writing. */
export const DEFAULT_VAT_RATE = "15";

/**
 * The property's VAT rate, as a percentage.
 *
 * Read from settings rather than written into the code, because a tax rate is a
 * jurisdiction's decision and it has changed before — Saudi VAT went from 5% to 15%
 * in 2020. A rate compiled into components means a rate change is a code change, in
 * every component that happened to mention it.
 *
 * Cached per request: a booking form prices itself several times per render.
 */
export const getVatRate = cache(async (propertyId: string): Promise<Money.Money> => {
  try {
    const setting = await prisma.systemSetting.findFirst({
      where: { key: VAT_RATE_KEY, OR: [{ propertyId }, { propertyId: null }] },
      // A property-specific row wins over the global one.
      orderBy: { propertyId: "desc" },
      select: { value: true },
    });

    const raw = setting?.value?.trim();
    if (raw) {
      const rate = Money.money(raw);
      if (!rate.isNegative() && rate.lessThanOrEqualTo(100)) return rate;
      console.error(`[pricing] ignoring an out-of-range VAT rate: ${raw}`);
    }
  } catch (error) {
    // A settings failure must not stop the desk taking a booking; the documented
    // default is the honest fallback, and the failure is on the record.
    console.error("[pricing] could not read the VAT rate", error);
  }

  return Money.money(DEFAULT_VAT_RATE);
});

export type PricingInput = {
  nightlyRate: Money.MoneyInput;
  nights: number;
  /** A fixed amount off the accommodation, never a percentage. */
  discount?: Money.MoneyInput;
  /** VAT percentage, e.g. 15. */
  vatRate: Money.MoneyInput;
  /**
   * Σ of the reservation's charge rows. Each already carries its own line tax, so it
   * is added after accommodation VAT and never taxed again.
   */
  additionalCharges?: Money.MoneyInput;
};

export type PricingResult = {
  nightlyRate: Money.Money;
  nights: number;
  subtotal: Money.Money;
  discount: Money.Money;
  /** What VAT is charged on: accommodation after discount. */
  taxableBase: Money.Money;
  tax: Money.Money;
  additionalCharges: Money.Money;
  total: Money.Money;
};

/**
 * The canonical stay price.
 *
 *     subtotal      = nightlyRate × nights
 *     taxableBase   = subtotal − discount
 *     tax           = taxableBase × vatRate ÷ 100      (accommodation VAT only)
 *     total         = taxableBase + tax + additionalCharges
 *
 * The last term is why service charges are not taxed twice. A `ReservationCharge`
 * row stores its line tax inside its own total, so the folio's VAT is the sum of
 * accommodation VAT and each line's own — applying the accommodation rate over the
 * charges again would invent tax the guest does not owe.
 *
 * Rounding happens once, on the tax figure, to two decimal places (half-up, the
 * `Decimal` default). Rounding each night separately would drift against an invoice
 * that rounds the total.
 */
export function priceReservation(input: PricingInput): PricingResult {
  const nightlyRate = Money.money(input.nightlyRate);
  const nights = Math.max(1, Math.trunc(input.nights));
  const discount = Money.money(input.discount);
  const additionalCharges = Money.money(input.additionalCharges);

  const subtotal = Money.multiply(nightlyRate, nights);

  /*
   * Clamped rather than rejected here: the schema validates the discount against the
   * subtotal before this runs, and a negative taxable base would produce negative tax
   * — a refund invented by arithmetic. Defence in depth for a figure that must never
   * go below zero.
   */
  const taxableBase = Money.atLeastZero(Money.subtract(subtotal, discount));

  const tax = Money.money(
    Money.multiply(taxableBase, Money.money(input.vatRate).dividedBy(100)).toFixed(2),
  );

  return {
    nightlyRate,
    nights,
    subtotal,
    discount,
    taxableBase,
    tax,
    additionalCharges,
    total: Money.add(taxableBase, tax, additionalCharges),
  };
}
