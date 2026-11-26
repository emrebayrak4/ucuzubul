import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, badge }: { title: string; description?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {badge}
        </div>
        {description ? <p className="mt-1 max-w-3xl text-sm text-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
