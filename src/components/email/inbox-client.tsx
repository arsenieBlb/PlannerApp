"use client";

import { useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Search, RefreshCw, ChevronLeft } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmailView } from "./email-view";
import { cn, formatEmailDate, truncateText } from "@/lib/utils";
import type { ParsedEmail } from "@/types";

interface EmailsResponse {
  data: {
    items: ParsedEmail[];
    total: number;
    hasMore: boolean;
  };
}

export function InboxClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("emailId"));
  const [filter, setFilter] = useState<string>("all");

  const { data, isLoading } = useQuery<EmailsResponse>({
    queryKey: ["emails", search, filter],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "50" });
      if (search) params.set("search", search);
      if (filter !== "all") params.set("category", filter);
      const res = await fetch(`/api/gmail/messages?${params}`);
      return res.json();
    },
  });

  const emails = data?.data?.items ?? [];
  const selectedEmail = emails.find((e) => e.id === selectedId) ?? null;

  const handleSelect = useCallback((email: ParsedEmail) => {
    setSelectedId(email.id);
    router.replace(`/inbox?emailId=${email.id}`, { scroll: false });
  }, [router]);

  const handleBack = () => {
    setSelectedId(null);
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
      {/* Email list panel */}
      <div
        className={cn(
          "flex flex-col border-r bg-background transition-all",
          selectedEmail ? "hidden md:flex md:w-80 lg:w-96" : "flex w-full"
        )}
      >
        {/* Search + filters */}
        <div className="border-b p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search emails…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {filters.map((f) => (
              <button
                key={f.key}
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
        </div>

        {/* Email list */}
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
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Email detail panel */}
      {selectedEmail ? (
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex items-center gap-2 border-b px-4 py-2 md:hidden">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-sm font-medium truncate">{selectedEmail.subject ?? "No subject"}</span>
          </div>
          <EmailView
            email={selectedEmail}
            onClose={handleBack}
            onAction={() => qc.invalidateQueries({ queryKey: ["emails"] })}
          />
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
      <p className="text-xs text-foreground truncate mb-1">
        {email.subject ?? "(no subject)"}
      </p>
      <p className="text-[11px] text-muted-foreground truncate mb-1.5">
        {truncateText(email.snippet ?? "", 80)}
      </p>
      <div className="flex gap-1 flex-wrap">
        {isUrgent && <Badge variant="urgent" className="text-[10px] h-4 px-1.5">urgent</Badge>}
        {hasNeedsReply && <Badge variant="meeting" className="text-[10px] h-4 px-1.5">needs reply</Badge>}
        {hasMeeting && <Badge variant="meeting" className="text-[10px] h-4 px-1.5">meeting</Badge>}
        {hasDeadline && <Badge variant="deadline" className="text-[10px] h-4 px-1.5">deadline</Badge>}
        {email.aiCategory && !["other", null].includes(email.aiCategory) && (
          <Badge variant={email.aiCategory as "meeting" | "deadline" | "personal" | "work" | "school" | "newsletter"} className="text-[10px] h-4 px-1.5">
            {email.aiCategory}
          </Badge>
        )}
      </div>
    </button>
  );
}
