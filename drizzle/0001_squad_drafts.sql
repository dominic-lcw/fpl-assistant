CREATE TABLE "squad_drafts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "mode" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "budget_tenths" integer NOT NULL,
  "bank_tenths" integer DEFAULT 0 NOT NULL,
  "cost_tenths" integer DEFAULT 0 NOT NULL,
  "manager_id" integer,
  "gameweek" integer,
  "picks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "squad_drafts" ADD CONSTRAINT "squad_drafts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX "squad_drafts_user_id_idx" ON "squad_drafts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "squad_drafts_user_status_idx" ON "squad_drafts" USING btree ("user_id","status");
