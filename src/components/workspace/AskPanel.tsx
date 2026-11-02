import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, MessageCircleQuestion } from "lucide-react";
import type { AskAnswer, AskSource } from "@/bindings";
import { api, duration } from "./api";

type AskState =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "answer"; question: string; result: AskAnswer }
  | { kind: "error"; message: string };

/** Ask a question across meetings and notes; the answer cites the passages it
 * comes from, and each citation opens the transcript at that moment. */
/** Error codes Ask returns, and the words for them. */
const ASK_ERRORS: Record<string, string> = {
  "ask:busy": "workspace.ask.errors.busy",
  "ask:no-engine": "workspace.ask.errors.noEngine",
  "ask:timeout": "workspace.ask.errors.timeout",
};

export function AskPanel({
  onOpen,
  onSetupEngine,
  focusRequest = 0,
  shortcut,
  meetings = true,
}: {
  onOpen: (documentId: string, start: number | null) => void;
  /** Takes the person to where they can download a notes engine. */
  onSetupEngine: () => void;
  /** Changes when the workspace wants the question box focused (⌘K). */
  focusRequest?: number;
  /** The shortcut that focuses the box, shown as a hint. */
  shortcut: string;
  /** Whether the Library has meetings, not only dictations. */
  meetings?: boolean;
}) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AskState>({ kind: "idle" });
  const input = useRef<HTMLInputElement>(null);
  const asked = useRef(0);

  // The workspace handles ⌘K / Ctrl+K on every screen and asks for focus.
  useEffect(() => {
    if (!focusRequest) return;
    input.current?.focus();
    input.current?.select();
  }, [focusRequest]);

  const ask = async () => {
    const text = question.trim();
    if (!text || state.kind === "asking") return;
    const request = ++asked.current;
    setState({ kind: "asking" });
    try {
      const result = await api.ask(text);
      if (request === asked.current)
        setState({ kind: "answer", question: text, result });
    } catch (error) {
      if (request === asked.current)
        setState({
          kind: "error",
          message: String(error).replace(/^Error:\s*/, ""),
        });
    }
  };

  const cancel = () => {
    asked.current += 1;
    setState({ kind: "idle" });
    void api.cancelAsk().catch(() => {});
  };

  const sourceLabel = (source: AskSource) =>
    [
      source.title,
      new Date(source.created_at * 1000).toLocaleDateString(),
      source.start === null
        ? t("workspace.ask.yourNotes")
        : duration(source.start),
    ].join(" · ");

  // The answer with its [p1] markers as numbered citation buttons.
  const renderAnswer = (result: AskAnswer) =>
    result.answer.split(/(\[p\d+\])/).map((part, index) => {
      const id = /^\[(p\d+)\]$/.exec(part)?.[1];
      const position = id
        ? result.sources.findIndex((source) => source.id === id)
        : -1;
      if (!id) return <Fragment key={index}>{part}</Fragment>;
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
    <section
      className="ws-ask"
      aria-label={t(
        meetings ? "workspace.ask.title" : "workspace.ask.titleAll",
      )}
    >
      <form
        className="ws-ask-form"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <MessageCircleQuestion size={17} aria-hidden="true" />
        <input
          ref={input}
          dir="auto"
          value={question}
          maxLength={500}
          aria-label={t(
            meetings ? "workspace.ask.label" : "workspace.ask.labelAll",
          )}
          placeholder={t(
            meetings
              ? "workspace.ask.placeholder"
              : "workspace.ask.placeholderAll",
          )}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <kbd aria-hidden="true">{shortcut}</kbd>
        <button
          type="submit"
          className="ws-secondary"
          disabled={!question.trim() || state.kind === "asking"}
        >
          {t("workspace.ask.submit")}
        </button>
      </form>
      {state.kind === "asking" && (
        <div className="ws-ask-result" role="status">
          <p className="ws-meta">{t("workspace.ask.thinking")}</p>
          <button className="ws-text-button" onClick={cancel}>
            {t("workspace.cancel")}
          </button>
        </div>
      )}
      {state.kind === "error" && (
        <div className="ws-ask-result" role="alert">
          <p>
            {ASK_ERRORS[state.message]
              ? t(ASK_ERRORS[state.message])
              : t("workspace.ask.errors.other", { error: state.message })}
          </p>
          {state.message === "ask:no-engine" && (
            <button className="ws-secondary" onClick={onSetupEngine}>
              {t("workspace.ask.errors.getEngine")}
            </button>
          )}
        </div>
      )}
      {state.kind === "answer" && (
        <div className="ws-ask-result" role="status">
          {state.result.answer ? (
            <>
              <p className="ws-ask-answer" dir="auto">
                {renderAnswer(state.result)}
              </p>
              {state.result.sources.length > 0 && (
                <ol className="ws-ask-sources">
                  {state.result.sources.map((source) => (
                    <li key={source.id}>
                      <button
                        onClick={() => onOpen(source.document_id, source.start)}
                      >
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
          ) : (
            <p className="ws-meta">{t("workspace.ask.nothingFound")}</p>
          )}
        </div>
      )}
    </section>
  );
}
