import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Wand2 } from "lucide-react";
import type { AskAnswer } from "@/bindings";
import { Dropdown } from "../ui/Dropdown";
import { api } from "./api";
import { CitedAnswer } from "./CitedAnswer";

/** Recipes that write from one meeting, in the order they're offered. */
export const MEETING_RECIPES = [
  "follow_up_email",
  "action_items",
  "customer_notes",
  "interview_summary",
  "custom",
] as const;
type MeetingRecipe = (typeof MEETING_RECIPES)[number];

const ERRORS: Record<string, string> = {
  "ask:busy": "workspace.ask.errors.busy",
  "ask:no-engine": "workspace.ask.errors.noEngine",
  "ask:timeout": "workspace.ask.errors.timeout",
  "recipe:empty": "workspace.recipes.errors.emptyMeeting",
};

type State =
  | { kind: "idle" }
  | { kind: "writing" }
  | { kind: "done"; result: AskAnswer }
  | { kind: "error"; message: string };

/** Write something from this meeting by a recipe, with its sources cited. */
export function RecipePanel({
  documentId,
  onSeek,
  onSetupEngine,
}: {
  documentId: string;
  /** Plays the meeting from a cited moment. */
  onSeek: (seconds: number) => void;
  onSetupEngine: () => void;
}) {
  const { t } = useTranslation();
  const [recipe, setRecipe] = useState<MeetingRecipe>("follow_up_email");
  const [custom, setCustom] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const run = useRef(0);

  const write = async () => {
    const request = ++run.current;
    setState({ kind: "writing" });
    try {
      const result = await api.runRecipe(
        recipe,
        [documentId],
        recipe === "custom" ? custom : undefined,
      );
      if (request === run.current) setState({ kind: "done", result });
    } catch (error) {
      if (request === run.current)
        setState({
          kind: "error",
          message: String(error).replace(/^Error:\s*/, ""),
        });
    }
  };

  const cancel = () => {
    run.current += 1;
    setState({ kind: "idle" });
    void api.cancelAsk().catch(() => {});
  };

  return (
    <section className="ws-recipes" aria-label={t("workspace.recipes.title")}>
      <h2>{t("workspace.recipes.title")}</h2>
      <div className="ws-actions ws-notes-actions">
        <label className="ws-inline-field">
          <span>{t("workspace.recipes.label")}</span>
          <Dropdown
            ariaLabel={t("workspace.recipes.label")}
            selectedValue={recipe}
            options={MEETING_RECIPES.map((id) => ({
              value: id,
              label: t(`workspace.recipes.names.${id}`),
            }))}
            onSelect={(value) => setRecipe(value as MeetingRecipe)}
          />
        </label>
        <button
          className="ws-secondary"
          disabled={
            state.kind === "writing" || (recipe === "custom" && !custom.trim())
          }
          onClick={() => void write()}
        >
          <Wand2 size={15} aria-hidden="true" />
          {t("workspace.recipes.write")}
        </button>
      </div>
      {recipe === "custom" && (
        <textarea
          className="ws-recipe-custom"
          dir="auto"
          rows={2}
          maxLength={1000}
          aria-label={t("workspace.recipes.customLabel")}
          placeholder={t("workspace.recipes.customPlaceholder")}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
        />
      )}
      {state.kind === "writing" && (
        <div className="ws-ask-result" role="status">
          <p className="ws-meta">{t("workspace.recipes.writing")}</p>
          <button className="ws-text-button" onClick={cancel}>
            {t("workspace.cancel")}
          </button>
        </div>
      )}
      {state.kind === "error" && (
        <div className="ws-ask-result" role="alert">
          <p>
            {ERRORS[state.message]
              ? t(ERRORS[state.message])
              : t("workspace.ask.errors.other", { error: state.message })}
          </p>
          {state.message === "ask:no-engine" && (
            <button className="ws-secondary" onClick={onSetupEngine}>
              {t("workspace.ask.errors.getEngine")}
            </button>
          )}
        </div>
      )}
      {state.kind === "done" && (
        <div className="ws-ask-result" role="status">
          {state.result.answer ? (
            <CitedAnswer
              result={state.result}
              copyable
              onOpen={(_, start) => {
                if (start !== null) onSeek(start);
              }}
            />
          ) : (
            <p className="ws-meta">{t("workspace.recipes.nothing")}</p>
          )}
        </div>
      )}
    </section>
  );
}
