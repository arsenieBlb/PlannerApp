"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Search, RefreshCw, ChevronLeft } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmailView } from "./email-view";
import { cn, formatEmailDate, formatRelativeDate, truncateText } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { normalizeEmailFromApi } from "@/lib/email-normalize";
import type { ParsedEmail } from "@/types";

const PAGE_SIZE = 50;

interface EmailsResponse {
  data: {
    items: ParsedEmail[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
}

export function InboxClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const selectedId = searchParams.get("emailId");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [syncing, setSyncing] = useState(false);

  const { data: settingsPayload } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("settings");
      return res.json() as Promise<{
        data: {
          settings: {
            gmailSyncEnabled: boolean;
            lastGmailSync: string | null;
          } | null;
        };
      }>;
    },
  });

  const gmailEnabled = settingsPayload?.data?.settings?.gmailSyncEnabled ?? true;
  const lastSync = settingsPayload?.data?.settings?.lastGmailSync;

  const handleGmailSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : `Sync failed (${res.status})`);
      }
      const n = data.data?.synced ?? 0;
      toast({
        title: "Gmail sync complete",
        description:
          n > 0
            ? `Added ${n} new message${n === 1 ? "" : "s"} from your inbox.`
            : "Inbox was already up to date — scroll to see all messages.",
        variant: "success",
      });
      await qc.invalidateQueries({ queryKey: ["emails"] });
      await qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast({
        title: "Could not sync Gmail",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  }, [qc, toast]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["emails", search, filter],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        pageSize: String(PAGE_SIZE),
        page: String(pageParam),
      });
      if (search) params.set("search", search);
      if (filter !== "all") params.set("category", filter);
      const res = await fetch(`/api/gmail/messages?${params}`);
      return res.json() as Promise<EmailsResponse>;
    },
    getNextPageParam: (lastPage) => {
      const d = lastPage.data;
      if (!d?.hasMore) return undefined;
      return d.page + 1;
    },
  });

  const emails = useMemo(
    () => data?.pages.flatMap((p) => p.data?.items ?? []) ?? [],
    [data]
  );

  const selectedFromList = useMemo(
    () => (selectedId ? emails.find((e) => e.id === selectedId) ?? null : null),
    [emails, selectedId]
  );

  const {
    data: singleEmail,
    isLoading: singleLoading,
    isError: singleError,
  } = useQuery({
    queryKey: ["email-detail", selectedId],
    queryFn: async () => {
      const res = await fetch(`/api/gmail/message/${selectedId}`);
      if (!res.ok) throw new Error("not_found");
      const json = await res.json();
      return normalizeEmailFromApi(json.data as Record<string, unknown>);
    },
    enabled: Boolean(selectedId) && !selectedFromList,
  });

  const selectedEmail = selectedFromList ?? singleEmail ?? null;

  const handleSelect = useCallback(
    (email: ParsedEmail) => {
      router.replace(`/inbox?emailId=${email.id}`, { scroll: false });
    },
    [router]
  );

  const handleBack = () => {
    router.replace("/inbox", { scroll: false });
  };

  const filters = [
    { key: "all", label: "All" },
    { key: "meeting", label: "Meetings" },
    { key: "deadline", label: "Deadlines" },
    { key: "work", label: "Work" },
    { key: "personal", label: "Personal" },
    { key: "school", label: "School" },
  ];

  return (
    <div className="flex flex-1 overflow-hidden">
      <div
        className={cn(
          "flex flex-col border-r bg-background transition-all",
          selectedEmail ? "hidden md:flex md:w-80 lg:w-96" : "flex w-full"
        )}
      >
        <div className="border-b p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search emails…"
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  filter === f.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="rounded-md border bg-muted/30 p-2.5 space-y-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {gmailEnabled ? (
                lastSync ? (
                  <>
                    Last pull from Gmail {formatRelativeDate(new Date(lastSync))}. Demo/seed emails are mixed in
                    until you remove them — real messages use Google&apos;s message ids.
                  </>
                ) : (
                  <>
                    This list is your <strong>local copy</strong> of mail. Use <strong>Sync from Gmail</strong> to
                    import your real inbox (up to 50 recent threads per sync).
                  </>
                )
              ) : (
                <>
                  Gmail sync is off. Enable <strong>Enable Gmail sync</strong> in Settings, then sync here.
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={!gmailEnabled || syncing}
                onClick={() => void handleGmailSync()}
              >
                {syncing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Sync from Gmail
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" asChild>
                <Link href="/settings">Gmail &amp; sync settings</Link>
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <Mail className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No emails found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Sync your Gmail inbox in Settings to get started
              </p>
            </div>
          ) : (
            <div>
              {emails.map((email) => (
                <EmailListItem
                  key={email.id}
                  email={email}
                  isSelected={email.id === selectedId}
                  onClick={() => handleSelect(email)}
                />
              ))}
              {hasNextPage && (
                <div className="p-3 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    disabled={isFetchingNextPage}
                    onClick={() => fetchNextPage()}
                  >
                    {isFetchingNextPage ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      "Load more"
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </div>

      {selectedId ? (
        <div className="flex flex-1 flex-col min-w-0">
          {singleLoading && !selectedFromList ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin opacity-40" />
            </div>
          ) : singleError || !selectedEmail ? (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground px-6 text-center">
              <Mail className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Email not found</p>
              <p className="text-xs mt-1">It may have been removed or the link is invalid.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={handleBack}>
                Back to inbox
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b px-4 py-2 md:hidden">
                <Button variant="ghost" size="icon" onClick={handleBack}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <span className="text-sm font-medium truncate">
                  {selectedEmail.subject ?? "No subject"}
                </span>
              </div>
              <EmailView
                email={selectedEmail}
                onClose={handleBack}
                onAction={() => {
                  qc.invalidateQueries({ queryKey: ["emails"] });
                  qc.invalidateQueries({ queryKey: ["email-detail", selectedId] });
                }}
              />
            </>
          )}
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select an email to view</p>
          </div>
        </div>
      )}
    </div>
  );
}

function EmailListItem({
  email,
  isSelected,
  onClick,
}: {
  email: ParsedEmail;
  isSelected: boolean;
  onClick: () => void;
}) {
  const tags = email.aiTags ?? [];
  const hasNeedsReply = tags.includes("needs_reply");
  const hasMeeting = tags.includes("meeting");
  const hasDeadline = tags.includes("deadline");
  const isUrgent = tags.includes("urgent");

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b transition-colors hover:bg-accent",
        isSelected && "bg-accent",
        !email.isRead && "bg-blue-50/50"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className={cn("text-sm truncate", !email.isRead && "font-semibold")}>
          {email.fromName ?? email.fromEmail}
        </span>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {formatEmailDate(new Date(email.receivedAt))}
        </span>
      </div>
      <p className="text-xs text-foreground truncate mb-1">{email.subject ?? "(no subject)"}</p>
      <p className="text-[11px] text-muted-foreground truncate mb-1.5">
        {truncateText(email.snippet ?? "", 80)}
      </p>
      <div className="flex gap-1 flex-wrap">
        {isUrgent && (
          <Badge variant="urgent" className="text-[10px] h-4 px-1.5">
            urgent
          </Badge>
        )}
        {hasNeedsReply && (
          <Badge variant="meeting" className="text-[10px] h-4 px-1.5">
            needs reply
          </Badge>
        )}
        {hasMeeting && (
          <Badge variant="meeting" className="text-[10px] h-4 px-1.5">
            meeting
          </Badge>
        )}
        {hasDeadline && (
          <Badge variant="deadline" className="text-[10px] h-4 px-1.5">
            deadline
          </Badge>
        )}
        {email.aiCategory && !["other", null].includes(email.aiCategory) && (
          <Badge
            variant={
              email.aiCategory as
                | "meeting"
                | "deadline"
                | "personal"
                | "work"
                | "school"
                | "newsletter"
            }
            className="text-[10px] h-4 px-1.5"
          >
            {email.aiCategory}
          </Badge>
        )}
      </div>
    </button>
  );
}
