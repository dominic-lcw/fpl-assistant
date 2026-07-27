import "server-only";

import { parsePositiveInt } from "./validation";
import type {
  BootstrapStatic,
  ClassicLeagueStandings,
  ElementSummary,
  EventLive,
  Fixture,
  ManagerEntry,
  ManagerHistory,
  ManagerPicks,
} from "./types";

const FPL_BASE = "https://fantasy.premierleague.com/api";
const DEFAULT_REVALIDATE = 300;

export class FplApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(message);
    this.name = "FplApiError";
  }
}

async function fplFetch<T>(
  path: string,
  revalidate = DEFAULT_REVALIDATE,
): Promise<T> {
  const url = `${FPL_BASE}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "fpl-assistant/1.0",
        Accept: "application/json",
      },
      next: { revalidate },
    });
  } catch (error) {
    throw new FplApiError(
      `Failed to reach Fantasy Premier League API (${path}): ${
        error instanceof Error ? error.message : "network error"
      }`,
      0,
      path,
    );
  }

  if (!response.ok) {
    throw new FplApiError(
      `FPL API ${path} returned ${response.status}`,
      response.status,
      path,
    );
  }

  return (await response.json()) as T;
}

export async function getBootstrapStatic(): Promise<BootstrapStatic> {
  return fplFetch<BootstrapStatic>("/bootstrap-static/", 600);
}

export async function getFixtures(event?: number): Promise<Fixture[]> {
  if (event != null) {
    const gw = parsePositiveInt(event, "gameweek");
    return fplFetch<Fixture[]>(`/fixtures/?event=${gw}`, 300);
  }
  return fplFetch<Fixture[]>("/fixtures/", 600);
}

export async function getEventLive(eventId: number): Promise<EventLive> {
  const gw = parsePositiveInt(eventId, "gameweek");
  return fplFetch<EventLive>(`/event/${gw}/live/`, 60);
}

export async function getManagerEntry(managerId: number): Promise<ManagerEntry> {
  const id = parsePositiveInt(managerId, "manager ID");
  return fplFetch<ManagerEntry>(`/entry/${id}/`, 120);
}

export async function getManagerHistory(
  managerId: number,
): Promise<ManagerHistory> {
  const id = parsePositiveInt(managerId, "manager ID");
  return fplFetch<ManagerHistory>(`/entry/${id}/history/`, 120);
}

export async function getManagerPicks(
  managerId: number,
  eventId: number,
): Promise<ManagerPicks> {
  const id = parsePositiveInt(managerId, "manager ID");
  const gw = parsePositiveInt(eventId, "gameweek");
  return fplFetch<ManagerPicks>(`/entry/${id}/event/${gw}/picks/`, 60);
}

export async function getClassicLeagueStandings(
  leagueId: number,
  page = 1,
): Promise<ClassicLeagueStandings> {
  const id = parsePositiveInt(leagueId, "league ID");
  const p = parsePositiveInt(page, "page");
  return fplFetch<ClassicLeagueStandings>(
    `/leagues-classic/${id}/standings/?page_standings=${p}`,
    120,
  );
}

export async function getElementSummary(
  playerId: number,
): Promise<ElementSummary> {
  const id = parsePositiveInt(playerId, "player ID");
  return fplFetch<ElementSummary>(`/element-summary/${id}/`, 180);
}
