-- Temporary DEFAULT backfills any pre-existing rows (a bare NOT NULL add fails on a non-empty table); dropped right after so the column matches the schema.
ALTER TABLE "conventions" ADD COLUMN "category" text DEFAULT 'style' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ALTER COLUMN "category" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "rationale" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "conventions_repo_created_idx" ON "conventions" USING btree ("repo_id","created_at");