import { type HistoryEntry } from "@/bindings";
import { HistoryFeedItem } from "./HistoryFeedItem";

interface HistoryDayGroupProps {
  label: string;
  entries: HistoryEntry[];
  onToggleSaved: (id: number) => void;
  onCopyText: (text: string) => void;
  onDelete: (id: number) => void;
  getAudioUrl: (fileName: string) => Promise<string | null>;
  animationDelayMs?: number;
}

export const HistoryDayGroup = ({
  label,
  entries,
  onToggleSaved,
  onCopyText,
  onDelete,
  getAudioUrl,
  animationDelayMs = 0,
}: HistoryDayGroupProps) => (
  <section
    className="space-y-2 home-fade-in"
    style={{ animationDelay: `${animationDelayMs}ms` }}
  >
    <div className="px-1">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ss-text-tertiary">
        {label}
      </h2>
    </div>
    <div className="overflow-hidden rounded-[var(--ss-radius-lg)] border border-ss-border-subtle bg-ss-bg-surface shadow-[var(--ss-shadow-card)]">
      <div className="divide-y divide-ss-border-subtle">
        {entries.map((entry) => (
          <HistoryFeedItem
            key={entry.id}
            entry={entry}
            onToggleSaved={onToggleSaved}
            onCopyText={onCopyText}
            onDelete={onDelete}
            getAudioUrl={getAudioUrl}
          />
        ))}
      </div>
    </div>
  </section>
);
