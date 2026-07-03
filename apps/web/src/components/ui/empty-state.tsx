import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Consistent empty / zero-result state. Semantic-token only so it reads
 * correctly in light and dark mode. Pass a primary `action` (usually a Button
 * or Link) to give the user a way forward.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon size={24} strokeWidth={1.5} />
        </div>
      )}
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
