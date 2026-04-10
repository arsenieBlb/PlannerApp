import { signIn } from "@/lib/auth";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Mail, Calendar, Zap, Bell, Shield } from "lucide-react";

export default async function LoginPage() {
  const session = await auth();
  if (session?.userId) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="w-full max-w-md mx-auto px-6">
        {/* Logo + tagline */}
        <div className="text-center mb-10">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg">
            <Zap className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Planner</h1>
          <p className="mt-2 text-muted-foreground">
            Your personal AI email &amp; calendar assistant
          </p>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {[
            { icon: Mail, text: "AI reply drafts" },
            { icon: Calendar, text: "Smart scheduling" },
            { icon: Bell, text: "Phone notifications" },
            { icon: Shield, text: "Approval-first" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 rounded-lg border bg-white p-3 shadow-sm">
              <Icon className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm text-foreground">{text}</span>
            </div>
          ))}
        </div>

        {/* Sign in form */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-1">Sign in to continue</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Connect your Google account to get started. Only your account has access.
          </p>

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-lg border bg-white px-4 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 active:bg-slate-100"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            This app is for personal use only. Your data stays on your device.
          </p>
        </div>
      </div>
    </div>
  );
}
