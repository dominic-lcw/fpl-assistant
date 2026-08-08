"use client";

import {
  makeAssistantToolUI,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { ExternalLinkIcon, MessageCircleIcon } from "lucide-react";

import { ToolFallback } from "@/components/assistant-ui/tool-fallback";

type RedditThread = {
  id: string;
  title: string;
  url: string;
  subreddit: string;
  score: number;
  commentCount: number;
  createdAt: string;
  excerpt: string | null;
};

type RedditToolResult = {
  error?: string;
  requestedSubreddits?: string[];
  sort?: string;
  threads?: RedditThread[];
  disclaimer?: string;
};

function relativeTime(date: string) {
  const hours = Math.max(0, Math.round((Date.now() - Date.parse(date)) / 3_600_000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function RedditThreadListRender(
  props: ToolCallMessagePartProps<Record<string, unknown>, RedditToolResult>,
) {
  const { result, status } = props;
  if (status?.type !== "complete" || !result || result.error) {
    return <ToolFallback {...props} />;
  }
  const threads = result.threads ?? [];
  return (
    <section className="border-border/70 my-2 w-full rounded-xl border px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Reddit community pulse</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {(result.requestedSubreddits ?? []).map((name) => `r/${name}`).join(" · ")}
            {result.sort ? ` · ${result.sort}` : ""}
          </p>
        </div>
        <span className="text-muted-foreground text-xs">{threads.length} posts</span>
      </div>
      {threads.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-xs">No posts were returned.</p>
      ) : (
        <ul className="mt-3 divide-y">
          {threads.map((thread) => (
            <li key={thread.id} className="py-2 first:pt-0 last:pb-0">
              <a
                className="group flex gap-2 text-sm font-medium hover:underline"
                href={thread.url}
                target="_blank"
                rel="noreferrer"
              >
                <span className="min-w-0 truncate">{thread.title}</span>
                <ExternalLinkIcon className="mt-0.5 size-3.5 shrink-0 opacity-60" />
              </a>
              <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                <span>r/{thread.subreddit}</span>
                <span>·</span>
                <span>{relativeTime(thread.createdAt)}</span>
                <span>·</span>
                <span>{thread.score} score</span>
                <span className="inline-flex items-center gap-0.5">
                  <MessageCircleIcon className="size-3" />
                  {thread.commentCount}
                </span>
              </p>
              {thread.excerpt ? (
                <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
                  {thread.excerpt}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground mt-3 text-[0.7rem] leading-relaxed">
        {result.disclaimer}
      </p>
    </section>
  );
}

export const ListRedditFplThreadsToolUI = makeAssistantToolUI({
  toolName: "list_reddit_fpl_threads",
  render: RedditThreadListRender,
});
