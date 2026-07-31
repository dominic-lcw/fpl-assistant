CREATE TABLE "users" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text,
  "email" text NOT NULL,
  "email_verified" timestamp,
  "image" text,
  "role" text DEFAULT 'member' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "approved_at" timestamp,
  "approved_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "accounts" (
  "user_id" text NOT NULL,
  "type" text NOT NULL,
  "provider" text NOT NULL,
  "provider_account_id" text NOT NULL,
  "refresh_token" text,
  "access_token" text,
  "expires_at" integer,
  "token_type" text,
  "scope" text,
  "id_token" text,
  "session_state" text,
  CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);

CREATE TABLE "sessions" (
  "session_token" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "expires" timestamp NOT NULL
);

CREATE TABLE "verification_tokens" (
  "identifier" text NOT NULL,
  "token" text NOT NULL,
  "expires" timestamp NOT NULL,
  CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);

CREATE TABLE "threads" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "title" text,
  "status" text DEFAULT 'regular' NOT NULL,
  "custom" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "messages" (
  "id" text PRIMARY KEY NOT NULL,
  "thread_id" text NOT NULL,
  "parent_id" text,
  "format" text NOT NULL,
  "content" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
ALTER TABLE "threads" ADD CONSTRAINT "threads_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk"
  FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE cascade;

CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");
CREATE INDEX "threads_user_id_idx" ON "threads" USING btree ("user_id");
CREATE INDEX "messages_thread_id_idx" ON "messages" USING btree ("thread_id");
