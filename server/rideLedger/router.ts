import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { dateRangeSchema, entryInputSchema, normalizeDecimal, calculateRideCosts, settingsSchema } from "../../shared/rideLedger";
import { rideEntries, riderSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { getRideEntryByDate, getRideEntryById, getRiderSettings, listRideEntries, withoutOwner } from "./db";

function requireDatabase(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "RideLedger storage is temporarily unavailable." });
  return db;
}

function storageError(error: unknown): never {
  const candidate = error as { code?: string };
  if (candidate?.code === "ER_DUP_ENTRY") {
    throw new TRPCError({ code: "CONFLICT", message: "A daily entry already exists for this date." });
  }
  throw error;
}

function asNumber(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

function dailyValues(input: z.infer<typeof entryInputSchema>, assumptions: {
  vehicleEfficiencyKmPerLiter: string | number;
  fuelPricePerLiter: string | number;
  maintenanceReservePerKm: string | number;
}) {
  const calculations = calculateRideCosts(input, {
    vehicleEfficiencyKmPerLiter: asNumber(assumptions.vehicleEfficiencyKmPerLiter),
    fuelPricePerLiter: asNumber(assumptions.fuelPricePerLiter),
    maintenanceReservePerKm: asNumber(assumptions.maintenanceReservePerKm),
  });
  return {
    rideDate: input.rideDate,
    ridesCompleted: input.ridesCompleted,
    distanceKm: normalizeDecimal(input.distanceKm, 2),
    grossEarnings: normalizeDecimal(input.grossEarnings, 2),
    platformFees: normalizeDecimal(input.platformFees, 2),
    otherCosts: normalizeDecimal(input.otherCosts, 2),
    assumptionVehicleEfficiencyKmPerLiter: normalizeDecimal(assumptions.vehicleEfficiencyKmPerLiter, 3),
    assumptionFuelPricePerLiter: normalizeDecimal(assumptions.fuelPricePerLiter, 2),
    assumptionMaintenanceReservePerKm: normalizeDecimal(assumptions.maintenanceReservePerKm, 2),
    fuelLiters: calculations.fuelLiters,
    fuelCost: calculations.fuelCost,
    maintenanceReserve: calculations.maintenanceReserve,
    netProfit: calculations.netProfit,
  };
}

function requireConfiguredSettings(settings: Awaited<ReturnType<typeof getRiderSettings>>) {
  if (!settings) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Set up your vehicle and cost assumptions before adding a daily entry." });
  }
  return settings;
}

export const rideLedgerRouter = router({
  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const settings = await getRiderSettings(ctx.user.id);
      return settings ? withoutOwner(settings) : null;
    }),
    save: protectedProcedure.input(settingsSchema).mutation(async ({ ctx, input }) => {
      const db = requireDatabase(await getDb());
      await db
        .insert(riderSettings)
        .values({
          userId: ctx.user.id,
          currency: input.currency,
          vehicleEfficiencyKmPerLiter: normalizeDecimal(input.vehicleEfficiencyKmPerLiter, 3),
          fuelPricePerLiter: normalizeDecimal(input.fuelPricePerLiter, 2),
          maintenanceReservePerKm: normalizeDecimal(input.maintenanceReservePerKm, 2),
        })
        .onDuplicateKeyUpdate({
          set: {
            currency: input.currency,
            vehicleEfficiencyKmPerLiter: normalizeDecimal(input.vehicleEfficiencyKmPerLiter, 3),
            fuelPricePerLiter: normalizeDecimal(input.fuelPricePerLiter, 2),
            maintenanceReservePerKm: normalizeDecimal(input.maintenanceReservePerKm, 2),
            updatedAt: new Date(),
          },
        });
      const saved = await getRiderSettings(ctx.user.id);
      if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Settings could not be saved." });
      return withoutOwner(saved);
    }),
  }),
  ledger: router({
    list: protectedProcedure.input(dateRangeSchema).query(async ({ ctx, input }) => {
      const rows = await listRideEntries(ctx.user.id, input.startDate, input.endDate);
      return rows.map(withoutOwner);
    }),
    export: protectedProcedure.query(async ({ ctx }) => {
      const rows = await listRideEntries(ctx.user.id);
      return rows.map(withoutOwner);
    }),
    create: protectedProcedure.input(entryInputSchema).mutation(async ({ ctx, input }) => {
      const db = requireDatabase(await getDb());
      const existing = await getRideEntryByDate(ctx.user.id, input.rideDate);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "An entry already exists for this date. Edit that day from the ledger." });
      const settings = requireConfiguredSettings(await getRiderSettings(ctx.user.id));
      try {
        await db.insert(rideEntries).values({
          userId: ctx.user.id,
          ...dailyValues(input, settings),
        });
      } catch (error) {
        storageError(error);
      }
      const saved = await getRideEntryByDate(ctx.user.id, input.rideDate);
      if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The daily entry could not be loaded after saving." });
      return withoutOwner(saved);
    }),
    update: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), ...entryInputSchema.shape }))
      .mutation(async ({ ctx, input }) => {
        const db = requireDatabase(await getDb());
        const existing = await getRideEntryById(ctx.user.id, input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "That daily entry was not found." });
        const dateMatch = await getRideEntryByDate(ctx.user.id, input.rideDate);
        if (dateMatch && dateMatch.id !== input.id) {
          throw new TRPCError({ code: "CONFLICT", message: "Another entry already uses this date." });
        }
        const snapshot = {
          vehicleEfficiencyKmPerLiter: existing.assumptionVehicleEfficiencyKmPerLiter,
          fuelPricePerLiter: existing.assumptionFuelPricePerLiter,
          maintenanceReservePerKm: existing.assumptionMaintenanceReservePerKm,
        };
        try {
          await db
            .update(rideEntries)
            .set({ ...dailyValues(input, snapshot), updatedAt: new Date() })
            .where(and(eq(rideEntries.id, input.id), eq(rideEntries.userId, ctx.user.id)));
        } catch (error) {
          storageError(error);
        }
        const saved = await getRideEntryById(ctx.user.id, input.id);
        if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The updated entry could not be loaded." });
        return withoutOwner(saved);
      }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = requireDatabase(await getDb());
      const existing = await getRideEntryById(ctx.user.id, input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "That daily entry was not found." });
      await db.delete(rideEntries).where(and(eq(rideEntries.id, input.id), eq(rideEntries.userId, ctx.user.id)));
      return { success: true } as const;
    }),
  }),
});
