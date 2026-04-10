"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { signIn } from "next-auth/react";
import {
  CheckCircle, XCircle, Globe, Mail, Calendar, Bell,
  Cpu, Shield, Loader2, Save
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import type { Settings } from "@prisma/client";

interface SettingsClientProps {
  initialSettings: Settings | null;
  profile: {
    email: string;
    name: string | null;
    avatarUrl: string | null;
    googleTokenExpiry: Date | null;
  } | null;
  accessTokenValid: boolean;
}

type SettingsState = {
  aiProvider: string;
  defaultReplyStyle: string;
  autoProcessEmails: boolean;
  autoSendReplies: boolean;
  autoCreateEvents: boolean;
  notifyNewEmails: boolean;
  notifyDrafts: boolean;
  notifyMeetings: boolean;
  notifyDeadlines: boolean;
  notifyReminders: boolean;
  gmailSyncEnabled: boolean;
  calendarSyncEnabled: boolean;
};

export function SettingsClient({ initialSettings, profile, accessTokenValid }: SettingsClientProps) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsState>({
    aiProvider: initialSettings?.aiProvider ?? "mock",
    defaultReplyStyle: initialSettings?.defaultReplyStyle ?? "normal",
    autoProcessEmails: initialSettings?.autoProcessEmails ?? true,
    autoSendReplies: initialSettings?.autoSendReplies ?? false,
    autoCreateEvents: initialSettings?.autoCreateEvents ?? false,
    notifyNewEmails: initialSettings?.notifyNewEmails ?? true,
    notifyDrafts: initialSettings?.notifyDrafts ?? true,
    notifyMeetings: initialSettings?.notifyMeetings ?? true,
    notifyDeadlines: initialSettings?.notifyDeadlines ?? true,
    notifyReminders: initialSettings?.notifyReminders ?? true,
    gmailSyncEnabled: initialSettings?.gmailSyncEnabled ?? true,
    calendarSyncEnabled: initialSettings?.calendarSyncEnabled ?? true,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : "Save failed");
    },
    onSuccess: () => toast({ title: "Settings saved", variant: "success" }),
    onError: (e) => toast({ title: "Failed to save", description: (e as Error).message, variant: "destructive" }),
  });

  const testPushMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/push/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "new_email",
          title: "Test notification",
          body: "Push notifications are working!",
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    },
    onSuccess: () => toast({ title: "Test notification sent", variant: "success" }),
    onError: (e) => toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
  });

  function setSetting<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <ScrollArea className="flex-1">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" /> Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{profile?.name ?? "My Account"}</p>
                <p className="text-xs text-muted-foreground">{profile?.email}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {accessTokenValid ? (
                  <Badge variant="secondary" className="gap-1 text-emerald-700 bg-emerald-50 border-emerald-200">
                    <CheckCircle className="h-3 w-3" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1 text-red-700 bg-red-50 border-red-200">
                    <XCircle className="h-3 w-3" /> Token expired
                  </Badge>
                )}
              </div>
            </div>
            {!accessTokenValid && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => signIn("google", { callbackUrl: "/settings" })}
              >
                Re-authenticate with Google
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Gmail integration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" /> Gmail Integration
            </CardTitle>
            <CardDescription>Control email syncing behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingRow
              label="Enable Gmail sync"
              description="Sync your inbox messages automatically"
              checked={settings.gmailSyncEnabled}
              onChange={(v) => setSetting("gmailSyncEnabled", v)}
            />
            <SettingRow
              label="Auto-process new emails with AI"
              description="Classify and extract info from new emails automatically"
              checked={settings.autoProcessEmails}
              onChange={(v) => setSetting("autoProcessEmails", v)}
            />
            <Separator />
            <SettingRow
              label="Auto-send approved replies"
              description="When on, approving a reply in the Review queue sends it through your Gmail (real synced threads only). You can also send once per reply with “Send via Gmail” on the card."
              checked={settings.autoSendReplies}
              onChange={(v) => setSetting("autoSendReplies", v)}
              danger
            />
          </CardContent>
        </Card>

        {/* Calendar integration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Google Calendar
            </CardTitle>
            <CardDescription>Control calendar event creation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingRow
              label="Enable Google Calendar sync"
              description="Show your Google Calendar events in the app"
              checked={settings.calendarSyncEnabled}
              onChange={(v) => setSetting("calendarSyncEnabled", v)}
            />
            <Separator />
            <SettingRow
              label="Auto-create approved calendar events"
              description="⚠️ Events are created in Google Calendar when approved"
              checked={settings.autoCreateEvents}
              onChange={(v) => setSetting("autoCreateEvents", v)}
              danger
            />
          </CardContent>
        </Card>

        {/* AI behavior */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="h-4 w-4" /> AI Behavior
            </CardTitle>
            <CardDescription>Configure how AI suggestions are generated</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>AI Provider</Label>
                <Select
                  value={settings.aiProvider}
                  onValueChange={(v) => setSetting("aiProvider", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mock">Mock (development)</SelectItem>
                    <SelectItem value="openai">OpenAI (GPT-4o mini)</SelectItem>
                    <SelectItem value="anthropic">Anthropic (coming soon)</SelectItem>
                  </SelectContent>
                </Select>
                {settings.aiProvider === "openai" && (
                  <p className="text-xs text-muted-foreground">Requires OPENAI_API_KEY in .env</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Default reply style</Label>
                <Select
                  value={settings.defaultReplyStyle}
                  onValueChange={(v) => setSetting("defaultReplyStyle", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concise">Concise</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" /> Notifications
            </CardTitle>
            <CardDescription>Configure which events trigger push notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: "notifyNewEmails" as const, label: "Important new emails", desc: "High-priority emails that need your attention" },
              { key: "notifyDrafts" as const, label: "Reply drafts ready", desc: "When an AI reply draft is ready for review" },
              { key: "notifyMeetings" as const, label: "Meetings detected", desc: "When a meeting is found in an email" },
              { key: "notifyDeadlines" as const, label: "Deadlines detected", desc: "When a deadline is extracted from an email" },
              { key: "notifyReminders" as const, label: "Upcoming reminders", desc: "For your planned reminders" },
            ].map(({ key, label, desc }) => (
              <SettingRow
                key={key}
                label={label}
                description={desc}
                checked={settings[key]}
                onChange={(v) => setSetting(key, v)}
              />
            ))}
            <Separator />
            <Button
              variant="outline"
              size="sm"
              onClick={() => testPushMut.mutate()}
              disabled={testPushMut.isPending}
            >
              {testPushMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Bell className="h-3.5 w-3.5 mr-1.5" />}
              Send test notification
            </Button>
          </CardContent>
        </Card>

        {/* Safety */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" /> Safety Defaults
            </CardTitle>
            <CardDescription>
              By default, all actions require your approval. Enable trusted automations with caution.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <p className="font-medium">Approval-first mode is active</p>
              <p className="text-xs mt-1 text-amber-700">
                All AI suggestions go to the Review Queue before any action is taken.
                Auto-send and auto-create are disabled by default.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Save button */}
        <div className="flex justify-end pb-4">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} size="lg">
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Settings
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}

function SettingRow({
  label,
  description,
  checked,
  onChange,
  danger,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <Label className={`text-sm ${danger ? "text-amber-700" : ""}`}>{label}</Label>
        <p className={`text-xs mt-0.5 ${danger ? "text-amber-600" : "text-muted-foreground"}`}>{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
