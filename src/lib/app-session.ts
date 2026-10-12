import { headers } from "next/headers";
import { ensureLocalUser } from "@/lib/local-user";
import { isAuthBypassEnabled } from "@/lib/auth-bypass";

/** Session shape used across dashboard + API (Better Auth compatible). */
export type AppSession = {
  session: {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
  };
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
    image: string | null;
  };
};

function localSessionFromUser(
  u: Awaited<ReturnType<typeof ensureLocalUser>>
): AppSession {
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
}

type GetSessionOpts = { headers: Headers };

/**
 * Session đăng nhập Better Auth. Trả null nếu chưa login (trừ AUTH_BYPASS=1).
 */
export async function getAppSession(
  opts?: GetSessionOpts
): Promise<AppSession | null> {
  if (isAuthBypassEnabled()) {
    const u = await ensureLocalUser();
    return localSessionFromUser(u);
  }

  const { auth } = await import("@/lib/auth");
  const hdrs = opts?.headers ?? (await headers());
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return null;
  return session as AppSession;
}
