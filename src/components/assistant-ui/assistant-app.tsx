"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Thread } from "@/components/assistant-ui/thread";
import {
  ManagerIdBar,
  ManagerProvider,
} from "@/components/fpl/manager-context";

export function AssistantApp() {
  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: "/api/chat",
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ManagerProvider>
        <div className="flex h-dvh flex-col overflow-hidden">
          <ManagerIdBar />
          <main className="min-h-0 flex-1">
            <Thread />
          </main>
        </div>
      </ManagerProvider>
    </AssistantRuntimeProvider>
  );
}
