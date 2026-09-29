import { z } from "zod";

const finiteNonnegative = (max: number) => z.number().finite().min(0).max(max);

function validCurrency(value: string) {
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency: value }).resolvedOptions();
    return digits.minimumFractionDigits === 2 && digits.maximumFractionDigits === 2;
  } catch {
    return false;
  }
}

export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date in YYYY-MM-DD format.")
  .refine(value => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a real calendar date.");

export const settingsSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/).refine(validCurrency, "Choose a supported two-decimal currency."),
  vehicleEfficiencyKmPerLiter: z.number().finite().min(0.1).max(150),
  fuelPricePerLiter: finiteNonnegative(1_000_000),
  maintenanceReservePerKm: finiteNonnegative(100_000),
});

export const entryInputSchema = z.object({
  rideDate: calendarDateSchema,
  ridesCompleted: z.number().finite().int().min(0).max(500),
  distanceKm: finiteNonnegative(2_000),
  grossEarnings: finiteNonnegative(100_000_000),
  platformFees: finiteNonnegative(100_000_000),
  otherCosts: finiteNonnegative(100_000_000),
});

export const dateRangeSchema = z
  .object({ startDate: calendarDateSchema, endDate: calendarDateSchema })
  .refine(value => value.startDate <= value.endDate, {
    path: ["endDate"],
    message: "End date must be on or after the start date.",
  });

export type RideSettingsInput = z.infer<typeof settingsSchema>;
export type RideEntryInput = z.infer<typeof entryInputSchema>;
export type RideAssumptions = Pick<
  RideSettingsInput,
  "vehicleEfficiencyKmPerLiter" | "fuelPricePerLiter" | "maintenanceReservePerKm"
>;

function decimalParts(value: number | string) {
  const source = String(value).trim().toLowerCase();
  const match = source.match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/);
  if (!match) throw new Error("Invalid decimal value.");
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2];
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  return { sign, digits: `${whole}${fraction}` || "0", decimalPlaces: fraction.length - exponent };
}

/** Convert a finite decimal to an integer at the requested scale, rounding half up. */
export function decimalToScaledInt(value: number | string, scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0 || scale > 12) throw new Error("Invalid decimal scale.");
  const { sign, digits, decimalPlaces } = decimalParts(value);
  const shift = scale - decimalPlaces;
  if (shift >= 0) return sign * BigInt(`${digits}${"0".repeat(shift)}`);
  const cut = digits.length + shift;
  const kept = cut > 0 ? digits.slice(0, cut) : "0";
  const discarded = cut > 0 ? digits.slice(cut) : `${"0".repeat(-cut)}${digits}`;
  let rounded = BigInt(kept || "0");
  if ((discarded[0] ?? "0") >= "5") rounded += 1n;
  return sign * rounded;
}

export function scaledIntToDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? "" : `.${digits.slice(-scale)}`;
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

export function normalizeDecimal(value: number | string, scale: number): string {
  return scaledIntToDecimal(decimalToScaledInt(value, scale), scale);
}

function roundDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Vehicle efficiency must be greater than zero.");
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

export type RideCostCalculation = {
  fuelLiters: string;
  fuelCost: string;
  maintenanceReserve: string;
  netProfit: string;
};

/**
 * Uses exact scaled-integer arithmetic: distance is stored to 0.01 km, efficiency
 * to 0.001 km/L, fuel volume to 0.001 L, and currency to 0.01 units.
 */
export function calculateRideCosts(
  entry: Pick<RideEntryInput, "distanceKm" | "grossEarnings" | "platformFees" | "otherCosts">,
  assumptions: RideAssumptions,
): RideCostCalculation {
  const distanceHundredths = decimalToScaledInt(entry.distanceKm, 2);
  const efficiencyThousandths = decimalToScaledInt(assumptions.vehicleEfficiencyKmPerLiter, 3);
  if (efficiencyThousandths <= 0n) throw new Error("Vehicle efficiency must be greater than zero.");
  const priceCents = decimalToScaledInt(assumptions.fuelPricePerLiter, 2);
  const maintenanceRateCents = decimalToScaledInt(assumptions.maintenanceReservePerKm, 2);
  const fuelLitersMilli = roundDivide(distanceHundredths * 10_000n, efficiencyThousandths);
  const fuelCostCents = roundDivide(fuelLitersMilli * priceCents, 1_000n);
  const maintenanceCents = roundDivide(distanceHundredths * maintenanceRateCents, 100n);
  const grossCents = decimalToScaledInt(entry.grossEarnings, 2);
  const feeCents = decimalToScaledInt(entry.platformFees, 2);
  const otherCostCents = decimalToScaledInt(entry.otherCosts, 2);
  const netCents = grossCents - feeCents - fuelCostCents - maintenanceCents - otherCostCents;
  return {
    fuelLiters: scaledIntToDecimal(fuelLitersMilli, 3),
    fuelCost: scaledIntToDecimal(fuelCostCents, 2),
    maintenanceReserve: scaledIntToDecimal(maintenanceCents, 2),
    netProfit: scaledIntToDecimal(netCents, 2),
  };
}

export type RideTrendEntry = {
  rideDate: string;
  distanceKm: number | string;
  fuelLiters: number | string;
  netProfit: number | string;
};

export type RideTrendPoint = {
  date: string;
  netProfit: number;
  efficiencyKmPerLiter: number | null;
};

/** Build chronological chart points from saved entries; efficiency is an estimate from distance / calculated fuel liters. */
export function buildRideTrendSeries(entries: readonly RideTrendEntry[]): RideTrendPoint[] {
  return [...entries]
    .sort((left, right) => left.rideDate.localeCompare(right.rideDate))
    .map(entry => {
      const distance = Number(entry.distanceKm);
      const liters = Number(entry.fuelLiters);
      return {
        date: entry.rideDate,
        netProfit: Number(entry.netProfit),
        efficiencyKmPerLiter: Number.isFinite(distance) && Number.isFinite(liters) && liters > 0
          ? Number((distance / liters).toFixed(2))
          : null,
      };
    });
}

export function sumDecimalValues(values: Array<number | string>, scale: number): string {
  const total = values.reduce((sum, value) => sum + decimalToScaledInt(value, scale), 0n);
  return scaledIntToDecimal(total, scale);
}
