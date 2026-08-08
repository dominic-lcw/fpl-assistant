import { tool } from "ai";
import { z } from "zod";

import { listRedditThreads, RedditApiError } from "@/lib/reddit/client";

const subredditSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[A-Za-z0-9_]+$/, "Use a subreddit name without r/ or spaces.");

function communityToolError(error: unknown) {
  return {
    error:
      error instanceof RedditApiError || error instanceof Error
        ? error.message
        : "Unexpected community tool failure.",
  };
}

/**
 * External community posts are evidence to inspect, never a recommendation
 * signal. They are intentionally not added to the user's active beliefs here.
 */
export function createCommunityTools() {
  return {
    list_reddit_fpl_threads: tool({
      description:
        "List recent FPL discussion from user-selected Reddit communities. Returns post metadata, short excerpts, and direct links. This is community evidence only: it does not create beliefs or change recommendation scores.",
      inputSchema: z.object({
        subreddits: z
          .array(subredditSchema)
          .min(1)
          .max(5)
          .describe(
            "Reddit communities to list, without r/. Example: ['FantasyPL', 'FantasyPLTools'].",
          ),
        sort: z
          .enum(["new", "hot"])
          .default("new")
          .describe("new for most recent posts; hot for current active discussion."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(25)
          .default(10)
          .describe("Maximum total posts to return across all requested communities."),
      }),
      execute: async ({ subreddits, sort, limit }) => {
        try {
          const threads = await listRedditThreads({ subreddits, sort, limit });
          return {
            source: "reddit" as const,
            fetchedAt: new Date().toISOString(),
            requestedSubreddits: subreddits,
            sort,
            threads,
            disclaimer:
              "Community posts are unverified discussion, not FPL data or recommendation inputs. Summarize uncertainty and disagreement; only create a player belief after the user explicitly asks.",
          };
        } catch (error) {
          return communityToolError(error);
        }
      },
    }),
  };
}
