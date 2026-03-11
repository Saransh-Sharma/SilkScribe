import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Star, Trash2 } from "lucide-react";
import { type HistoryEntry } from "@/bindings";
import { AudioPlayer } from "@/components/ui/AudioPlayer";
import { formatTime } from "@/utils/dateFormat";

interface HistoryFeedItemProps {
  entry: HistoryEntry;
  onToggleSaved: (id: number) => void;
  onCopyText: (text: string) => void;
  onDelete: (id: number) => void;
  getAudioUrl: (fileName: string) => Promise<string | null>;
}

export const HistoryFeedItem = ({
  entry,
  onToggleSaved,
  onCopyText,
  onDelete,
  getAudioUrl,
}: HistoryFeedItemProps) => {
  const { t, i18n } = useTranslation();
  const [showCopied, setShowCopied] = useState(false);

  const transcriptText = entry.post_processed_text ?? entry.transcription_text;
  const timestampLabel = formatTime(String(entry.timestamp), i18n.language);

  const handleCopy = () => {
    onCopyText(transcriptText);
    setShowCopied(true);
    window.setTimeout(() => setShowCopied(false), 2000);
  };

  return (
    <div className="grid gap-3 px-4 py-4 transition-[background-color,border-color,transform] duration-200 hover:bg-ss-bg-surface-alt/55 md:grid-cols-[92px_minmax(0,1fr)]">
      <p className="pt-1 text-xs font-semibold uppercase tracking-[0.16em] text-ss-text-tertiary md:text-right">
        {timestampLabel}
      </p>
      <div className="min-w-0 space-y-3">
        <p className="max-w-[72ch] text-sm leading-relaxed text-ss-text-secondary select-text cursor-text">
          {transcriptText}
        </p>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <AudioPlayer
            compact
            onLoadRequest={() => getAudioUrl(entry.file_name)}
            className="w-full max-w-[360px]"
          />
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent text-ss-text-tertiary transition-[background-color,border-color,color,transform] duration-150 hover:-translate-y-0.5 hover:border-ss-brand-secondary/25 hover:bg-ss-brand-secondary/10 hover:text-ss-brand-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/35"
              title={t("settings.history.copyToClipboard")}
              aria-label={t("settings.history.copyToClipboard")}
            >
              {showCopied ? (
                <Check width={18} height={18} />
              ) : (
                <Copy width={18} height={18} />
              )}
            </button>
            <button
              type="button"
              onClick={() => onToggleSaved(entry.id)}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition-[background-color,border-color,color,transform] duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/35 ${
                entry.saved
                  ? "border-ss-brand-secondary/25 bg-ss-brand-secondary/10 text-ss-brand-secondary"
                  : "border-transparent text-ss-text-tertiary hover:border-ss-brand-secondary/25 hover:bg-ss-brand-secondary/10 hover:text-ss-brand-secondary"
              }`}
              title={
                entry.saved
                  ? t("settings.history.unsave")
                  : t("settings.history.save")
              }
              aria-label={
                entry.saved
                  ? t("settings.history.unsave")
                  : t("settings.history.save")
              }
            >
              <Star
                width={18}
                height={18}
                fill={entry.saved ? "currentColor" : "none"}
              />
            </button>
            <button
              type="button"
              onClick={() => onDelete(entry.id)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent text-ss-text-tertiary transition-[background-color,border-color,color,transform] duration-150 hover:-translate-y-0.5 hover:border-ss-state-danger/20 hover:bg-ss-state-danger/10 hover:text-ss-state-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/35"
              title={t("settings.history.delete")}
              aria-label={t("settings.history.delete")}
            >
              <Trash2 width={18} height={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
