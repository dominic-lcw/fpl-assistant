import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  role: text("role", { enum: ["admin", "member"] })
    .notNull()
    .default("member"),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "revoked"],
  })
    .notNull()
    .default("pending"),
  approvedAt: timestamp("approved_at", { mode: "date" }),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
    index("accounts_user_id_idx").on(account.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (session) => [index("sessions_user_id_idx").on(session.userId)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (token) => [primaryKey({ columns: [token.identifier, token.token] })],
);

export const threads = pgTable(
  "threads",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    status: text("status", { enum: ["regular", "archived"] })
      .notNull()
      .default("regular"),
    custom: jsonb("custom").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (thread) => [index("threads_user_id_idx").on(thread.userId)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    format: text("format").notNull(),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (message) => [index("messages_thread_id_idx").on(message.threadId)],
);

/** Snapshot of one pick inside a persisted 15-player draft. */
export type SquadDraftPick = {
  elementId: number;
  webName: string;
  teamId: number;
  teamShort: string;
  position: "GKP" | "DEF" | "MID" | "FWD";
  elementType: 1 | 2 | 3 | 4;
  /** Price in £m (e.g. 7.5). */
  cost: number;
  pickPosition: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  form: number;
  pointsPerGame: number;
  totalPoints: number;
  fixtureRunScore: number;
  recommendationScore: number;
  status: string;
};

export const squadDrafts = pgTable(
  "squad_drafts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Fresh £100m draft, or rebuild using manager squad value + bank. */
    mode: text("mode", { enum: ["draft_100", "wildcard"] }).notNull(),
    status: text("status", { enum: ["draft", "active", "archived"] })
      .notNull()
      .default("draft"),
    /** Budget ceiling in 0.1m units (1000 = £100.0m). */
    budgetTenths: integer("budget_tenths").notNull(),
    /** Remaining ITB in 0.1m units, e.g. 15 = £1.5m. */
    bankTenths: integer("bank_tenths").notNull().default(0),
    /** Total squad cost in 0.1m units. */
    costTenths: integer("cost_tenths").notNull().default(0),
    managerId: integer("manager_id"),
    gameweek: integer("gameweek"),
    picks: jsonb("picks").$type<SquadDraftPick[]>().notNull().default([]),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (draft) => [
    index("squad_drafts_user_id_idx").on(draft.userId),
    index("squad_drafts_user_status_idx").on(draft.userId, draft.status),
  ],
);

/**
 * Lightweight per-user tag/bag for grouping player beliefs.
 * Beliefs are the primary content; thesis title is just a label.
 * Never shared across users.
 */
export type FormThesisStatus =
  | "collecting"
  | "synthesized"
  | "applied"
  | "archived";

export type FormThesisPreferences = {
  risk?: "safe" | "balanced" | "differential";
  budgetFlex?: string;
  notes?: string;
};

export const formTheses = pgTable(
  "form_theses",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Display tag for the belief bag (not a first-class planning artifact). */
    title: text("title").notNull(),
    status: text("status", {
      enum: ["collecting", "synthesized", "applied", "archived"],
    })
      .notNull()
      .default("collecting"),
    /** Optional notes on the belief set; not required before squad build. */
    summary: text("summary"),
    preferences: jsonb("preferences").$type<FormThesisPreferences>(),
    gameweek: integer("gameweek"),
    horizonGw: integer("horizon_gw").notNull().default(3),
    linkedDraftId: text("linked_draft_id").references(() => squadDrafts.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (thesis) => [
    index("form_theses_user_id_idx").on(thesis.userId),
    index("form_theses_user_status_idx").on(thesis.userId, thesis.status),
  ],
);

/**
 * Per-user agent prior on a player's near-term form (primary planning unit).
 * Grouped under a thesis tag via thesisId. Never shared across users.
 */
export type PlayerBeliefSources = string[];

export const playerBeliefs = pgTable(
  "player_beliefs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    thesisId: text("thesis_id")
      .notNull()
      .references(() => formTheses.id, { onDelete: "cascade" }),
    /** FPL element / player id. */
    elementId: integer("element_id").notNull(),
    /**
     * Delta vs official FPL form, roughly −2…+2.
     * Positive = agent expects better form than the API number.
     */
    formBelief: real("form_belief").notNull().default(0),
    /** 0–1 chance of reduced minutes / rotation risk. */
    minutesRisk: real("minutes_risk").notNull().default(0),
    /** Optional upside / downside hints for captaincy narrative (points). */
    ceiling: real("ceiling"),
    floor: real("floor"),
    /**
     * Quantified expected points over horizonGw from FPL baseline + belief priors.
     * Computed on upsert via computeBeliefExpectation; not LLM-invented.
     */
    expectedPoints: real("expected_points"),
    /** 0–1 how strongly scoring should trust this prior. */
    confidence: real("confidence").notNull().default(0.5),
    /** How many gameweeks this prior is meant to cover. */
    horizonGw: integer("horizon_gw").notNull().default(3),
    rationale: text("rationale").notNull(),
    sources: jsonb("sources")
      .$type<PlayerBeliefSources>()
      .notNull()
      .default([]),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (belief) => [
    uniqueIndex("player_beliefs_thesis_element_uidx").on(
      belief.thesisId,
      belief.elementId,
    ),
    index("player_beliefs_user_id_idx").on(belief.userId),
    index("player_beliefs_thesis_id_idx").on(belief.thesisId),
  ],
);

