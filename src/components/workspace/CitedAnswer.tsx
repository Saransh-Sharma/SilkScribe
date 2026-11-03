import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Copy } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import type { AskAnswer, AskSource } from "@/bindings";
import { toastError } from "@/lib/utils/toastError";
import { duration } from "./api";

/** The text without its [p1] citation markers, for copying elsewhere. */
export const withoutCitations = (text: string) =>
  text
    .replace(/\s*\[p\d+\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

/** Text from the Library (an Ask answer, a recipe), with each [p1] marker
 * as a numbered button that opens its source, the sources listed below, and
 * a reminder to check them. */
export function CitedAnswer({
  result,
  onOpen,
  copyable = false,
}: {
  result: AskAnswer;
  onOpen: (documentId: string, start: number | null) => void;
  /** Offer to copy the text, without its citation markers. */
  copyable?: boolean;
}) {
  const { t } = useTranslation();
  const sourceLabel = (source: AskSource) =>
    [
      source.title,
      new Date(source.created_at * 1000).toLocaleDateString(),
      source.start === null
        ? t("workspace.ask.yourNotes")
        : duration(source.start),
    ].join(" · ");

  const parts = result.answer.split(/(\[p\d+\])/).map((part, index) => {
    const id = /^\[(p\d+)\]$/.exec(part)?.[1];
    if (!id) return <Fragment key={index}>{part}</Fragment>;
    const position = result.sources.findIndex((source) => source.id === id);
    if (position < 0) return null;
    const source = result.sources[position];
    return (
      <button
        key={index}
        className="ws-ask-cite"
        aria-label={t("workspace.ask.openSource", {
          source: sourceLabel(source),
        })}
        onClick={() => onOpen(source.document_id, source.start)}
      >
        {position + 1}
      </button>
    );
  });

  return (
    <>
      <p className="ws-ask-answer" dir="auto">
        {parts}
      </p>
      {copyable && (
        <button
          className="ws-secondary"
          onClick={() =>
            writeText(withoutCitations(result.answer))
              .then(() => toast.success(t("workspace.recipes.copied")))
              .catch((error) =>
                toastError(t("workspace.recipes.copyFailed"), error),
              )
          }
        >
          <Copy size={14} aria-hidden="true" />
          {t("workspace.recipes.copy")}
        </button>
      )}
      {result.sources.length > 0 && (
        <ol className="ws-ask-sources">
          {result.sources.map((source) => (
            <li key={source.id}>
              <button onClick={() => onOpen(source.document_id, source.start)}>
                <span className="ws-ask-source-title">
                  {sourceLabel(source)}
                </span>
                <span className="ws-ask-excerpt" dir="auto">
                  {source.text}
                </span>
                <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="ws-meta">{t("workspace.ask.checkSources")}</p>
    </>
  );
}
