// Turns invoice lines into quantities and prices per period for the item
// page's graphs.
// Everything works on calendar days ("2026-11-14") in Amsterdam, so a period
// never depends on the time zone of whoever opens the page.

export type QuantityPoint = {
  day: string;
  // Credit notes and returns are negative.
  quantity: number;
  // What the line came to, discount included; only needed for prices.
  amount?: number;
  documentNo: string;
};

export type Granularity = "week" | "month" | "quarter" | "year";

export type QuantityRange =
  | { kind: "rolling"; months: number }
  | { kind: "year"; year: number }
  | { kind: "all" };

export type QuantityBucket = {
  start: string;
  // Under the bar, short enough to fit.
  label: string;
  // In the tooltip.
  title: string;
  quantity: number;
  amount: number;
  // The cheapest and dearest unit price on a single line in the period.
  lowestPrice: number | null;
  highestPrice: number | null;
  documents: number;
};

// What a unit cost on average in the period, weighted by how many were bought.
export function averagePrice(bucket: QuantityBucket) {
  return bucket.quantity > 0 && bucket.amount > 0
    ? bucket.amount / bucket.quantity
    : null;
}

// A graph with fewer bars says nothing, one with more can't be read on a phone.
const MIN_BARS = 3;
const MAX_BARS = 120;

const TIME_ZONE = "Europe/Amsterdam";
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIME_ZONE,
});

export function toDay(date: Date) {
  return dayFormat.format(date);
}

// Day arithmetic happens on UTC midnights, where every day is 24 hours.
function parse(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function periodStart(date: Date, granularity: Granularity) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  switch (granularity) {
    case "week":
      // Weeks start on Monday.
      return addDays(date, -((date.getUTCDay() + 6) % 7));
    case "month":
      return new Date(Date.UTC(y, m, 1));
    case "quarter":
      return new Date(Date.UTC(y, m - (m % 3), 1));
    case "year":
      return new Date(Date.UTC(y, 0, 1));
  }
}

function nextPeriod(date: Date, granularity: Granularity) {
  switch (granularity) {
    case "week":
      return addDays(date, 7);
    case "month":
      return addMonths(date, 1);
    case "quarter":
      return addMonths(date, 3);
    case "year":
      return addMonths(date, 12);
  }
}

// ISO 8601: the week with the year's first Thursday is week 1.
function isoWeek(monday: Date) {
  const thursday = addDays(monday, 3);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - yearStart) / (7 * 86_400_000)) + 1;
}

// Spelled out because Intl writes September as "Sept", one letter too many
// to line up with the rest.
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const monthShort = { format: (date: Date) => MONTHS_SHORT[date.getUTCMonth()] };
const monthLong = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  timeZone: "UTC",
});

function labels(start: Date, granularity: Granularity) {
  const year = start.getUTCFullYear();
  const shortYear = `'${String(year).slice(2)}`;
  switch (granularity) {
    case "week": {
      const end = addDays(start, 6);
      const from = `${start.getUTCDate()} ${monthShort.format(start)}`;
      const to = `${end.getUTCDate()} ${monthShort.format(end)} ${end.getUTCFullYear()}`;
      return {
        label: from,
        title: `Week ${isoWeek(start)} · ${from} – ${to}`,
      };
    }
    case "month":
      return {
        label: `${monthShort.format(start)} ${shortYear}`,
        title: `${monthLong.format(start)} ${year}`,
      };
    case "quarter": {
      const quarter = Math.floor(start.getUTCMonth() / 3) + 1;
      return { label: `Q${quarter} ${shortYear}`, title: `Q${quarter} ${year}` };
    }
    case "year":
      return { label: String(year), title: String(year) };
  }
}

// The days a range covers, both ends included. Rolling ranges count whole
// months, this one included, so "12 months" is twelve bars of months.
export function rangeBounds(
  range: QuantityRange,
  today: string,
  firstDay: string | null,
) {
  const now = parse(today);
  switch (range.kind) {
    case "rolling":
      return {
        from: format(addMonths(periodStart(now, "month"), 1 - range.months)),
        to: today,
      };
    case "year": {
      const end = `${range.year}-12-31`;
      return { from: `${range.year}-01-01`, to: end < today ? end : today };
    }
    case "all":
      return { from: firstDay && firstDay < today ? firstDay : today, to: today };
  }
}

