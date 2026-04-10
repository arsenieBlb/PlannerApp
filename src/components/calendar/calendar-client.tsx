"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay,
  startOfMonth, endOfMonth, isToday, addMonths, subMonths,
  addWeeks, subWeeks, addDays, subDays, differenceInMinutes,
  setHours, setMinutes, startOfDay, formatDistance,
} from "date-fns";
import {
  Plus, ChevronLeft, ChevronRight, CheckSquare, Loader2, Trash2,
  Clock, MapPin, AlignLeft, X, Calendar, Tag, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn, parseJsonArray } from "@/lib/utils";
import type { PlannerItem } from "@prisma/client";

// ─── Config ───────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 72;
const START_HOUR = 6;
const END_HOUR = 24;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR);

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoogleEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  isAllDay: boolean;
  description?: string | null;
}

interface CalendarData {
  data: { plannerItems: PlannerItem[]; googleEvents: GoogleEvent[] };
}

interface TimeEvent {
  id: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  type: string;
  priority?: string;
  tags?: string[];
  location?: string | null;
  color: string;
  textColor: string;
  bgLight: string;
  source: "planner" | "google";
  isAllDay?: boolean;
  status?: string;
  rawItem?: PlannerItem;
}

// ─── Color palette ────────────────────────────────────────────────────────────

