import { type HistoryEntry } from "@/bindings";
import { HistoryFeedItem } from "./HistoryFeedItem";

interface HistoryDayGroupProps {
  label: string;
  entries: HistoryEntry[];
  onToggleSaved: (id: number) => void;
  onCopyText: (text: string) => void;
  onDelete: (id: number) => void;
  onRetryTranscription?: (id: number) => void;
  getAudioUrl: (fileName: string) => Promise<string | null>;
}

export const HistoryDayGroup = ({
  label,
  entries,
  onToggleSaved,
  onCopyText,
  onDelete,
  onRetryTranscription,
  getAudioUrl,
}: HistoryDayGroupProps) => (
  <section className="space-y-2">
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
            onRetryTranscription={onRetryTranscription}
            getAudioUrl={getAudioUrl}
          />
        ))}
      </div>
    </div>
  </section>
);
