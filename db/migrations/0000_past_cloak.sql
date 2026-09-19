CREATE TYPE "public"."suit_key" AS ENUM('SPADES', 'CLUBS', 'DIAMONDS', 'HEARTS', 'JOKER');--> statement-breakpoint
CREATE TABLE "event" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"start_time" timestamp with time zone DEFAULT now() NOT NULL,
	"submissions_open" boolean DEFAULT true NOT NULL,
	"glitch" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_singleton" CHECK ("event"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"suit" "suit_key" NOT NULL,
	"team_name" text NOT NULL,
	"team_slug" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_suit_team_idx" UNIQUE("suit","team_slug")
);
--> statement-breakpoint
CREATE TABLE "suits" (
	"suit" "suit_key" PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suits_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_suit_suits_suit_fk" FOREIGN KEY ("suit") REFERENCES "public"."suits"("suit") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_suit_time_idx" ON "submissions" USING btree ("suit","submitted_at");--> statement-breakpoint
CREATE INDEX "submissions_team_idx" ON "submissions" USING btree ("team_slug","submitted_at");--> statement-breakpoint
CREATE INDEX "submissions_time_idx" ON "submissions" USING btree ("submitted_at" DESC NULLS LAST);