import "server-only";

const REDDIT_OAUTH_BASE = "https://oauth.reddit.com";
const REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const DEFAULT_REVALIDATE_SECONDS = 300;

type RedditTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type RedditPost = {
  id?: string;
  title?: string;
  permalink?: string;
  subreddit?: string;
  score?: number;
  num_comments?: number;
  created_utc?: number;
  author?: string;
  selftext?: string;
};

type RedditListingResponse = {
  data?: { children?: Array<{ data?: RedditPost }> };
};

export type RedditThread = {
  id: string;
  title: string;
  url: string;
  subreddit: string;
  score: number;
  commentCount: number;
  createdAt: string;
  author: string | null;
  excerpt: string | null;
};

export class RedditApiError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
  ) {
    super(message);
    this.name = "RedditApiError";
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function config() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent = process.env.REDDIT_USER_AGENT;
  if (!clientId || !clientSecret || !userAgent) {
    throw new RedditApiError(
      "Reddit is not configured. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, and REDDIT_USER_AGENT on the server.",
    );
  }
  return { clientId, clientSecret, userAgent };
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const { clientId, clientSecret, userAgent } = config();
  let response: Response;
  try {
    response = await fetch(REDDIT_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": userAgent,
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
  } catch (error) {
    throw new RedditApiError(
      `Failed to reach Reddit authentication: ${error instanceof Error ? error.message : "network error"}`,
    );
  }

  if (!response.ok) {
    throw new RedditApiError(
      `Reddit authentication returned ${response.status}. Check the app credentials and User-Agent.`,
      response.status,
    );
  }

  const body = (await response.json()) as RedditTokenResponse;
  if (!body.access_token) {
    throw new RedditApiError("Reddit authentication did not return an access token.");
  }
  cachedToken = {
    value: body.access_token,
    // Refresh early to avoid using a token while it expires.
    expiresAt: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000,
  };
  return cachedToken.value;
}

function normalizeThread(
  value: RedditPost | undefined,
): RedditThread | null {
  if (
    !value?.id ||
    !value.title ||
    !value.permalink ||
    !value.subreddit ||
    typeof value.created_utc !== "number"
  ) {
    return null;
  }
  const excerpt = value.selftext?.replace(/\s+/g, " ").trim().slice(0, 500);
  return {
    id: value.id,
    title: value.title,
    url: `https://www.reddit.com${value.permalink}`,
    subreddit: value.subreddit,
    score: value.score ?? 0,
    commentCount: value.num_comments ?? 0,
    createdAt: new Date(value.created_utc * 1000).toISOString(),
    author: value.author && value.author !== "[deleted]" ? value.author : null,
    excerpt: excerpt || null,
  };
}

export async function listRedditThreads(params: {
  subreddits: string[];
  sort: "new" | "hot";
  limit: number;
}): Promise<RedditThread[]> {
  const { userAgent } = config();
  const token = await getAccessToken();
  const results = await Promise.all(
    params.subreddits.map(async (subreddit) => {
      const url = new URL(
        `/r/${encodeURIComponent(subreddit)}/${params.sort}`,
        REDDIT_OAUTH_BASE,
      );
      url.searchParams.set("limit", String(params.limit));

      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "User-Agent": userAgent,
          },
          next: { revalidate: DEFAULT_REVALIDATE_SECONDS },
        });
      } catch (error) {
        throw new RedditApiError(
          `Failed to reach r/${subreddit}: ${error instanceof Error ? error.message : "network error"}`,
        );
      }
      if (!response.ok) {
        throw new RedditApiError(
          `Reddit listing for r/${subreddit} returned ${response.status}.`,
          response.status,
        );
      }

      const body = (await response.json()) as RedditListingResponse;
      return (body.data?.children ?? [])
        .map((child) => normalizeThread(child.data))
        .filter((thread): thread is RedditThread => thread !== null);
    }),
  );

  return results
    .flat()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, params.limit);
}
