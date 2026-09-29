import {
  date,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing the standard Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const riderSettings = mysqlTable(
  "rider_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    vehicleEfficiencyKmPerLiter: decimal("vehicleEfficiencyKmPerLiter", { precision: 8, scale: 3 }).notNull(),
    fuelPricePerLiter: decimal("fuelPricePerLiter", { precision: 14, scale: 2 }).notNull(),
    maintenanceReservePerKm: decimal("maintenanceReservePerKm", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ userUnique: uniqueIndex("rider_settings_user_uq").on(table.userId) }),
);

export const rideEntries = mysqlTable(
  "ride_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    rideDate: date("rideDate", { mode: "string" }).notNull(),
    ridesCompleted: int("ridesCompleted").notNull(),
    distanceKm: decimal("distanceKm", { precision: 10, scale: 2 }).notNull(),
    grossEarnings: decimal("grossEarnings", { precision: 14, scale: 2 }).notNull(),
    platformFees: decimal("platformFees", { precision: 14, scale: 2 }).notNull(),
    otherCosts: decimal("otherCosts", { precision: 14, scale: 2 }).notNull(),
    assumptionVehicleEfficiencyKmPerLiter: decimal("assumptionVehicleEfficiencyKmPerLiter", { precision: 8, scale: 3 }).notNull(),
    assumptionFuelPricePerLiter: decimal("assumptionFuelPricePerLiter", { precision: 14, scale: 2 }).notNull(),
    assumptionMaintenanceReservePerKm: decimal("assumptionMaintenanceReservePerKm", { precision: 14, scale: 2 }).notNull(),
    fuelLiters: decimal("fuelLiters", { precision: 12, scale: 3 }).notNull(),
    fuelCost: decimal("fuelCost", { precision: 14, scale: 2 }).notNull(),
    maintenanceReserve: decimal("maintenanceReserve", { precision: 14, scale: 2 }).notNull(),
    netProfit: decimal("netProfit", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userDateUnique: uniqueIndex("ride_entries_user_date_uq").on(table.userId, table.rideDate),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type RiderSettings = typeof riderSettings.$inferSelect;
export type RideEntry = typeof rideEntries.$inferSelect;
