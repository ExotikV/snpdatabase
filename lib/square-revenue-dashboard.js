import { createSquareClient } from "./square-bookings.js";
import {
  fetchSquareMonthlyRevenue,
  fetchSquarePeriodRevenue,
} from "./square-order-revenue.js";

export async function loadSquareRevenueForPeriod(bounds, now = new Date()) {
  try {
    const squareClient = createSquareClient();
    return await fetchSquarePeriodRevenue(squareClient, bounds, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[square-revenue-dashboard] Period revenue failed: ${message}`);
    return { totalCents: 0, orderCount: 0, unavailable: true };
  }
}

export async function loadSquareRevenueByMonth(year) {
  try {
    const squareClient = createSquareClient();
    return await fetchSquareMonthlyRevenue(squareClient, year);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[square-revenue-dashboard] Monthly revenue failed: ${message}`);
    const buckets = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      actualCents: 0,
      orderCount: 0,
    }));
    return { buckets, unavailable: true };
  }
}
