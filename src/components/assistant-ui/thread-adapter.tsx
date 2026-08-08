"use client";

import {
  RuntimeAdapterProvider,
  useAui,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
} from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";
import { useMemo, type PropsWithChildren } from "react";

type RemoteThread = {
  id: string;
  title: string | null;
  status: "regular" | "archived";
  updatedAt: string;
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  return response.json() as Promise<T>;
}

export const threadListAdapter: RemoteThreadListAdapter = {
  async list() {
    const rows = await fetchJson<RemoteThread[]>("/api/threads");
    return {
      threads: rows.map((thread) => ({
        remoteId: thread.id,
        status: thread.status,
        title: thread.title ?? undefined,
        lastMessageAt: new Date(thread.updatedAt),
      })),
    };
  },
  async initialize() {
    const { id } = await fetchJson<{ id: string }>("/api/threads", {
      method: "POST",
    });
    return { remoteId: id };
  },
  async rename(remoteId, title) {
    await fetchJson(`/api/threads/${remoteId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
  },
  async archive(remoteId) {
    await fetchJson(`/api/threads/${remoteId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "archived" }),
    });
  },
  async unarchive(remoteId) {
    await fetchJson(`/api/threads/${remoteId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "regular" }),
    });
  },
  async delete(remoteId) {
    await fetch(`/api/threads/${remoteId}`, { method: "DELETE" });
  },
  async fetch(remoteId) {
    const thread = await fetchJson<RemoteThread>(`/api/threads/${remoteId}`);
    return {
      remoteId: thread.id,
      status: thread.status,
      title: thread.title ?? undefined,
      lastMessageAt: new Date(thread.updatedAt),
    };
  },
  async generateTitle(remoteId, messages) {
    return createAssistantStream(async (controller) => {
      const { title } = await fetchJson<{ title: string }>(
        `/api/threads/${remoteId}/title`,
        {
          method: "POST",
          body: JSON.stringify({ messages }),
        },
      );
      controller.appendText(title);
    });
  },
  unstable_Provider: ThreadHistoryProvider,
};

function ThreadHistoryProvider({ children }: PropsWithChildren) {
  const aui = useAui();
  const history = useMemo<ThreadHistoryAdapter>(
    () => ({
        async load() {
          return { messages: [] };
        },
        async append() {},
        withFormat: (format) => ({
          async load() {
            const { remoteId } = aui.threadListItem().getState();
            if (!remoteId) return { messages: [] };
            const rows = await fetchJson<
              {
                id: string;
                parent_id: string | null;
                format: string;
                content: Record<string, unknown>;
              }[]
            >(`/api/threads/${remoteId}/messages`);
            return {
              messages: rows.map((row) =>
                format.decode({
                  id: row.id,
                  parent_id: row.parent_id,
                  format: row.format,
                  content: row.content as never,
                }),
              ),
            };
          },
          async append(item) {
            const { remoteId } = await aui.threadListItem().initialize();
            await fetch(`/api/threads/${remoteId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: format.getId(item.message),
                parent_id: item.parentId,
                format: format.format,
                content: format.encode(item),
              }),
            });
          },
        }),
    }),
    [aui],
  );

  return (
    <RuntimeAdapterProvider adapters={{ history }}>
      {children}
    </RuntimeAdapterProvider>
  );
}
