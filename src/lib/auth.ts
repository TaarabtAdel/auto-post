import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "@/db/schema/auth";
import { ensureLocalUser } from "@/lib/local-user";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [
    "http://localhost:3100",
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
  ],
});

const originalGetSession = auth.api.getSession.bind(auth.api);

auth.api.getSession = (async (opts) => {
  const session = await originalGetSession(opts);
  if (session) return session;
  const u = await ensureLocalUser();
  return {
    session: {
      id: "local-bypass",
      token: "local-bypass",
      userId: u.id,
      expiresAt: new Date("2099-12-31T00:00:00.000Z"),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    },
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      image: u.image,
    },
  };
}) as typeof auth.api.getSession;
