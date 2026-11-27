import * as React from "react";
import { cn } from "../lib/cn";

export interface SectionHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  /** id for the heading (use with aria-labelledby on the section). */
  titleId?: string;
  /** Muted sub line under the title. */
  description?: React.ReactNode;
  /** Inline next to the title (badges, segmented tabs). */
  extra?: React.ReactNode;
  /** Right side: "See all" link, rail arrows, small notes. Vertically centred on the title row, never on the description. */
  actions?: React.ReactNode;
  as?: "h2" | "h3";
  /** "lg" = text-xl section title (default), "md" = text-lg title for sub-sections and cards. */
  size?: "md" | "lg";
}

/**
 * One heading row for every section: title (+ inline extra) on the left, actions on the right, both centred on the
 * title line; the optional description sits under the title and never pushes the actions down. Includes the standard
 * heading → content gap (`section-head`). Pass `className="mb-0"` when the parent controls spacing.
 */
export function SectionHeader({ title, titleId, description, extra, actions, as: Heading = "h2", size = "lg", className, ...props }: SectionHeaderProps) {
  return (
    <div className={cn("section-head", className)} {...props}>
      {/* No wrap here: a long title wraps inside its own column, actions stay on the right of the first line. */}
      <div className="flex min-h-8 items-center justify-between gap-x-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <Heading id={titleId} className={cn("font-semibold tracking-tight text-text", size === "lg" ? "text-xl" : "text-lg")}>
            {title}
          </Heading>
          {extra}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      {description ? <p className="mt-0.5 text-sm text-text-muted">{description}</p> : null}
    </div>
  );
}

/**
 * Class for a text link in SectionHeader actions ("See all"): 32px tall so it centres with sm icon buttons; the
 * padding (focus ring room) is cancelled by a negative margin so the text sits exactly on the container edge.
 */
export const sectionActionLinkClass =
  "-mx-1 inline-flex h-8 items-center whitespace-nowrap gap-0.5 rounded-sm px-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