const TYPE_STYLE: Record<string, { color: string; textColor: string; bgLight: string; dot: string; label: string; icon: string }> = {
  event:    { color: "bg-blue-500 border-l-blue-600",    textColor: "text-white",       bgLight: "bg-blue-50 border-blue-200",    dot: "bg-blue-500",    label: "Event",      icon: "📅" },
  task:     { color: "bg-emerald-500 border-l-emerald-600", textColor: "text-white",    bgLight: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500", label: "Task",    icon: "✅" },
  reminder: { color: "bg-purple-500 border-l-purple-600", textColor: "text-white",      bgLight: "bg-purple-50 border-purple-200",  dot: "bg-purple-500",  label: "Reminder", icon: "🔔" },
  deadline: { color: "bg-red-500 border-l-red-600",      textColor: "text-white",       bgLight: "bg-red-50 border-red-200",       dot: "bg-red-500",     label: "Deadline",  icon: "🔴" },
  block:    { color: "bg-amber-500 border-l-amber-600",  textColor: "text-white",       bgLight: "bg-amber-50 border-amber-200",   dot: "bg-amber-500",   label: "Work Block", icon: "🧱" },
  google:   { color: "bg-sky-500 border-l-sky-600",      textColor: "text-white",       bgLight: "bg-sky-50 border-sky-200",       dot: "bg-sky-500",     label: "Google Calendar", icon: "🗓️" },
};

const DEFAULT_STYLE = TYPE_STYLE.event;

function getStyle(type: string) {
  return TYPE_STYLE[type] ?? DEFAULT_STYLE;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CalendarClient() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<"month" | "week" | "day" | "list">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createAtTime, setCreateAtTime] = useState<Date | undefined>();
  const [selectedEvent, setSelectedEvent] = useState<TimeEvent | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Scroll to current time on mount / view change
  useEffect(() => {
    if (gridRef.current && (view === "week" || view === "day")) {
      const now = new Date();
      const offset = (now.getHours() - START_HOUR - 1) * HOUR_HEIGHT;
      gridRef.current.scrollTop = Math.max(0, offset);
    }
  }, [view]);

  const { data, isLoading } = useQuery<CalendarData>({
    queryKey: ["calendar-events"],
    queryFn: async () => {
      const res = await fetch("/api/calendar/events?days=90");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const plannerItems = data?.data?.plannerItems ?? [];
  const googleEvents = data?.data?.googleEvents ?? [];

  const createMut = useMutation({
    mutationFn: async (form: FormData) => {
      const body = {
        title: form.get("title") as string,
        description: (form.get("description") as string) || undefined,
        type: form.get("type") as string,
        priority: form.get("priority") as string,
        startTime: form.get("startTime") ? new Date(form.get("startTime") as string).toISOString() : undefined,
        endTime: form.get("endTime") ? new Date(form.get("endTime") as string).toISOString() : undefined,
        isAllDay: form.get("isAllDay") === "true",
        isRecurring: false,
        tags: [],
      };
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.error) throw new Error(typeof d.error === "string" ? d.error : "Failed");
      return d.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      setShowCreateDialog(false);
      toast({ title: "Item created", variant: "success" });
    },
    onError: (e) => toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => fetch(`/api/planner/items?id=${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      setSelectedEvent(null);
      toast({ title: "Deleted" });
    },
  });

  const doneMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/planner/items?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      setSelectedEvent((prev) => prev ? { ...prev, status: "done" } : null);
    },
  });

  const navigate = (dir: 1 | -1) => {
    if (view === "month") setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else if (view === "week") setCurrentDate(dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else if (view === "day") setCurrentDate(dir > 0 ? addDays(currentDate, 1) : subDays(currentDate, 1));
  };

  const headerLabel = () => {
    if (view === "month") return format(currentDate, "MMMM yyyy");
    if (view === "day") return format(currentDate, "EEEE, MMMM d, yyyy");
    return `${format(startOfWeek(currentDate), "MMM d")} – ${format(endOfWeek(currentDate), "MMM d, yyyy")}`;
  };

  // Build unified time events
  const toTimeEvents = (days: Date[]): TimeEvent[] => {
    const events: TimeEvent[] = [];
    for (const item of plannerItems) {
      if (!item.startTime) continue;
      const start = new Date(item.startTime);
      const end = item.endTime ? new Date(item.endTime) : new Date(start.getTime() + 60 * 60 * 1000);
      if (!days.some((d) => isSameDay(d, start))) continue;
      const s = getStyle(item.type);
      events.push({
        id: item.id, title: item.title,
        description: item.description,
        startTime: start, endTime: end,
        type: item.type, priority: item.priority,
        tags: parseJsonArray<string>(item.tags),
        color: s.color, textColor: s.textColor, bgLight: s.bgLight,
        source: "planner", isAllDay: item.isAllDay, status: item.status,
        rawItem: item,
      });
    }
    for (const ge of googleEvents) {
      const start = new Date(ge.startTime);
      const end = ge.endTime ? new Date(ge.endTime) : new Date(start.getTime() + 60 * 60 * 1000);
      if (!days.some((d) => isSameDay(d, start))) continue;
      const s = getStyle("google");
      events.push({
        id: ge.id, title: ge.title,
        description: ge.description ?? null,
        startTime: start, endTime: end,
        type: "google", location: ge.location,
        color: s.color, textColor: s.textColor, bgLight: s.bgLight,
        source: "google", isAllDay: ge.isAllDay,
      });
    }
    return events;
  };

  const openCreate = (time?: Date) => {
    setCreateAtTime(time);
    setShowCreateDialog(true);
  };

  const sharedProps = {
    onEventClick: setSelectedEvent,
    onClickSlot: openCreate,
    onDone: (id: string) => doneMut.mutate(id),
    onDelete: (id: string) => deleteMut.mutate(id),
  };

  const weekDays = eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) });

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Main calendar area ── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b px-4 py-2 shrink-0 gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs px-3"
              onClick={() => setCurrentDate(new Date())}
            >
              Today
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-3 text-sm font-semibold hidden sm:block">{headerLabel()}</span>
          </div>

          <div className="flex items-center gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
              <TabsList className="h-8">
                <TabsTrigger value="day"   className="text-xs px-3">Day</TabsTrigger>
                <TabsTrigger value="week"  className="text-xs px-3">Week</TabsTrigger>
                <TabsTrigger value="month" className="text-xs px-3">Month</TabsTrigger>
                <TabsTrigger value="list"  className="text-xs px-3">List</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => openCreate()}>
              <Plus className="h-3.5 w-3.5" /> New
            </Button>
          </div>
        </div>

        {/* Mobile date label */}
        <div className="sm:hidden px-4 py-1 text-sm font-medium text-muted-foreground border-b">
          {headerLabel()}
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            {view === "week" && (
              <WeekTimeGrid
                days={weekDays}
                events={toTimeEvents(weekDays)}
                gridRef={gridRef}
                {...sharedProps}
              />
            )}
            {view === "day" && (
              <DayTimeGrid
                currentDate={currentDate}
                events={toTimeEvents([currentDate])}
                gridRef={gridRef}
                {...sharedProps}
              />
            )}
            {view === "month" && (
              <MonthView
                currentDate={currentDate}
                onDayClick={(d) => { setCurrentDate(d); setView("day"); }}
                onEventClick={setSelectedEvent}
                toTimeEvents={toTimeEvents}
              />
            )}
            {view === "list" && (
              <ListView
                plannerItems={plannerItems}
                googleEvents={googleEvents}
                onEventClick={setSelectedEvent}
                toTimeEvents={toTimeEvents}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Event detail panel ── */}
      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDone={() => doneMut.mutate(selectedEvent.id)}
          onDelete={() => deleteMut.mutate(selectedEvent.id)}
          onEdit={() => {
            const ev = selectedEvent;
            setSelectedEvent(null);
            if (ev) {
              setCreateAtTime(ev.startTime);
              setShowCreateDialog(true);
            }
          }}
        />
      )}

      {/* Dialogs */}
      <CreateItemDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSubmit={(form) => createMut.mutate(form)}
        loading={createMut.isPending}
        defaultDateTime={createAtTime}
      />
    </div>
  );
}

// ─── Event Detail Panel ───────────────────────────────────────────────────────

function EventDetailPanel({
  event, onClose, onDone, onDelete, onEdit,
}: {
  event: TimeEvent;
  onClose: () => void;
  onDone: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const style = getStyle(event.type);
  const duration = differenceInMinutes(event.endTime, event.startTime);
  const durationLabel =
    duration < 60
      ? `${duration} min`
      : duration % 60 === 0
      ? `${duration / 60} hr`
      : `${Math.floor(duration / 60)} hr ${duration % 60} min`;

  const isDone = event.status === "done";

  return (
    <div className="w-80 shrink-0 border-l bg-background flex flex-col h-full animate-in slide-in-from-right-4 duration-200">
      {/* Header strip */}
      <div className={`h-2 w-full ${style.color.split(" ")[0]}`} />

      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xl shrink-0">{style.icon}</span>
          <div className="min-w-0">
            <p className={cn("font-semibold text-base leading-tight", isDone && "line-through text-muted-foreground")}>
              {event.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{style.label}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Time */}
          <div className="flex items-start gap-3">
            <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">
                {event.isAllDay
                  ? format(event.startTime, "EEEE, MMMM d")
                  : `${format(event.startTime, "EEEE, MMMM d")}`}
              </p>
              {!event.isAllDay && (
                <p className="text-sm text-muted-foreground">
                  {format(event.startTime, "h:mm a")} – {format(event.endTime, "h:mm a")}
                  <span className="ml-2 text-xs opacity-70">({durationLabel})</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {isToday(event.startTime)
                  ? "Today"
                  : formatDistance(event.startTime, new Date(), { addSuffix: true })}
              </p>
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm">{event.location}</p>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="flex items-start gap-3">
              <AlignLeft className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {event.description}
              </p>
            </div>
          )}

          {/* Priority */}
          {event.priority && event.priority !== "normal" && (
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 shrink-0 flex items-center justify-center">
                <span className="text-xs">{event.priority === "high" ? "🔴" : "⚪"}</span>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs capitalize",
                  event.priority === "high" && "border-red-200 text-red-700 bg-red-50"
                )}
              >
                {event.priority} priority
              </Badge>
            </div>
          )}

          {/* Tags */}
          {event.tags && event.tags.length > 0 && (
            <div className="flex items-start gap-3">
              <Tag className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex flex-wrap gap-1">
                {event.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Status */}
          {event.status && (
            <div className="flex items-center gap-3">
              <CheckSquare className={cn("h-4 w-4 shrink-0", isDone ? "text-emerald-500" : "text-muted-foreground")} />
              <span className={cn("text-sm capitalize", isDone ? "text-emerald-600 font-medium" : "text-muted-foreground")}>
                {event.status}
              </span>
            </div>
          )}

          {/* Source */}
          <div className="flex items-center gap-3 pt-1">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">
              {event.source === "google" ? "Google Calendar" : "My Planner"}
            </span>
          </div>
        </div>
      </ScrollArea>

      {/* Action buttons */}
      {event.source === "planner" && (
        <>
          <Separator />
          <div className="p-4 space-y-2">
            {!isDone && (
              <Button className="w-full gap-2" size="sm" onClick={onDone}>
                <CheckSquare className="h-4 w-4" />
                Mark as Done
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Time grid helpers ────────────────────────────────────────────────────────

function timeToY(date: Date): number {
  return (date.getHours() - START_HOUR) * HOUR_HEIGHT + (date.getMinutes() / 60) * HOUR_HEIGHT;
}

function eventHeight(start: Date, end: Date): number {
  return Math.max((differenceInMinutes(end, start) / 60) * HOUR_HEIGHT, 24);
}

function resolveOverlaps(events: TimeEvent[]) {
  const sorted = [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const result: { event: TimeEvent; col: number; totalCols: number }[] = [];
  const columns: Date[] = [];

  for (const event of sorted) {
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      if (event.startTime >= columns[col]) {
        columns[col] = event.endTime;
        result.push({ event, col, totalCols: 1 });
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push(event.endTime);
      result.push({ event, col: columns.length - 1, totalCols: 1 });
    }
  }

  for (let i = 0; i < result.length; i++) {
    let maxCol = result[i].col;
    for (let j = 0; j < result.length; j++) {
      if (i === j) continue;
      if (result[i].event.startTime < result[j].event.endTime &&
          result[i].event.endTime > result[j].event.startTime) {
        maxCol = Math.max(maxCol, result[j].col);
      }
    }
    result[i].totalCols = maxCol + 1;
  }
  return result;
}

// ─── Time labels column ───────────────────────────────────────────────────────

function TimeLabels() {
  return (
    <div className="w-14 shrink-0 relative select-none" style={{ height: HOURS.length * HOUR_HEIGHT }}>
      {HOURS.map((h) => (
        <div
          key={h}
          className="absolute right-2 text-[10px] text-muted-foreground leading-none"
          style={{ top: (h - START_HOUR) * HOUR_HEIGHT - 6 }}
        >
          {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
        </div>
      ))}
    </div>
  );
}

// ─── Single day column ────────────────────────────────────────────────────────

function DayColumn({
  day, events, onEventClick, onClickSlot, wide,
}: {
  day: Date;
  events: TimeEvent[];
  onEventClick: (e: TimeEvent) => void;
  onClickSlot: (t: Date) => void;
  wide?: boolean;
}) {
  const now = new Date();
  const showNow = isToday(day);
  const nowY = showNow ? timeToY(now) : null;
  const positioned = resolveOverlaps(events);

  function handleColumnClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-event]")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const totalMins = (y / HOUR_HEIGHT) * 60;
    const hour = Math.floor(totalMins / 60) + START_HOUR;
    const minute = Math.round((totalMins % 60) / 15) * 15;
    onClickSlot(setMinutes(setHours(startOfDay(day), hour), Math.min(minute, 59)));
  }

  return (
    <div
      className={cn(
        "relative border-l flex-1 cursor-crosshair",
        isToday(day) && "bg-blue-50/20",
        wide && "flex-1"
      )}
      style={{ height: HOURS.length * HOUR_HEIGHT }}
      onClick={handleColumnClick}
    >
      {/* Grid lines */}
      {HOURS.map((h) => (
        <div key={h} className="absolute w-full border-t border-border/40" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }} />
      ))}
      {HOURS.map((h) => (
        <div key={`${h}h`} className="absolute w-full border-t border-border/15 border-dashed" style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
      ))}

      {/* Now indicator */}
      {showNow && nowY !== null && nowY >= 0 && (
        <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center" style={{ top: nowY - 1 }}>
          <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-1.5 shrink-0 shadow-sm" />
          <div className="flex-1 h-[2px] bg-red-500 shadow-sm" />
        </div>
      )}

      {/* Events */}
      {positioned.map(({ event, col, totalCols }) => {
        const top = timeToY(event.startTime);
        const height = eventHeight(event.startTime, event.endTime);
        const colW = 100 / totalCols;
        const left = col * colW;
        const width = colW - 1.5;
        const isShort = height < 36;
        const isDone = event.status === "done";

        return (
          <div
            key={event.id}
            data-event="true"
            role="button"
            tabIndex={0}
            className={cn(
              "absolute rounded-md overflow-hidden border-l-4 shadow-sm z-10 cursor-pointer",
              "hover:shadow-lg hover:z-30 transition-all duration-100 active:scale-[0.98]",
              event.color,
              isDone && "opacity-50"
            )}
            style={{ top: top + 1, height: height - 2, left: `${left}%`, width: `${width}%` }}
            onClick={() => onEventClick(event)}
            onKeyDown={(e) => e.key === "Enter" && onEventClick(event)}
          >
            <div className="px-1.5 py-1 h-full flex flex-col bg-black/5">
              <p className={cn(
                "font-semibold leading-tight text-white truncate",
                isShort ? "text-[9px]" : "text-[10px]"
              )}>
                {event.title}
              </p>
              {!isShort && height >= 48 && (
                <p className="text-[9px] text-white/80 mt-0.5 truncate">
                  {format(event.startTime, "h:mm")}–{format(event.endTime, "h:mm a")}
                </p>
              )}
              {!isShort && event.location && height >= 64 && (
                <p className="text-[9px] text-white/70 truncate flex items-center gap-0.5 mt-0.5">
                  <MapPin className="h-2.5 w-2.5 shrink-0" />{event.location}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── All-day row ──────────────────────────────────────────────────────────────

function AllDayRow({ days, events, onEventClick }: {
  days: Date[];
  events: TimeEvent[];
  onEventClick: (e: TimeEvent) => void;
}) {
  const allDay = events.filter((e) => e.isAllDay);
  if (allDay.length === 0) return null;

  return (
    <div className="flex border-b bg-muted/20 shrink-0">
      <div className="w-14 shrink-0 flex items-center justify-end pr-2">
        <span className="text-[9px] text-muted-foreground">All day</span>
      </div>
      {days.map((day) => {
        const dayEvents = allDay.filter((e) => isSameDay(e.startTime, day));
        return (
          <div key={day.toISOString()} className="flex-1 border-l px-0.5 py-0.5 space-y-0.5 min-h-6">
            {dayEvents.map((e) => {
              const s = getStyle(e.type);
              return (
                <button
                  key={e.id}
                  onClick={() => onEventClick(e)}
                  className={cn("w-full rounded px-1.5 py-0.5 text-[9px] font-medium text-white truncate text-left", s.color.split(" ")[0])}
                >
                  {e.title}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Day header row ───────────────────────────────────────────────────────────

function DayHeaders({ days, onDayClick }: { days: Date[]; onDayClick?: (d: Date) => void }) {
  return (
    <div className="flex border-b shrink-0">
      <div className="w-14 shrink-0" />
      {days.map((day) => (
        <button
          key={day.toISOString()}
          onClick={() => onDayClick?.(day)}
          className={cn(
            "flex-1 text-center py-2 border-l transition-colors",
            isToday(day) ? "bg-blue-50" : "hover:bg-accent",
            onDayClick && "cursor-pointer"
          )}
        >
          <div className={cn("text-[11px] font-medium uppercase tracking-wide", isToday(day) ? "text-blue-600" : "text-muted-foreground")}>
            {format(day, "EEE")}
          </div>
          <div className={cn(
            "mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold",
            isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"
          )}>
            {format(day, "d")}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Week Time Grid ───────────────────────────────────────────────────────────

function WeekTimeGrid({ days, events, gridRef, onEventClick, onClickSlot }: {
  days: Date[];
  events: TimeEvent[];
  gridRef: React.RefObject<HTMLDivElement | null>;
  onEventClick: (e: TimeEvent) => void;
  onClickSlot: (t: Date) => void;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DayHeaders days={days} />
      <AllDayRow days={days} events={events} onEventClick={onEventClick} />
      <div className="flex-1 overflow-y-auto" ref={gridRef}>
        <div className="flex" style={{ height: HOURS.length * HOUR_HEIGHT }}>
          <TimeLabels />
          {days.map((day) => (
            <DayColumn
              key={day.toISOString()}
              day={day}
              events={events.filter((e) => !e.isAllDay && isSameDay(e.startTime, day))}
              onEventClick={onEventClick}
              onClickSlot={onClickSlot}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Day Time Grid ────────────────────────────────────────────────────────────

function DayTimeGrid({ currentDate, events, gridRef, onEventClick, onClickSlot }: {
  currentDate: Date;
  events: TimeEvent[];
  gridRef: React.RefObject<HTMLDivElement | null>;
  onEventClick: (e: TimeEvent) => void;
  onClickSlot: (t: Date) => void;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DayHeaders days={[currentDate]} />
      <AllDayRow days={[currentDate]} events={events} onEventClick={onEventClick} />
      <div className="flex-1 overflow-y-auto" ref={gridRef}>
        <div className="flex" style={{ height: HOURS.length * HOUR_HEIGHT }}>
          <TimeLabels />
          <DayColumn
            day={currentDate}
            events={events.filter((e) => !e.isAllDay)}
            onEventClick={onEventClick}
            onClickSlot={onClickSlot}
            wide
          />
        </div>
      </div>
    </div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({ currentDate, onDayClick, onEventClick, toTimeEvents }: {
  currentDate: Date;
  onDayClick: (d: Date) => void;
  onEventClick: (e: TimeEvent) => void;
  toTimeEvents: (days: Date[]) => TimeEvent[];
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate)),
    end: endOfWeek(endOfMonth(currentDate)),
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Day names header */}
      <div className="grid grid-cols-7 border-b bg-muted/30 shrink-0">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-2 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 flex-1" style={{ gridAutoRows: "minmax(100px, 1fr)" }}>
        {days.map((day) => {
          const dayEvents = toTimeEvents([day]);
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          const visible = dayEvents.slice(0, 3);
          const extra = dayEvents.length - 3;

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "border-b border-r p-1 min-h-24 flex flex-col",
                !isCurrentMonth && "bg-muted/20",
                isToday(day) && "bg-blue-50/40"
              )}
            >
              <button
                onClick={() => onDayClick(day)}
                className={cn(
                  "self-start flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold mb-1 hover:bg-accent transition-colors",
                  isToday(day) ? "bg-primary text-primary-foreground" : !isCurrentMonth ? "text-muted-foreground/50" : "text-foreground"
                )}
              >
                {format(day, "d")}
              </button>

              <div className="space-y-0.5 flex-1">
                {visible.map((e) => {
                  const s = getStyle(e.type);
                  return (
                    <button
                      key={e.id}
                      onClick={() => onEventClick(e)}
                      className={cn(
                        "w-full rounded px-1.5 py-0.5 text-[10px] font-medium text-white truncate text-left transition-opacity hover:opacity-80",
                        s.color.split(" ")[0]
                      )}
                    >
                      {!e.isAllDay && (
                        <span className="opacity-80 mr-1">{format(e.startTime, "h:mm")}</span>
                      )}
                      {e.title}
                    </button>
                  );
                })}
                {extra > 0 && (
                  <button
                    onClick={() => onDayClick(day)}
                    className="w-full text-left text-[10px] text-muted-foreground hover:text-foreground px-1.5 flex items-center gap-0.5"
                  >
                    <ChevronRight className="h-2.5 w-2.5" />
                    {extra} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ plannerItems, googleEvents, onEventClick, toTimeEvents }: {
  plannerItems: PlannerItem[];
  googleEvents: GoogleEvent[];
  onEventClick: (e: TimeEvent) => void;
  toTimeEvents: (days: Date[]) => TimeEvent[];
}) {
  // Gather all days that have events
  const allEvents: TimeEvent[] = [];
  for (const item of plannerItems) {
    if (item.startTime) {
      const d = [new Date(item.startTime)];
      allEvents.push(...toTimeEvents(d).filter((e) => e.id === item.id));
    }
  }
  for (const ge of googleEvents) {
    const d = [new Date(ge.startTime)];
    allEvents.push(...toTimeEvents(d).filter((e) => e.id === ge.id));
  }

  const sorted = allEvents.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // Group by date
  const byDate = new Map<string, TimeEvent[]>();
  for (const e of sorted) {
    const key = format(e.startTime, "yyyy-MM-dd");
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(e);
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 max-w-2xl mx-auto space-y-6">
        {byDate.size === 0 && (
          <p className="text-sm text-muted-foreground text-center py-16">No upcoming items.</p>
        )}
        {Array.from(byDate.entries()).map(([dateKey, events]) => {
          const date = new Date(dateKey);
          return (
            <div key={dateKey}>
              <div className="flex items-center gap-3 mb-3">
                <div className={cn(
                  "flex flex-col items-center justify-center h-10 w-10 rounded-xl border-2 shrink-0",
                  isToday(date) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                )}>
                  <span className="text-[10px] font-medium leading-none">{format(date, "EEE").toUpperCase()}</span>
                  <span className="text-sm font-bold leading-none mt-0.5">{format(date, "d")}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold">{format(date, "MMMM d, yyyy")}</p>
                  <p className="text-xs text-muted-foreground">
                    {isToday(date) ? "Today" : formatDistance(date, new Date(), { addSuffix: true })}
                    {" · "}{events.length} {events.length === 1 ? "item" : "items"}
                  </p>
                </div>
              </div>

              <div className="ml-13 space-y-2 pl-1 border-l-2 border-border ml-5">
                {events.map((e) => {
                  const s = getStyle(e.type);
                  const isDone = e.status === "done";
                  return (
                    <button
                      key={e.id}
                      onClick={() => onEventClick(e)}
                      className={cn(
                        "w-full text-left rounded-xl border p-3 hover:shadow-md transition-all duration-150 hover:-translate-y-0.5 group",
                        s.bgLight,
                        isDone && "opacity-50"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-base shrink-0 mt-0.5">{s.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn("text-sm font-semibold", isDone && "line-through text-muted-foreground")}>
                              {e.title}
                            </p>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                            {!e.isAllDay && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(e.startTime, "h:mm a")} – {format(e.endTime, "h:mm a")}
                              </span>
                            )}
                            {e.location && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />{e.location}
                              </span>
                            )}
                          </div>

                          {e.description && (
                            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                              {e.description}
                            </p>
                          )}

                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5">{s.label}</Badge>
                            {e.priority === "high" && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-red-200 text-red-700 bg-red-50">high priority</Badge>
                            )}
                            {e.tags?.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-[10px] h-4 px-1.5">{tag}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ─── Create item dialog ───────────────────────────────────────────────────────

function CreateItemDialog({ open, onClose, onSubmit, loading, defaultDateTime }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
  loading: boolean;
  defaultDateTime?: Date;
}) {
  const [isAllDay, setIsAllDay] = useState(false);

  const fmt = (d?: Date) => d ? format(d, "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm");
  const fmtEnd = (d?: Date) => format(new Date((d ?? new Date()).getTime() + 3600000), "yyyy-MM-dd'T'HH:mm");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Planning Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); f.set("isAllDay", isAllDay ? "true" : "false"); onSubmit(f); }} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" name="title" required placeholder="What do you need to do?" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select name="type" defaultValue="task">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_STYLE).filter(([k]) => k !== "google").map(([k, s]) => (
                    <SelectItem key={k} value={k}>{s.icon} {s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select name="priority" defaultValue="normal">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">🔴 High</SelectItem>
                  <SelectItem value="normal">🔵 Normal</SelectItem>
                  <SelectItem value="low">⚪ Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="isAllDay" checked={isAllDay} onCheckedChange={setIsAllDay} />
            <Label htmlFor="isAllDay">All day</Label>
          </div>

          {!isAllDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input type="datetime-local" name="startTime" defaultValue={fmt(defaultDateTime)} className="text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input type="datetime-local" name="endTime" defaultValue={fmtEnd(defaultDateTime)} className="text-xs" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea name="description" placeholder="Optional description…" rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
