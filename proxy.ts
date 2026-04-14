import { type NextRequest, NextResponse } from "next/server";

function getAllowedOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_ALLOWED_ORIGINS ?? "";
  if (!raw || raw === "*") return [];
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = getAllowedOrigins();
  const isAllowed =
    !origin ||
    allowedOrigins.length === 0 ||
    allowedOrigins.includes(origin);

  if (!isAllowed || !origin) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-event-user-id, x-event-id, x-event-account-id, x-portal-token",
  };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  // Handle CORS preflight for all /api routes
  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new NextResponse(null, {
      status: 204,
      headers: buildCorsHeaders(origin),
    });
  }

  // Attach CORS headers to /api responses
  if (pathname.startsWith("/api/")) {
    const corsHeaders = buildCorsHeaders(origin);
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",

    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
