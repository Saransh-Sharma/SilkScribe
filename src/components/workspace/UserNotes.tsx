import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { SaveQueue } from "./saveQueue";
import { toastError } from "@/lib/utils/toastError";

/** The latest text per document. <Transcript> remounts on every stage change
 * (e.g. when a meeting stops), so a remount starts from what was typed rather
 * than from the last save that landed. */
const latest = new Map<string, string>();

const SAVE_DELAY_MS = 500;
const LIST_ITEM = /^(\s*)([-*•]|\d+[.)])\s+/;

/** Continues a bulleted or numbered list on Enter; an empty item ends the list.
 * Returns the new text and caret position, or null to let Enter type normally. */
export function continueList(
  text: string,
  caret: number,
  selectionEnd = caret,
): { text: string; caret: number } | null {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const line = text.slice(lineStart, caret);
  const match = line.match(LIST_ITEM);
  if (!match) return null;
  if (line.trim() === match[0].trim()) {
    return {
      text: text.slice(0, lineStart) + text.slice(selectionEnd),
      caret: lineStart,
    };
  }
  const marker = /^\d/.test(match[2])
    ? `${parseInt(match[2], 10) + 1}${match[2].slice(-1)}`
    : match[2];
  const insert = `\n${match[1]}${marker} `;
  return {
    text: text.slice(0, caret) + insert + text.slice(selectionEnd),
    caret: caret + insert.length,
  };
}

/** The notes a person types for a meeting. Saved apart from the document, so
 * typing works while the meeting records and while it's processed. */
export function UserNotes({ documentId }: { documentId: string }) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => latest.get(documentId) ?? "");
  const [loaded, setLoaded] = useState(() => latest.has(documentId));
  const textarea = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const queue = useRef<SaveQueue<string>>();
  if (!queue.current)
    queue.current = new SaveQueue(async (body) => {
      await api.saveUserNotes(documentId, body);
    });

  useEffect(() => {
    if (latest.has(documentId)) return;
    let current = true;
    api
      .userNotes(documentId)
      .then((body) => {
        if (!current) return;
        latest.set(documentId, body);
        setText(body);
      })
      .catch((error) => toastError(t("workspace.errors.loadNotes"), error))
      .finally(() => current && setLoaded(true));
    return () => {
      current = false;
    };
  }, [documentId, t]);

  // Save what's pending when the editor goes away.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      void queue.current?.flush().catch(() => {});
    },
    [],
  );

  const update = (body: string) => {
    latest.set(documentId, body);
    setText(body);
    queue.current!.enqueue(body);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      queue
        .current!.flush()
        .catch((error) => toastError(t("workspace.errors.saveNotes"), error));
    }, SAVE_DELAY_MS);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing)
      return;
    const el = event.currentTarget;
    const next = continueList(text, el.selectionStart, el.selectionEnd);
    if (!next) return;
    event.preventDefault();
    update(next.text);
    requestAnimationFrame(() =>
      textarea.current?.setSelectionRange(next.caret, next.caret),
    );
  };

  return (
    <section className="ws-user-notes" aria-labelledby={`notes-${documentId}`}>
      <h2 id={`notes-${documentId}`}>{t("workspace.yourNotes")}</h2>
      <textarea
        ref={textarea}
        dir="auto"
        aria-labelledby={`notes-${documentId}`}
        placeholder={t("workspace.yourNotesPlaceholder")}
        value={text}
        disabled={!loaded}
        rows={8}
        onChange={(event) => update(event.target.value)}
        onKeyDown={onKeyDown}
      />
    </section>
  );
}
