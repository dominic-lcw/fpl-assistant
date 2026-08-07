CREATE TABLE "player_beliefs" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "element_id" integer NOT NULL,
  "form_belief" real DEFAULT 0 NOT NULL,
  "minutes_risk" real DEFAULT 0 NOT NULL,
  "ceiling" real,
  "floor" real,
  "confidence" real DEFAULT 0.5 NOT NULL,
  "horizon_gw" integer DEFAULT 3 NOT NULL,
  "rationale" text NOT NULL,
  "sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_beliefs" ADD CONSTRAINT "player_beliefs_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX "player_beliefs_user_element_uidx" ON "player_beliefs" USING btree ("user_id","element_id");
--> statement-breakpoint
CREATE INDEX "player_beliefs_user_id_idx" ON "player_beliefs" USING btree ("user_id");
