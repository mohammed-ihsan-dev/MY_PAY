import Decimal from "decimal.js";

// All money is stored and passed around as INTEGER PAISE (₹1 = 100 paise).
// Intermediate rates (daily/hourly) are kept as full-precision Decimals and
// only rounded to whole paise at the final step, half-up.

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

/** Rupees (number or numeric string, max 2 decimals) → integer paise. */
export function rupeesToPaise(rupees: number | string): number {
  const d = new Decimal(rupees);
  if (!d.isFinite()) throw new Error("Invalid amount");
  return d.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Integer paise → rupees as a number (for inputs and charts only). */
export function paiseToRupees(paise: number): number {
  return new Decimal(paise).dividedBy(100).toNumber();
}

/** Rounds a Decimal amount of paise to an integer number of paise, half-up. */
export function roundPaise(paise: Decimal): number {
  return paise.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrCompactFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "₹17,000.00" from integer paise (or a Decimal of paise, rounded half-up). */
export function formatINR(paise: number | Decimal): string {
  const p = paise instanceof Decimal ? roundPaise(paise) : paise;
  return inrFormatter.format(new Decimal(p).dividedBy(100).toNumber());
}

export function formatINRCompact(paise: number): string {
  return inrCompactFormatter.format(paise / 100);
}

/** Plain "17000.00" for CSV/PDF, from integer paise. */
export function formatPlainAmount(paise: number): string {
  return new Decimal(paise).dividedBy(100).toFixed(2);
}
