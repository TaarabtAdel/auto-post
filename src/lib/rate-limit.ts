/**
 * In-memory rate limiter for API endpoints.
 * Each instance tracks a specific endpoint/action.
 * Entries auto-expire — cleanup runs every 60s.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private windowMs: number;
  private max: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: { windowMs: number; max: number }) {
    this.windowMs = opts.windowMs;
    this.max = opts.max;

    // Cleanup expired entries every 60s
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (now > entry.resetAt) {
          this.store.delete(key);
        }
      }
    }, 60_000);

    // Don't keep process alive just for cleanup
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.max - 1, resetAt: now + this.windowMs };
    }

    if (entry.count >= this.max) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count++;
    return { allowed: true, remaining: this.max - entry.count, resetAt: entry.resetAt };
  }
}

// Shared rate limiter instances
export const authLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });   // 10 / 15min / IP
export const uploadLimiter = new RateLimiter({ windowMs: 60 * 1000, max: 20 });       // 20 / min / user
export const postsLimiter = new RateLimiter({ windowMs: 60 * 1000, max: 30 });        // 30 / min / user
export const aiLimiter = new RateLimiter({ windowMs: 60 * 1000, max: 10 });           // 10 / min / user
export const reelLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 6 });     // 6 / 10min / user
export const youtubeLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 8 });  // 8 / 10min / user

import { NextResponse } from "next/server";

/**
 * Helper: check rate limit and return 429 response if exceeded.
 * Returns null if allowed, NextResponse if blocked.
 */
export function checkRateLimit(limiter: RateLimiter, key: string): NextResponse | null {
  const result = limiter.check(key);
  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      }
    );
  }
  return null;
}
