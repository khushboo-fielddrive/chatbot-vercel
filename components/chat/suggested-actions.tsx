"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { motion } from "framer-motion";
import { memo } from "react";
import { suggestions } from "@/lib/constants";
import type { ChatMessage } from "@/lib/types";
import { Suggestion } from "../ai-elements/suggestion";
import type { VisibilityType } from "./visibility-selector";

type SuggestedActionsProps = {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  selectedVisibilityType: VisibilityType;
};

function PureSuggestedActions({ chatId, sendMessage }: SuggestedActionsProps) {
  const suggestedActions = suggestions;

  return (
    <div
      className="grid w-full grid-cols-2 gap-2.5"
      data-testid="suggested-actions"
    >
      {suggestedActions.map((suggestedAction, index) => (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="min-w-0"
          exit={{ opacity: 0, y: 16 }}
          initial={{ opacity: 0, y: 16 }}
          key={suggestedAction}
          transition={{
            delay: 0.06 * index,
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <Suggestion
            className="h-auto w-full whitespace-normal rounded-xl border border-border/50 bg-card/30 p-3 text-left text-[12px] leading-relaxed text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-card/60 hover:text-foreground hover:shadow-[var(--shadow-card)]"
            onClick={(suggestion) => {
              window.history.pushState(
                {},
                "",
                `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${chatId}`
              );
              sendMessage({
                role: "user",
                parts: [{ type: "text", text: suggestion }],
              });
            }}
            suggestion={suggestedAction}
          >
            {suggestedAction}
          </Suggestion>
        </motion.div>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(
  PureSuggestedActions,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }

    return true;
  }
);
