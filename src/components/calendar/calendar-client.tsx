"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay,
  startOfMonth, endOfMonth, isToday, addMonths, subMonths, addWeeks, subWeeks
} from "date-fns";
import {
  Plus, ChevronLeft, ChevronRight, Calendar, CheckSquare,
  Loader2, Trash2
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
import { useToast } from "@/hooks/use-toast";
import { cn, parseJsonArray } from "@/lib/utils";
import type { PlannerItem } from "@prisma/client";

interface GoogleEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  isAllDay: boolean;
}

interface CalendarData {
  data: {
    plannerItems: PlannerItem[];
    googleEvents: GoogleEvent[];
  };
}

const itemTypeColors: Record<string, string> = {
  event: "bg-blue-500",
  task: "bg-green-500",
  reminder: "bg-purple-500",
  deadline: "bg-red-500",
  block: "bg-amber-500",
};

export function CalendarClient() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<"month" | "week" | "list">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const { data, isLoading } = useQuery<CalendarData>({
    queryKey: ["calendar-events"],
    queryFn: async () => {
      const res = await fetch("/api/calendar/events?days=60");
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
      toast({ title: "Deleted", variant: "success" });
    },
  });

  const doneMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/planner/items?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar-events"] }),
  });

  // Items for selected day / all upcoming
  const itemsForDay = (date: Date) => {
    const plannerForDay = plannerItems.filter(
      (item) => item.startTime && isSameDay(new Date(item.startTime), date)
    );
    const googleForDay = googleEvents.filter(
      (e) => isSameDay(new Date(e.startTime), date)
    );
    return { plannerForDay, googleForDay };
  };

  const navigate = (dir: 1 | -1) => {
    if (view === "month") setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else setCurrentDate(dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold w-36 text-center">
            {view === "month"
              ? format(currentDate, "MMMM yyyy")
              : `${format(startOfWeek(currentDate), "MMM d")} – ${format(endOfWeek(currentDate), "MMM d")}`}
          </h2>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList className="h-8">
              <TabsTrigger value="month" className="text-xs px-3">Month</TabsTrigger>
              <TabsTrigger value="week" className="text-xs px-3">Week</TabsTrigger>
              <TabsTrigger value="list" className="text-xs px-3">List</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ScrollArea className="flex-1">
          {view === "month" && (
            <MonthView
              currentDate={currentDate}
              plannerItems={plannerItems}
              googleEvents={googleEvents}
              onDayClick={(d) => setSelectedDay(d)}
              selectedDay={selectedDay}
            />
          )}
          {view === "week" && (
            <WeekView
              currentDate={currentDate}
              plannerItems={plannerItems}
              googleEvents={googleEvents}
            />
          )}
          {view === "list" && (
            <ListView
              plannerItems={plannerItems}
              googleEvents={googleEvents}
              onDone={(id) => doneMut.mutate(id)}
              onDelete={(id) => deleteMut.mutate(id)}
            />
          )}
        </ScrollArea>
      )}

      {/* Day detail sidebar for month view */}
      {selectedDay && view === "month" && (
        <div className="border-t bg-muted/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">{format(selectedDay, "EEEE, MMMM d")}</h3>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedDay(null)}>
              Close
            </Button>
          </div>
          <DayDetail
            day={selectedDay}
            {...itemsForDay(selectedDay)}
            onDone={(id) => doneMut.mutate(id)}
            onDelete={(id) => deleteMut.mutate(id)}
          />
        </div>
      )}

      {/* Create dialog */}
      <CreateItemDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSubmit={(form) => createMut.mutate(form)}
        loading={createMut.isPending}
        defaultDate={selectedDay ?? undefined}
      />
    </div>
  );
}

// ─── Month View ──────────────────────────────────────────────────────────────

