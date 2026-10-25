import {
    pgTable,
    serial,
    integer,
    varchar,
    text,
    timestamp,
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
