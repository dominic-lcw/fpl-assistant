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
import {
  MobileThreadList,
  ThreadList,
} from "@/components/assistant-ui/thread-list";
import { threadListAdapter } from "@/components/assistant-ui/thread-adapter";
import {
  ModelProvider,
  useModelSelection,
} from "@/components/assistant-ui/model-picker";
import {
  ManagerIdBar,
  ManagerProvider,
} from "@/components/fpl/manager-context";
import { DraftProvider } from "@/components/fpl/draft-context";
import {
  DraftSideRail,
  MobileDraftPanel,
} from "@/components/fpl/draft-panel";
import { AskUserChoicesTool } from "@/components/fpl/ask-user-tool";
import {
  DeleteSquadDraftToolSync,
  GetSquadDraftToolSync,
  SuggestSquadToolSync,
} from "@/components/fpl/draft-tool-sync";
import {
  ComparePlayersToolUI,
  GetSuggestionsToolUI,
} from "@/components/fpl/suggestions-tool-ui";
import {
  ClearPlayerBeliefToolUI,
  ComputePlayerExpectationToolUI,
  CreateFormThesisToolUI,
  GetFormThesisToolUI,
  GetPlayerBeliefToolUI,
  ListFormThesesToolUI,
  ListPlayerBeliefsToolUI,
  SynthesizeFormThesisToolUI,
  UpsertPlayerBeliefToolUI,
} from "@/components/fpl/beliefs-tool-ui";
import { ListRedditFplThreadsToolUI } from "@/components/fpl/community-tool-ui";
import { ThesisProvider } from "@/components/fpl/thesis-context";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useMediaQuery } from "@/hooks/use-media-query";
import { createFplFollowUpSuggestionAdapter } from "@/lib/fpl/follow-up-suggestions";

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

  const suggestionAdapter = useMemo(
    () => createFplFollowUpSuggestionAdapter(),
    [],
  );

  return useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport,
    adapters: {
      suggestion: suggestionAdapter,
    },
  });
}

function ChatWithDraftRail() {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (!isDesktop) {
    return (
      <main className="min-h-0 flex-1">
        <Thread />
      </main>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel defaultSize="72%" minSize="40%" className="min-w-0">
        <main className="h-full min-h-0">
          <Thread />
        </main>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="28%" minSize="18%" maxSize="42%">
        <DraftSideRail />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function AssistantRuntimeShell({ authSlot }: { authSlot?: ReactNode }) {
  const runtime = useRemoteThreadListRuntime({
    adapter: threadListAdapter,
    runtimeHook: useThreadRuntime,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ManagerProvider>
        <DraftProvider>
          <ThesisProvider>
            <AskUserChoicesTool />
            <SuggestSquadToolSync />
            <GetSquadDraftToolSync />
            <DeleteSquadDraftToolSync />
            <GetSuggestionsToolUI />
            <ComparePlayersToolUI />
            <ListRedditFplThreadsToolUI />
            <CreateFormThesisToolUI />
            <ListFormThesesToolUI />
            <GetFormThesisToolUI />
            <SynthesizeFormThesisToolUI />
            <UpsertPlayerBeliefToolUI />
            <ComputePlayerExpectationToolUI />
            <ListPlayerBeliefsToolUI />
            <GetPlayerBeliefToolUI />
            <ClearPlayerBeliefToolUI />
            <div className="flex h-dvh overflow-hidden">
              <ThreadList />
              <div className="flex min-w-0 flex-1 flex-col">
                <ManagerIdBar
                  authSlot={authSlot}
                  leadingSlot={<MobileThreadList />}
                  trailingSlot={<MobileDraftPanel />}
                />
                <ChatWithDraftRail />
              </div>
            </div>
          </ThesisProvider>
        </DraftProvider>
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
