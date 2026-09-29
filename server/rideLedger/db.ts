import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import { rideEntries, riderSettings } from "../../drizzle/schema";

function requireDatabase(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new Error("The RideLedger database is not available.");
  return db;
}

export async function getRiderSettings(userId: number) {
  const db = requireDatabase(await getDb());
  const rows = await db.select().from(riderSettings).where(eq(riderSettings.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function listRideEntries(userId: number, startDate?: string, endDate?: string) {
  const db = requireDatabase(await getDb());
  const conditions = [eq(rideEntries.userId, userId)];
  if (startDate) conditions.push(gte(rideEntries.rideDate, startDate));
  if (endDate) conditions.push(lte(rideEntries.rideDate, endDate));
  return db
    .select()
    .from(rideEntries)
    .where(and(...conditions))
    .orderBy(desc(rideEntries.rideDate), desc(rideEntries.id));
}

export async function getRideEntryById(userId: number, id: number) {
  const db = requireDatabase(await getDb());
  const rows = await db
    .select()
    .from(rideEntries)
    .where(and(eq(rideEntries.userId, userId), eq(rideEntries.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getRideEntryByDate(userId: number, rideDate: string) {
  const db = requireDatabase(await getDb());
  const rows = await db
    .select()
    .from(rideEntries)
    .where(and(eq(rideEntries.userId, userId), eq(rideEntries.rideDate, rideDate)))
    .limit(1);
  return rows[0] ?? null;
}

export function withoutOwner<T extends { userId: number }>(row: T) {
  const { userId: _privateOwnerId, ...visible } = row;
  return visible;
}
