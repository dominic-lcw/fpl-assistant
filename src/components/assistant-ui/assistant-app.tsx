"use client";

import { useMemo, type ReactNode } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Thread } from "@/components/assistant-ui/thread";
import {
  ModelProvider,
  useModelSelection,
} from "@/components/assistant-ui/model-picker";
import {
  ManagerIdBar,
  ManagerProvider,
} from "@/components/fpl/manager-context";

function AssistantRuntimeShell({ authSlot }: { authSlot?: ReactNode }) {
  const { modelId } = useModelSelection();

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
        body: { model: modelId },
      }),
    [modelId],
  );

  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ManagerProvider>
        <div className="flex h-dvh flex-col overflow-hidden">
          <ManagerIdBar authSlot={authSlot} />
          <main className="min-h-0 flex-1">
            <Thread />
          </main>
        </div>
      </ManagerProvider>
    </AssistantRuntimeProvider>
  );
}

export function AssistantApp({ authSlot }: { authSlot?: ReactNode }) {
  return (
    <ModelProvider>
      <AssistantRuntimeShell authSlot={authSlot} />
    </ModelProvider>
  );
}
