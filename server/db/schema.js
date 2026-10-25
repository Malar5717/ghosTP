import {
    pgTable,
    serial,
    integer,
    varchar,
    text,
    timestamp,
    unique,
    index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    googleId: varchar("google_id", { length: 255 })
        .unique()
        .notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tokens = pgTable("tokens", {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
        .references(() => users.id, { onDelete: "cascade" })
        .notNull()
        .unique(),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const activity = pgTable(
    "activity",
    {
        id: serial("id").primaryKey(),
        userId: integer("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        messageId: varchar("message_id", { length: 255 }).notNull(),
        subject: text("subject"),
        sender: text("sender"),
        // trashed | restored | deleted
        status: varchar("status", { length: 20 }).notNull().default("trashed"),
        movedAt: timestamp("moved_at", { withTimezone: true }).defaultNow().notNull(),
        restoredAt: timestamp("restored_at", { withTimezone: true }),
        checkedAt: timestamp("checked_at", { withTimezone: true }),
    },
    (t) => ({
        uniqUserMessage: unique("activity_user_message_unique").on(t.userId, t.messageId),
        userIdx: index("activity_user_idx").on(t.userId),
    })
);
