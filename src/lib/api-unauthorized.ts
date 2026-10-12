import { NextResponse } from "next/server";

export function apiUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
