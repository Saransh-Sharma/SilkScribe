import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarRange, MessageCircleQuestion } from "lucide-react";
import type { AskAnswer } from "@/bindings";
import { CitedAnswer } from "./CitedAnswer";
import { api } from "./api";

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
  "recipe:empty": "workspace.recipes.errors.empty",
};

/** Marks an answer as the weekly recap rather than a question's. */
const WEEKLY_RECAP = "\u0000weekly-recap";

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

  // The past week's meetings, written up by the weekly recap recipe.
  const recap = async () => {
    if (state.kind === "asking") return;
    const request = ++asked.current;
    setState({ kind: "asking" });
    try {
      const result = await api.runRecipe("weekly_recap", []);
      if (request === asked.current)
        setState({ kind: "answer", question: WEEKLY_RECAP, result });
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
      {meetings && (
        <button
          type="button"
          className="ws-text-button ws-ask-recap"
          disabled={state.kind === "asking"}
          onClick={() => void recap()}
        >
          <CalendarRange size={14} aria-hidden="true" />
          {t("workspace.recipes.weekly")}
        </button>
      )}
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
            <CitedAnswer
              result={state.result}
              onOpen={onOpen}
              copyable={state.question === WEEKLY_RECAP}
            />
          ) : (
            <p className="ws-meta">{t("workspace.ask.nothingFound")}</p>
          )}
        </div>
      )}
    </section>
  );
}
