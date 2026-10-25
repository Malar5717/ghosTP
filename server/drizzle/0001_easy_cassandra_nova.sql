CREATE TABLE "activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"message_id" varchar(255) NOT NULL,
	"subject" text,
	"sender" text,
	"status" varchar(20) DEFAULT 'trashed' NOT NULL,
	"moved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"restored_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	CONSTRAINT "activity_user_message_unique" UNIQUE("user_id","message_id")
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_idx" ON "activity" USING btree ("user_id");