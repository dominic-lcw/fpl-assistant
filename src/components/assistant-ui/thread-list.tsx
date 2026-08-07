"use client";

import {
  ThreadListItemPrimitive,
  ThreadListPrimitive,
} from "@assistant-ui/react";
import { ArchiveIcon, MessageSquarePlusIcon, Trash2Icon } from "lucide-react";

export function ThreadList() {
  return (
    <aside className="border-border bg-muted/20 hidden w-64 shrink-0 border-r p-3 md:flex md:flex-col">
      <ThreadListPrimitive.New className="bg-primary text-primary-foreground hover:bg-primary/90 mb-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium">
        <MessageSquarePlusIcon className="size-4" />
        New chat
      </ThreadListPrimitive.New>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        <ThreadListPrimitive.Items>
          {() => (
            <ThreadListItemPrimitive.Root className="group hover:bg-muted flex items-center gap-1 rounded-lg p-1">
              <ThreadListItemPrimitive.Trigger className="text-foreground min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm">
                <ThreadListItemPrimitive.Title fallback="New conversation" />
              </ThreadListItemPrimitive.Trigger>
              <ThreadListItemPrimitive.Archive
                aria-label="Archive conversation"
                className="text-muted-foreground hover:text-foreground hidden size-7 items-center justify-center rounded-md group-hover:flex"
              >
                <ArchiveIcon className="size-3.5" />
              </ThreadListItemPrimitive.Archive>
              <ThreadListItemPrimitive.Delete
                aria-label="Delete conversation"
                className="text-muted-foreground hover:text-destructive hidden size-7 items-center justify-center rounded-md group-hover:flex"
              >
                <Trash2Icon className="size-3.5" />
              </ThreadListItemPrimitive.Delete>
            </ThreadListItemPrimitive.Root>
          )}
        </ThreadListPrimitive.Items>
      </div>
    </aside>
  );
}
