import { normalizeLanguage } from "./languages.js";
import { hasRevenueColumns } from "./revenue.js";
import { isWebsiteBookingSource, MANUAL_SQUARE_BOOKING_SOURCE } from "./tracks.js";
import { getCatalogPriceCents } from "./square-bookings.js";

function resolveBookedRevenueCents({ orderRevenueCents, catalogPriceCents }) {
  if (orderRevenueCents != null) return orderRevenueCents;
  return catalogPriceCents;
}

async function hasRevenueUpdatedColumn(supabase) {
  const { error } = await supabase.from("booking_attempts").select("revenue_updated_at").limit(1);
  return !error;
}

/**
 * Create or preserve booking_attempts for Square phone/manual appointments.
 * Website-tracked sources (direct, SMS, QR) are never overwritten.
 */
export async function syncSquareBookingAttempt(
  supabase,
  booking,
  { client, catalogById, revenueByBookingId, now = new Date() } = {},
) {
  if (!booking?.id) return { action: "skipped" };
  if (!(await hasRevenueColumns(supabase))) return { action: "skipped" };

  const catalogPriceCents = getCatalogPriceCents(booking, catalogById);
  const orderRevenueCents = revenueByBookingId?.get(booking.id)?.cents ?? null;
  const resolvedRevenueCents = resolveBookedRevenueCents({
    orderRevenueCents,
    catalogPriceCents,
  });

  const { data: existing, error: loadError } = await supabase
    .from("booking_attempts")
    .select("id, source, revenue_status, phone, booked_revenue_cents")
    .eq("square_booking_id", booking.id)
    .maybeSingle();

  if (loadError) throw loadError;

  if (existing) {
    const patch = {};
    if (!existing.phone && client?.phone) patch.phone = client.phone;
    if (booking.startAt) {
      patch.raw_note = `Square appointment ${booking.startAt}`;
    }

    const isManualSquare =
      existing.source === MANUAL_SQUARE_BOOKING_SOURCE || !isWebsiteBookingSource(existing.source);
    if (isManualSquare && resolvedRevenueCents != null) {
      const shouldPreferOrder =
        orderRevenueCents != null && orderRevenueCents !== existing.booked_revenue_cents;
      const missingBookedRevenue = !Number.isFinite(existing.booked_revenue_cents);
      if (shouldPreferOrder || missingBookedRevenue) {
        patch.booked_revenue_cents = resolvedRevenueCents;
      }
    }

    if (Object.keys(patch).length > 0) {
      await supabase.from("booking_attempts").update(patch).eq("id", existing.id);
      return { action: "updated", id: existing.id };
    }

    return { action: "existing", id: existing.id };
  }

  const insert = {
    source: MANUAL_SQUARE_BOOKING_SOURCE,
    square_booking_id: booking.id,
    square_customer_id: booking.customerId ?? null,
    phone: client?.phone ?? null,
    raw_note: booking.startAt ? `Square appointment ${booking.startAt}` : "Square appointment",
    processed: false,
    revenue_status: "booked",
    booked_revenue_cents: resolvedRevenueCents,
    booked_at: booking.createdAt ?? now.toISOString(),
  };

  if (client?.preferred_language) {
    insert.preferred_language = normalizeLanguage(client.preferred_language);
  }

  const { data, error } = await supabase
    .from("booking_attempts")
    .insert(insert)
    .select("id")
    .single();

  if (error) throw error;
  return { action: "created", id: data.id };
}

export async function markBookingAttemptCancelled(supabase, squareBookingId, now = new Date()) {
  if (!(await hasRevenueColumns(supabase))) return false;

  const patch = {
    revenue_status: "cancelled",
    actual_revenue_cents: null,
    revenue_realized_at: null,
  };

  if (await hasRevenueUpdatedColumn(supabase)) {
    patch.revenue_updated_at = now.toISOString();
  }

  const { error, count } = await supabase
    .from("booking_attempts")
    .update(patch, { count: "exact" })
    .eq("square_booking_id", squareBookingId)
    .neq("revenue_status", "cancelled");

  if (error) throw error;
  return (count ?? 0) > 0;
}
