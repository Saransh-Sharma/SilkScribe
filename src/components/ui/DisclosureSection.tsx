import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

interface DisclosureSectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  tone?: "default" | "caution";
}

export const DisclosureSection = ({
  title,
  description,
  defaultOpen = false,
  children,
  tone = "default",
}: DisclosureSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();

  const toneClasses =
    tone === "caution"
      ? "border-ss-brand-highlight/35 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ss-brand-highlight)_10%,var(--ss-bg-surface))_0%,var(--ss-bg-surface)_100%)]"
      : "border-ss-border-subtle bg-ss-bg-surface";

  return (
    <section
      className={`overflow-hidden rounded-[var(--ss-radius-lg)] border shadow-[var(--ss-shadow-card)] ${toneClasses}`}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition-colors duration-150 hover:bg-ss-bg-surface-alt/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/35"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ss-text-primary">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-ss-text-secondary">
              {description}
            </p>
          ) : null}
        </div>
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ss-bg-surface-alt text-ss-text-tertiary transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div id={panelId} className="overflow-hidden">
          <div className="border-t border-ss-border-subtle/80 px-3 pb-3 pt-1">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
};
