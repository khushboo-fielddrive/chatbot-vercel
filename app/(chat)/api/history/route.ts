import type { NextRequest } from "next/server";
import { deleteAllChatsByUserId, getChatsByUserId } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { resolveUser } from "@/lib/auth/resolve-user";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get("limit") || "10", 10), 1),
    50
  );
  const startingAfter = searchParams.get("starting_after");
  const endingBefore = searchParams.get("ending_before");

  if (startingAfter && endingBefore) {
    return new ChatbotError(
      "bad_request:api",
      "Only one of starting_after or ending_before can be provided."
    ).toResponse();
  }

  const resolved = await resolveUser(request);
  if (resolved instanceof ChatbotError) {
    return resolved.toResponse();
  }

  const chats = await getChatsByUserId({
    id: resolved.userId,
    limit,
    startingAfter,
    endingBefore,
  });

  return Response.json(chats);
}

export async function DELETE(request: NextRequest) {
  const resolved = await resolveUser(request);
  if (resolved instanceof ChatbotError) {
    return resolved.toResponse();
  }

  const result = await deleteAllChatsByUserId({ userId: resolved.userId });

  return Response.json(result, { status: 200 });
}