function MonthView({
  currentDate,
  plannerItems,
  googleEvents,
  onDayClick,
  selectedDay,
}: {
  currentDate: Date;
  plannerItems: PlannerItem[];
  googleEvents: GoogleEvent[];
  onDayClick: (d: Date) => void;
  selectedDay: Date | null;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="p-4">
      <div className="grid grid-cols-7 mb-1">
        {dayNames.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {days.map((day) => {
          const hasItems = plannerItems.some(
            (i) => i.startTime && isSameDay(new Date(i.startTime), day)
          );
          const hasGoogle = googleEvents.some((e) => isSameDay(new Date(e.startTime), day));
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          const isSelected = selectedDay && isSameDay(day, selectedDay);

          return (
            <button
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={cn(
                "bg-background min-h-16 p-1.5 text-left hover:bg-accent transition-colors",
                !isCurrentMonth && "opacity-40",
                isSelected && "ring-2 ring-inset ring-primary",
                isToday(day) && "bg-blue-50"
              )}
            >
              <span
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                  isToday(day) && "bg-primary text-primary-foreground"
                )}
              >
                {format(day, "d")}
              </span>
              <div className="mt-1 space-y-0.5">
                {hasGoogle && (
                  <div className="h-1 w-full rounded bg-blue-400" title="Google Calendar event" />
                )}
                {hasItems && (
                  <div className="h-1 w-full rounded bg-green-400" title="Planner item" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({
  currentDate,
  plannerItems,
  googleEvents,
}: {
  currentDate: Date;
  plannerItems: PlannerItem[];
  googleEvents: GoogleEvent[];
}) {
  const weekStart = startOfWeek(currentDate);
  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(currentDate) });

  return (
    <div className="p-4">
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const plannerForDay = plannerItems.filter(
            (i) => i.startTime && isSameDay(new Date(i.startTime), day)
          );
          const googleForDay = googleEvents.filter((e) => isSameDay(new Date(e.startTime), day));

          return (
            <div key={day.toISOString()} className="min-h-32">
              <div
                className={cn(
                  "text-center py-1.5 mb-1 rounded-lg text-xs font-medium",
                  isToday(day) ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}
              >
                <div>{format(day, "EEE")}</div>
                <div className="text-base font-bold">{format(day, "d")}</div>
              </div>
              <div className="space-y-1">
                {googleForDay.map((e) => (
                  <div key={e.id} className="rounded px-1.5 py-1 bg-blue-100 text-blue-800 text-[10px] truncate">
                    {e.title}
                  </div>
                ))}
                {plannerForDay.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded px-1.5 py-1 text-white text-[10px] truncate ${itemTypeColors[item.type] ?? "bg-slate-500"}`}
                  >
                    {item.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({
  plannerItems,
  googleEvents,
  onDone,
  onDelete,
}: {
  plannerItems: PlannerItem[];
  googleEvents: GoogleEvent[];
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const upcoming = plannerItems
    .filter((i) => i.status === "pending")
    .sort((a, b) => {
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

  return (
    <div className="p-4 space-y-6">
      {/* Google events section */}
      {googleEvents.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-blue-500" /> Google Calendar
          </h3>
          <div className="space-y-2">
            {googleEvents.slice(0, 10).map((e) => (
              <div key={e.id} className="flex items-start gap-3 rounded-lg border p-3">
                <div className="h-2 w-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{e.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(e.startTime), "EEE, MMM d · h:mm a")}
                    {e.location && ` · ${e.location}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Planner items */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <CheckSquare className="h-3.5 w-3.5 text-green-500" /> My Plans
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming items.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((item) => (
              <div key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
                <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${itemTypeColors[item.type] ?? "bg-slate-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">{item.type}</Badge>
                  </div>
                  {item.startTime && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(item.startTime), "EEE, MMM d · h:mm a")}
                    </p>
                  )}
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
                  )}
                  {parseJsonArray<string>(item.tags).length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {parseJsonArray<string>(item.tags).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px] h-4 px-1.5">{tag}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Mark done"
                    onClick={() => onDone(item.id)}
                  >
                    <CheckSquare className="h-3.5 w-3.5 text-green-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Delete"
                    onClick={() => onDelete(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Day detail ───────────────────────────────────────────────────────────────

function DayDetail({
  day: _day,
  plannerForDay,
  googleForDay,
  onDone,
  onDelete: _onDelete,
}: {
  day: Date;
  plannerForDay: PlannerItem[];
  googleForDay: GoogleEvent[];
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (plannerForDay.length === 0 && googleForDay.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing scheduled.</p>;
  }

  return (
    <div className="space-y-2 max-h-40 overflow-y-auto">
      {googleForDay.map((e) => (
        <div key={e.id} className="flex items-center gap-2 text-sm">
          <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
          <span>{e.title}</span>
          {e.startTime && <span className="text-xs text-muted-foreground">{format(new Date(e.startTime), "h:mm a")}</span>}
        </div>
      ))}
      {plannerForDay.map((item) => (
        <div key={item.id} className="flex items-center gap-2 text-sm">
          <div className={`h-2 w-2 rounded-full shrink-0 ${itemTypeColors[item.type] ?? "bg-slate-400"}`} />
          <span className="flex-1 truncate">{item.title}</span>
          {item.startTime && <span className="text-xs text-muted-foreground">{format(new Date(item.startTime), "h:mm a")}</span>}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDone(item.id)}>
            <CheckSquare className="h-3 w-3 text-green-600" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// ─── Create item dialog ───────────────────────────────────────────────────────

function CreateItemDialog({
  open,
  onClose,
  onSubmit,
  loading,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
  loading: boolean;
  defaultDate?: Date;
}) {
  const [isAllDay, setIsAllDay] = useState(false);

  const defaultDateStr = defaultDate
    ? `${format(defaultDate, "yyyy-MM-dd")}T09:00`
    : `${format(new Date(), "yyyy-MM-dd")}T09:00`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Planning Item</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            form.set("isAllDay", isAllDay ? "true" : "false");
            onSubmit(form);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" name="title" required placeholder="What do you need to do?" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <Select name="type" defaultValue="task">
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="reminder">Reminder</SelectItem>
                  <SelectItem value="deadline">Deadline</SelectItem>
                  <SelectItem value="block">Work Block</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <Select name="priority" defaultValue="normal">
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
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
                <Label htmlFor="startTime">Start</Label>
                <Input
                  type="datetime-local"
                  id="startTime"
                  name="startTime"
                  defaultValue={defaultDateStr}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endTime">End</Label>
                <Input
                  type="datetime-local"
                  id="endTime"
                  name="endTime"
                  className="text-xs"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="description">Notes</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Optional notes…"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
