import type { SpecialsFilter } from "@/components/special-badge";
import { getPricingOverview, getSalePricesAt } from "@/lib/pricing/queries";
import { renderPriceList } from "@/lib/pricing/price-list-pdf";

export const dynamic = "force-dynamic";

const TIME_ZONE = "Europe/Amsterdam";

// Midnight in Amsterdam at the start of a YYYY-MM-DD day, whatever zone the
// server runs in.
function startOfDay(day: string | null) {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(utcMidnight.getTime())) return null;
  const offset = new Intl.DateTimeFormat("en", {
    timeZone: TIME_ZONE,
    timeZoneName: "longOffset",
  })
    .formatToParts(utcMidnight)
    .find((part) => part.type === "timeZoneName")!
    .value.match(/([+-])(\d{2}):(\d{2})/);
  const minutes = offset
    ? (offset[1] === "-" ? -1 : 1) *
      (Number(offset[2]) * 60 + Number(offset[3]))
    : 0;
  return new Date(utcMidnight.getTime() - minutes * 60_000);
}

// The price list as a PDF; `?details=1` adds the price category, margin and
// profit, `?specials=only|none` follows the screen's specials filter, and
// `?since=YYYY-MM-DD` sets each price next to the one it had that morning.
// Shown in the browser, and saved under a name that says what it is.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const details = params.get("details") === "1";
  const specials: SpecialsFilter =
    params.get("specials") === "only"
      ? "only"
      : params.get("specials") === "none"
        ? "none"
        : "any";
  const since = startOfDay(params.get("since"));
  const [overview, pricesThen] = await Promise.all([
    getPricingOverview(),
    since ? getSalePricesAt(since) : null,
  ]);
  const pdf = await renderPriceList(overview, {
    details,
    specials,
    comparison:
      since && pricesThen ? { date: since, prices: pricesThen } : null,
  });

  const day = new Date().toLocaleDateString("sv-SE", { timeZone: TIME_ZONE });
  const filename = [
    specials === "only" ? "specials" : null,
    details ? "prices-and-margins" : "prices",
    since ? `since-${params.get("since")}` : null,
    day,
  ]
    .filter(Boolean)
    .join("-");

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
