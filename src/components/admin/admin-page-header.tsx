import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface AdminPageHeaderProps {
  kicker: string;
  kickerIcon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function AdminPageHeader({
  kicker,
  kickerIcon: KickerIcon,
  title,
  description,
  actions,
}: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <p
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          {KickerIcon ? <KickerIcon className="size-3" /> : null}
          {kicker}
        </p>
        <h1
          className="mt-1 text-[28px] font-bold leading-none tracking-tight text-ink sm:text-[32px]"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sub">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
