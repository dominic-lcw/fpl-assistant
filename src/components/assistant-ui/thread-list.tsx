"use client";

import { useState } from "react";
import {
  ThreadListItemPrimitive,
  ThreadListPrimitive,
} from "@assistant-ui/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  MenuIcon,
  MessageSquarePlusIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuiState } from "@assistant-ui/react";
import { formatThreadUpdatedAt } from "@/lib/threads/retention";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ThreadList() {
  return (
    <aside className="border-border bg-muted/20 hidden w-64 shrink-0 border-r p-3 md:flex md:flex-col">
      <ThreadListContent />
    </aside>
  );
}

export function MobileThreadList() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open conversations"
            className="md:hidden"
          />
        }
      >
        <MenuIcon />
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="bg-background inset-y-0 left-0 h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-3 sm:max-w-[85vw]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Conversations</DialogTitle>
          <DialogDescription>
            Select, archive, or delete a saved conversation.
          </DialogDescription>
        </DialogHeader>
        <ThreadListContent onSelect={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ThreadListContent({ onSelect }: { onSelect?: () => void }) {
  return (
    <>
      <ThreadListPrimitive.New
        onClick={onSelect}
        className="bg-primary text-primary-foreground hover:bg-primary/90 mb-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium"
      >
        <MessageSquarePlusIcon className="size-4" />
        New chat
      </ThreadListPrimitive.New>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        <ThreadListPrimitive.Items>
          {() => <ThreadListItem onSelect={onSelect} />}
        </ThreadListPrimitive.Items>
        <ThreadListPrimitive.Items archived>
          {() => <ThreadListItem onSelect={onSelect} archived />}
        </ThreadListPrimitive.Items>
      </div>
    </>
  );
}

function ThreadListItem({
  archived = false,
  onSelect,
}: {
  archived?: boolean;
  onSelect?: () => void;
}) {
  const lastMessageAt = useAuiState((s) => s.threadListItem.lastMessageAt);

  return (
    <ThreadListItemPrimitive.Root
      onClick={onSelect}
      className="group hover:bg-muted flex items-center gap-1 rounded-lg p-1"
    >
      <ThreadListItemPrimitive.Trigger className="text-foreground min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm">
        <span className="block truncate">
          <ThreadListItemPrimitive.Title fallback="New conversation" />
        </span>
        {lastMessageAt && (
          <time
            dateTime={lastMessageAt.toISOString()}
            title={`Last updated ${lastMessageAt.toLocaleString()}`}
            className="text-muted-foreground mt-0.5 block text-xs"
          >
            {formatThreadUpdatedAt(lastMessageAt)}
          </time>
        )}
      </ThreadListItemPrimitive.Trigger>
      {archived ? (
        <ThreadListItemPrimitive.Unarchive
          aria-label="Restore conversation"
          className="text-muted-foreground hover:text-foreground hidden size-7 items-center justify-center rounded-md group-hover:flex"
        >
          <ArchiveRestoreIcon className="size-3.5" />
        </ThreadListItemPrimitive.Unarchive>
      ) : (
        <ThreadListItemPrimitive.Archive
          aria-label="Archive conversation"
          className="text-muted-foreground hover:text-foreground hidden size-7 items-center justify-center rounded-md group-hover:flex"
        >
          <ArchiveIcon className="size-3.5" />
        </ThreadListItemPrimitive.Archive>
      )}
      <ThreadListItemPrimitive.Delete
        aria-label="Delete conversation"
        className="text-muted-foreground hover:text-destructive hidden size-7 items-center justify-center rounded-md group-hover:flex"
      >
        <Trash2Icon className="size-3.5" />
      </ThreadListItemPrimitive.Delete>
    </ThreadListItemPrimitive.Root>
  );
}