function periodStarts(from: string, to: string, granularity: Granularity) {
  const starts: Date[] = [];
  const end = parse(to);
  for (
    let start = periodStart(parse(from), granularity);
    start <= end;
    start = nextPeriod(start, granularity)
  ) {
    starts.push(start);
  }
  return starts;
}

export function barCount(
  range: QuantityRange,
  granularity: Granularity,
  today: string,
  firstDay: string | null,
) {
  const { from, to } = rangeBounds(range, today, firstDay);
  return periodStarts(from, to, granularity).length;
}

export function allowedGranularity(
  range: QuantityRange,
  granularity: Granularity,
  today: string,
  firstDay: string | null,
) {
  const count = barCount(range, granularity, today, firstDay);
  return count >= MIN_BARS && count <= MAX_BARS;
}

// The finest one that still fits comfortably, falling back to anything allowed.
export function defaultGranularity(
  range: QuantityRange,
  today: string,
  firstDay: string | null,
): Granularity {
  const order: Granularity[] = ["week", "month", "quarter", "year"];
  return (
    order.find(
      (granularity) =>
        barCount(range, granularity, today, firstDay) <= 40 &&
        allowedGranularity(range, granularity, today, firstDay),
    ) ??
    order.find((granularity) =>
      allowedGranularity(range, granularity, today, firstDay),
    ) ??
    // Too short for any, like a year to date in its first days.
    "week"
  );
}

// Every period in the range, empty ones included, so gaps show as gaps.
export function bucketQuantities(
  points: QuantityPoint[],
  range: QuantityRange,
  granularity: Granularity,
  today: string,
): QuantityBucket[] {
  const firstDay = points.reduce<string | null>(
    (first, point) => (first === null || point.day < first ? point.day : first),
    null,
  );
  const { from, to } = rangeBounds(range, today, firstDay);
  const starts = periodStarts(from, to, granularity);
  const buckets = starts.map((start) => ({
    start: format(start),
    ...labels(start, granularity),
    quantity: 0,
    amount: 0,
    lowestPrice: null as number | null,
    highestPrice: null as number | null,
    documents: new Set<string>(),
  }));

  // The first period can start before the range does: a week that began last
  // month. Its days count too, otherwise its bar would be cut short.
  const firstStart = buckets[0]?.start ?? from;
  for (const point of points) {
    if (point.day < firstStart || point.day > to) continue;
    // Periods are sorted, so the last one starting on or before the day.
    let index = buckets.length - 1;
    while (index > 0 && buckets[index].start > point.day) index--;
    const bucket = buckets[index];
    bucket.quantity += point.quantity;
    bucket.documents.add(point.documentNo);
    if (point.amount != null) {
      bucket.amount += point.amount;
      if (point.quantity > 0) {
        const price = point.amount / point.quantity;
        bucket.lowestPrice = Math.min(bucket.lowestPrice ?? price, price);
        bucket.highestPrice = Math.max(bucket.highestPrice ?? price, price);
      }
    }
  }

  return buckets.map(({ documents, ...bucket }) => ({
    ...bucket,
    // Floating point leaves crumbs like 2.9999999 after adding halves.
    quantity: Math.round(bucket.quantity * 1000) / 1000,
    amount: Math.round(bucket.amount * 100) / 100,
    documents: documents.size,
  }));
}

// Round gridlines: 0, 5, 10 rather than 0, 4.3, 8.6.
export function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || 1;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((s) => s >= rough) ??
    10 * magnitude;
  const ticks: number[] = [];
  for (
    let tick = Math.floor(min / step) * step;
    tick <= Math.ceil(max / step) * step + step / 2;
    tick += step
  ) {
    ticks.push(Math.round(tick * 1000) / 1000);
  }
  return ticks;
}
