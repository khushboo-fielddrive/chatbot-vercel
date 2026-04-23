import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { resolveUser } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { convertToUIMessages } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return Response.json({ error: "chatId required" }, { status: 400 });
  }

  const resolved = await resolveUser(request);
  if (resolved instanceof ChatbotError) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const [chat, messages] = await Promise.all([
    getChatById({ id: chatId }),
    getMessagesByChatId({ id: chatId }),
  ]);

  if (!chat) {
    return Response.json({
      messages: [],
      visibility: "private",
      userId: null,
      isReadonly: false,
    });
  }

  if (chat.visibility === "private" && chat.userId !== resolved.userId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const isReadonly = chat.userId !== resolved.userId;

  return Response.json({
    messages: convertToUIMessages(messages),
    visibility: chat.visibility,
    userId: chat.userId,
    isReadonly,
  });
}
