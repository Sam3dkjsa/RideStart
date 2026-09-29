import { describe, expect, it } from "vitest";
import {
  buildRideTrendSeries,
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

const sampleRideRows = [
  {
    rideDate: "2026-09-20",
    input: { ridesCompleted: 12, distanceKm: 100, grossEarnings: 1_000, platformFees: 100, otherCosts: 200 },
    assumptions: { vehicleEfficiencyKmPerLiter: 25, fuelPricePerLiter: 100, maintenanceReservePerKm: 1.25 },
  },
  {
    rideDate: "2026-09-21",
    input: { ridesCompleted: 8, distanceKm: 80, grossEarnings: 1_200, platformFees: 120, otherCosts: 80 },
    assumptions: { vehicleEfficiencyKmPerLiter: 20, fuelPricePerLiter: 100, maintenanceReservePerKm: 1.25 },
  },
  {
    rideDate: "2026-09-22",
    input: { ridesCompleted: 15, distanceKm: 150, grossEarnings: 900, platformFees: 90, otherCosts: 250 },
    assumptions: { vehicleEfficiencyKmPerLiter: 30, fuelPricePerLiter: 100, maintenanceReservePerKm: 1.25 },
  },
].map(({ rideDate, input, assumptions }) => ({
  rideDate,
  ridesCompleted: input.ridesCompleted,
  distanceKm: normalizeDecimal(input.distanceKm, 2),
  grossEarnings: normalizeDecimal(input.grossEarnings, 2),
  platformFees: normalizeDecimal(input.platformFees, 2),
  otherCosts: normalizeDecimal(input.otherCosts, 2),
  ...calculateRideCosts(input, assumptions),
}));

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

describe("RideLedger dashboard trend fixtures", () => {
  it("plots sample daily net profit and estimated km/L in chronological order", () => {
    expect(buildRideTrendSeries([...sampleRideRows].reverse())).toEqual([
      { date: "2026-09-20", netProfit: 175, efficiencyKmPerLiter: 25 },
      { date: "2026-09-21", netProfit: 500, efficiencyKmPerLiter: 20 },
      { date: "2026-09-22", netProfit: -127.5, efficiencyKmPerLiter: 30 },
    ]);
  });

  it("matches summary cards to the sample entries' calculated money and fuel totals", () => {
    expect(sampleRideRows.reduce((total, row) => total + row.ridesCompleted, 0)).toBe(35);
    expect(sumDecimalValues(sampleRideRows.map(row => row.distanceKm), 2)).toBe("330.00");
    expect(sumDecimalValues(sampleRideRows.map(row => row.grossEarnings), 2)).toBe("3100.00");
    expect(sumDecimalValues(sampleRideRows.map(row => row.platformFees), 2)).toBe("310.00");
    expect(sumDecimalValues(sampleRideRows.map(row => row.otherCosts), 2)).toBe("530.00");
    expect(sumDecimalValues(sampleRideRows.map(row => row.netProfit), 2)).toBe("547.50");
    expect(sumDecimalValues(sampleRideRows.map(row => row.fuelCost), 2)).toBe("1300.00");
    expect(sumDecimalValues(sampleRideRows.map(row => row.maintenanceReserve), 2)).toBe("412.50");
    expect(sumDecimalValues(sampleRideRows.map(row => row.fuelLiters), 3)).toBe("13.000");
  });

  it("omits a km/L point when a zero-distance day has no calculated fuel use", () => {
    expect(buildRideTrendSeries([{ rideDate: "2026-09-23", distanceKm: "0.00", fuelLiters: "0.000", netProfit: "25.00" }]))
      .toEqual([{ date: "2026-09-23", netProfit: 25, efficiencyKmPerLiter: null }]);
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
