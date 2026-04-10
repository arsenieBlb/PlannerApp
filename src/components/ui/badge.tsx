import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
        meeting: "border-blue-200 bg-blue-100 text-blue-800",
        deadline: "border-red-200 bg-red-100 text-red-800",
        personal: "border-purple-200 bg-purple-100 text-purple-800",
        work: "border-amber-200 bg-amber-100 text-amber-800",
        school: "border-green-200 bg-green-100 text-green-800",
        urgent: "border-red-300 bg-red-200 text-red-900",
        newsletter: "border-slate-200 bg-slate-100 text-slate-600",
        other: "border-slate-200 bg-slate-100 text-slate-600",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
