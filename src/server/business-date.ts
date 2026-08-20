import "server-only";

import { cache } from "react";

import { businessDate, businessToday } from "@/lib/datetime";
import { prisma } from "@/lib/db";

/**
 * The property's operating date.
 *
 * Everything the dashboard calls "today" comes from here, never from `new Date()`
 * scattered through queries. Two reasons: a hotel's operating day is a property
 * concept rather than a browser one, and the seeded demo is staged around a fixed
 * date — a dashboard reading the wall clock would show an empty hotel the moment the
 * real date drifted past the scenario.
 *
 * In production no override row exists and this is simply today in the property's
 * timezone. The demo seed writes the override, so the same code serves both.
 */

const DEMO_DATE_KEY = "demo.businessDate";

export type BusinessDateContext = {
  /** The date the dashboard treats as today. */
  date: Date;
  /** True when a fixed demo date is overriding the real one. */
  isDemo: boolean;
};

/**
 * Cached per request: a dashboard render asks for the operating date from a dozen
 * places, and they must all agree even if the query spans midnight.
 */
export const getBusinessDateContext = cache(
  async (): Promise<BusinessDateContext> => {
    try {
      const override = await prisma.systemSetting.findFirst({
        where: { key: DEMO_DATE_KEY },
        select: { value: true },
      });

      if (override?.value) {
        return { date: businessDate(override.value), isDemo: true };
      }
    } catch (error) {
      // A settings lookup failure must not take the dashboard down; the real date
      // is the correct fallback in production, which is where this can happen.
      console.error("[business-date] could not read the demo override", error);
    }

    return { date: businessToday(), isDemo: false };
  },
);

export async function getBusinessDate(): Promise<Date> {
  return (await getBusinessDateContext()).date;
}

export { DEMO_DATE_KEY };
