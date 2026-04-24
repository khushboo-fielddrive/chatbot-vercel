import { initBotId } from "botid/client/core";
import * as Sentry from "@sentry/nextjs";

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

initBotId({
  protect: [
    {
      path: "/api/chat",
      method: "POST",
    },
  ],
});
