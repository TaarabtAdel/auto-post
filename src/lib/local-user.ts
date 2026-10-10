import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { user } from "@/db/schema/auth";

const LOCAL_EMAIL = "local@autopost.local";

export async function ensureLocalUser() {
  const existing = await db.select().from(user).limit(1);
  if (existing[0]) return existing[0];

  const now = new Date();
  const row = {
    id: randomBytes(16).toString("hex"),
    name: "Local",
    email: LOCAL_EMAIL,
    emailVerified: true,
    image: null as string | null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(user).values(row);
  return row;
}
