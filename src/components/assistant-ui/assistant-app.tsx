"use client";

import { useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Thread } from "@/components/assistant-ui/thread";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { threadListAdapter } from "@/components/assistant-ui/thread-adapter";
import {
  ModelProvider,
  useModelSelection,
} from "@/components/assistant-ui/model-picker";
import {
  ManagerIdBar,
  ManagerProvider,
} from "@/components/fpl/manager-context";

function useThreadRuntime() {
  const { modelId } = useModelSelection();

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
        body: { model: modelId },
      }),
    [modelId],
  );

  return useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport,
  });
}

function AssistantRuntimeShell({ authSlot }: { authSlot?: ReactNode }) {
  const runtime = useRemoteThreadListRuntime({
    adapter: threadListAdapter,
    runtimeHook: useThreadRuntime,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ManagerProvider>
        <div className="flex h-dvh overflow-hidden">
          <ThreadList />
          <div className="flex min-w-0 flex-1 flex-col">
            <ManagerIdBar authSlot={authSlot} />
            <main className="min-h-0 flex-1">
              <Thread />
            </main>
          </div>
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
