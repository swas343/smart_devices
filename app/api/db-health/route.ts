import { NextResponse } from "next/server";
import { getPrisma } from "@/app/lib/prisma";

function getSanitizedDatabaseUrlInfo(rawUrl?: string) {
  if (!rawUrl) {
    return {
      present: false,
      host: null,
      port: null,
      database: null,
      username: null,
      query: null,
    };
  }

  try {
    const parsed = new URL(rawUrl);
    return {
      present: true,
      host: parsed.hostname,
      port: parsed.port || null,
      database: parsed.pathname?.replace(/^\//, "") || null,
      username: parsed.username || null,
      query: parsed.searchParams.toString() || null,
    };
  } catch {
    return {
      present: true,
      host: "unparseable",
      port: null,
      database: null,
      username: null,
      query: null,
    };
  }
}

/**
 * Temporary diagnostics endpoint.
 *
 * IMPORTANT:
 * - This endpoint intentionally avoids returning secrets.
 * - Remove this route after production debugging is done.
 */
export async function GET() {
  const dbInfo = getSanitizedDatabaseUrlInfo(process.env.DATABASE_URL);

  try {
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        ok: true,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
        db: dbInfo,
        message: "Database connection check passed.",
      },
      { status: 200 }
    );
  } catch (error) {
    const err = error as { message?: string; code?: string };

    return NextResponse.json(
      {
        ok: false,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
        db: dbInfo,
        error: {
          code: err?.code ?? null,
          message: err?.message ?? "Unknown database error",
        },
      },
      { status: 500 }
    );
  }
}
