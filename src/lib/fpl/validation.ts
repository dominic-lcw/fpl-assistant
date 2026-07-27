import { z } from "zod";

export const positiveIntSchema = z.coerce
  .number()
  .int()
  .positive("Must be a positive integer");

export const managerIdSchema = positiveIntSchema;
export const playerIdSchema = positiveIntSchema;
export const leagueIdSchema = positiveIntSchema;
export const gameweekIdSchema = positiveIntSchema;

export function parsePositiveInt(
  value: unknown,
  label = "ID",
): number {
  const result = positiveIntSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid ${label}: expected a positive integer`);
  }
  return result.data;
}

export function isValidManagerIdInput(value: string): boolean {
  if (!/^\d+$/.test(value.trim())) return false;
  const n = Number(value.trim());
  return Number.isInteger(n) && n > 0;
}
