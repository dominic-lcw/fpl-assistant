-- Form theses (named belief collections) + scope beliefs to a thesis.
CREATE TABLE "form_theses" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "status" text DEFAULT 'collecting' NOT NULL,
  "summary" text,
  "preferences" jsonb,
  "gameweek" integer,
  "horizon_gw" integer DEFAULT 3 NOT NULL,
  "linked_draft_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_theses" ADD CONSTRAINT "form_theses_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "form_theses" ADD CONSTRAINT "form_theses_linked_draft_id_squad_drafts_id_fk"
  FOREIGN KEY ("linked_draft_id") REFERENCES "squad_drafts"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "form_theses_user_id_idx" ON "form_theses" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "form_theses_user_status_idx" ON "form_theses" USING btree ("user_id","status");
--> statement-breakpoint
-- Reset beliefs for thesis scoping (feature was brand new; empty in practice).
DELETE FROM "player_beliefs";
--> statement-breakpoint
DROP INDEX IF EXISTS "player_beliefs_user_element_uidx";
--> statement-breakpoint
ALTER TABLE "player_beliefs" ADD COLUMN "thesis_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "player_beliefs" ADD CONSTRAINT "player_beliefs_thesis_id_form_theses_id_fk"
  FOREIGN KEY ("thesis_id") REFERENCES "form_theses"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX "player_beliefs_thesis_element_uidx" ON "player_beliefs" USING btree ("thesis_id","element_id");
--> statement-breakpoint
CREATE INDEX "player_beliefs_thesis_id_idx" ON "player_beliefs" USING btree ("thesis_id");
