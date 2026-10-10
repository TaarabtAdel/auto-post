import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { user } from "@/db/schema/auth";
import { eq, asc } from "drizzle-orm";

export const LOCAL_EMAIL = "local@autopost.local";
export const LOCAL_DISPLAY_NAME = "ADMIN";

export async function ensureLocalUser() {
  let row = await db
    .select()
    .from(user)
    .where(eq(user.email, LOCAL_EMAIL))
    .then((r) => r[0]);

  if (!row) {
    row = await db
      .select()
      .from(user)
      .orderBy(asc(user.createdAt))
      .limit(1)
      .then((r) => r[0]);
  }

  if (row) {
    if (row.name !== LOCAL_DISPLAY_NAME) {
      const now = new Date();
      await db
        .update(user)
        .set({ name: LOCAL_DISPLAY_NAME, updatedAt: now })
        .where(eq(user.id, row.id));
      return { ...row, name: LOCAL_DISPLAY_NAME, updatedAt: now };
    }
    return row;
  }

  const now = new Date();
  const created = {
    id: randomBytes(16).toString("hex"),
    name: LOCAL_DISPLAY_NAME,
    email: LOCAL_EMAIL,
    emailVerified: true,
    image: null as string | null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(user).values(created);
  return created;
}
