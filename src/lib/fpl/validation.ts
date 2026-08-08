import { z } from "zod";

export const positiveIntSchema = z.coerce
  .number()
  .int()
  .positive("Must be a positive integer");

export const managerIdSchema = positiveIntSchema;
export const playerIdSchema = positiveIntSchema;
export const leagueIdSchema = positiveIntSchema;
export const gameweekIdSchema = positiveIntSchema;

const finiteNumber = z.number().finite();

/**
 * The canonical persisted representation of a player in a squad draft.
 * Tool responses may use a compact display shape, but API writes must provide
 * this complete snapshot so it can be validated against FPL squad rules.
 */
export const squadDraftPickSchema = z
  .object({
    elementId: positiveIntSchema,
    webName: z.string().trim().min(1).max(120),
    teamId: positiveIntSchema,
    teamShort: z.string().trim().min(1).max(16),
    position: z.enum(["GKP", "DEF", "MID", "FWD"]),
    elementType: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    cost: finiteNumber.nonnegative(),
    pickPosition: z.number().int().min(1).max(15),
    isCaptain: z.boolean(),
    isViceCaptain: z.boolean(),
    form: finiteNumber,
    pointsPerGame: finiteNumber,
    totalPoints: finiteNumber,
    fixtureRunScore: finiteNumber,
    recommendationScore: finiteNumber,
    status: z.string().trim().min(1).max(32),
  })
  .strict()
  .superRefine((pick, ctx) => {
    const positionForType = {
      1: "GKP",
      2: "DEF",
      3: "MID",
      4: "FWD",
    } as const;
    if (pick.position !== positionForType[pick.elementType]) {
      ctx.addIssue({
        code: "custom",
        path: ["position"],
        message: "position must match elementType.",
      });
    }
  });

export const squadDraftPicksSchema = z
  .array(squadDraftPickSchema)
  .length(15, "Squad must have exactly 15 players.");

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
