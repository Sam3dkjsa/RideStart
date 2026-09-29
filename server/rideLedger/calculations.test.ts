import { describe, expect, it } from "vitest";
import {
  calculateRideCosts,
  dateRangeSchema,
  decimalToScaledInt,
  entryInputSchema,
  normalizeDecimal,
  settingsSchema,
  sumDecimalValues,
} from "../../shared/rideLedger";

const assumptions = {
  vehicleEfficiencyKmPerLiter: 25,
  fuelPricePerLiter: 100,
  maintenanceReservePerKm: 1.25,
};

const entry = {
  rideDate: "2026-09-28",
  ridesCompleted: 12,
  distanceKm: 100,
  grossEarnings: 1_000,
  platformFees: 100,
  otherCosts: 200,
};

describe("RideLedger calculations", () => {
  it("uses distance / efficiency, fuel price, maintenance reserve, and the exact net-profit formula", () => {
    expect(calculateRideCosts(entry, assumptions)).toEqual({
      fuelLiters: "4.000",
      fuelCost: "400.00",
      maintenanceReserve: "125.00",
      netProfit: "175.00",
    });
  });

  it("returns zero fuel and maintenance cost for a zero-distance day", () => {
    expect(calculateRideCosts({ ...entry, distanceKm: 0 }, assumptions)).toEqual({
      fuelLiters: "0.000",
      fuelCost: "0.00",
      maintenanceReserve: "0.00",
      netProfit: "700.00",
    });
  });

  it("preserves negative real net profit instead of clamping it to zero", () => {
    expect(calculateRideCosts({ ...entry, grossEarnings: 100 }, assumptions).netProfit).toBe("-725.00");
  });

  it("rounds derived money half up to currency cents and liters to three decimals", () => {
    const result = calculateRideCosts(
      { ...entry, distanceKm: 1, grossEarnings: 100, platformFees: 0, otherCosts: 0 },
      { vehicleEfficiencyKmPerLiter: 3, fuelPricePerLiter: 100, maintenanceReservePerKm: 1.235 },
    );
    expect(result.fuelLiters).toBe("0.333");
    expect(result.fuelCost).toBe("33.30");
    expect(result.maintenanceReserve).toBe("1.24");
    expect(result.netProfit).toBe("65.46");
  });

  it("normalizes decimals and adds amounts without binary floating-point drift", () => {
    expect(normalizeDecimal(1.005, 2)).toBe("1.01");
    expect(sumDecimalValues(["0.10", "0.20", "1.05"], 2)).toBe("1.35");
    expect(decimalToScaledInt("0.001", 3)).toBe(1n);
  });
});

describe("RideLedger validation", () => {
  it("accepts valid rider settings and daily inputs", () => {
    expect(settingsSchema.safeParse({
      currency: "INR",
      vehicleEfficiencyKmPerLiter: 45,
      fuelPricePerLiter: 105.5,
      maintenanceReservePerKm: 1.25,
    }).success).toBe(true);
    expect(entryInputSchema.safeParse(entry).success).toBe(true);
  });

  it("rejects negative cost inputs, zero efficiency, unreasonable amounts, and fractional ride counts", () => {
    expect(settingsSchema.safeParse({ ...assumptions, currency: "INR", vehicleEfficiencyKmPerLiter: 0 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...assumptions, currency: "INR", fuelPricePerLiter: -1 }).success).toBe(false);
    expect(entryInputSchema.safeParse({ ...entry, grossEarnings: -0.01 }).success).toBe(false);
    expect(entryInputSchema.safeParse({ ...entry, ridesCompleted: 1.5 }).success).toBe(false);
    expect(entryInputSchema.safeParse({ ...entry, distanceKm: 2_001 }).success).toBe(false);
  });

  it("rejects impossible calendar dates and reversed date ranges", () => {
    expect(entryInputSchema.safeParse({ ...entry, rideDate: "2026-02-30" }).success).toBe(false);
    expect(dateRangeSchema.safeParse({ startDate: "2026-09-29", endDate: "2026-09-01" }).success).toBe(false);
  });
});
