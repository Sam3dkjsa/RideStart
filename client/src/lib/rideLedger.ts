import type { RideEntry } from "../../../drizzle/schema";

export type LedgerRecord = Omit<RideEntry, "userId">;

export const CURRENCY_OPTIONS = [
  { code: "INR", label: "INR · Indian rupee" },
  { code: "USD", label: "USD · US dollar" },
  { code: "EUR", label: "EUR · Euro" },
  { code: "GBP", label: "GBP · Pound sterling" },
  { code: "CAD", label: "CAD · Canadian dollar" },
  { code: "AUD", label: "AUD · Australian dollar" },
  { code: "NZD", label: "NZD · New Zealand dollar" },
  { code: "SGD", label: "SGD · Singapore dollar" },
  { code: "AED", label: "AED · UAE dirham" },
  { code: "ZAR", label: "ZAR · South African rand" },
] as const;

export function formatCurrency(amount: string | number, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatQuantity(value: string | number, maximumFractionDigits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(number);
}

export function formatCalendarDate(isoDate: string, options?: Intl.DateTimeFormatOptions) {
  const value = new Date(`${isoDate}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", ...options, timeZone: "UTC" }).format(value);
}

function csvCell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadLedgerCsv(entries: LedgerRecord[]) {
  const columns: Array<[keyof LedgerRecord, string]> = [
    ["rideDate", "date"],
    ["ridesCompleted", "rides_completed"],
    ["distanceKm", "distance_km"],
    ["grossEarnings", "gross_earnings"],
    ["platformFees", "platform_fees"],
    ["otherCosts", "other_costs"],
    ["assumptionVehicleEfficiencyKmPerLiter", "snapshot_vehicle_efficiency_km_per_liter"],
    ["assumptionFuelPricePerLiter", "snapshot_fuel_price_per_liter"],
    ["assumptionMaintenanceReservePerKm", "snapshot_maintenance_reserve_per_km"],
    ["fuelLiters", "fuel_liters"],
    ["fuelCost", "fuel_cost"],
    ["maintenanceReserve", "maintenance_reserve_estimate"],
    ["netProfit", "net_profit"],
    ["createdAt", "created_at_utc"],
    ["updatedAt", "updated_at_utc"],
  ];
  const rows = [
    columns.map(([, heading]) => csvCell(heading)).join(","),
    ...entries.map(entry => columns.map(([key]) => csvCell(entry[key])).join(",")),
  ];
  const blob = new Blob([`\uFEFF${rows.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `rideledger-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(href);
}
