import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { open, save } from "@tauri-apps/plugin-dialog";
import { X } from "lucide-react";
import { toast } from "sonner";
import { commands, type Replacement, type Snippet } from "@/bindings";
import { useSettings } from "../../hooks/useSettings";
import { toastError } from "@/lib/utils/toastError";
import { Button, SettingContainer, SettingsGroup, Textarea } from "../ui";
import { Input } from "../ui/Input";
import { CustomWords } from "./CustomWords";

/** Ignores case, punctuation and spacing, as the backend does when matching. */
const samePhrase = (a: string, b: string) => {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_'’]+/gu, " ")
      .trim();
  return normalize(a) === normalize(b);
};

interface EntryProps {
  said: string;
  written: string;
  removeLabel: string;
  disabled: boolean;
  onRemove: () => void;
}

/** One "said → written" row. */
const Entry: React.FC<EntryProps> = ({
  said,
  written,
  removeLabel,
  disabled,
  onRemove,
}) => (
  <li className="flex items-center gap-2 text-sm">
    <span className="min-w-0 shrink-0 font-semibold text-ss-text-primary">
      {said}
    </span>
    <span aria-hidden="true" className="text-ss-text-tertiary">
      {"→"}
    </span>
    <span className="min-w-0 flex-1 truncate text-ss-text-secondary">
      {written}
    </span>
    <Button
      variant="ghost"
      size="sm"
      aria-label={removeLabel}
      disabled={disabled}
      onClick={onRemove}
    >
      <X className="h-3.5 w-3.5" aria-hidden="true" />
    </Button>
  </li>
);

/** The dictionary, one section of the Dictation settings: spellings the
 * engine should know, phrases always written another way, and snippets. */
export const DictionarySettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating, refreshSettings } =
    useSettings();
  const replacements: Replacement[] = getSetting("replacements") ?? [];
  const snippets: Snippet[] = getSetting("snippets") ?? [];
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [trigger, setTrigger] = useState("");
  const [text, setText] = useState("");

  const addReplacement = () => {
    const entry = { from: from.trim(), to: to.trim() };
    if (!entry.from || !entry.to) return;
    void updateSetting("replacements", [
      ...replacements.filter((r) => !samePhrase(r.from, entry.from)),
      entry,
    ]);
    setFrom("");
    setTo("");
  };

  const addSnippet = () => {
    const entry = { trigger: trigger.trim(), text: text.trim() };
    if (!entry.trigger || !entry.text) return;
    void updateSetting("snippets", [
      ...snippets.filter((s) => !samePhrase(s.trigger, entry.trigger)),
      entry,
    ]);
    setTrigger("");
    setText("");
  };

  const importFile = async () => {
    try {
      const path = await open({
        multiple: false,
        filters: [
          {
            name: t("settings.dictionary.file.kind"),
            extensions: ["json", "txt", "csv"],
          },
        ],
      });
      if (typeof path !== "string") return;
      const result = await commands.importDictionary(path);
      if (result.status === "error") throw new Error(result.error);
      await refreshSettings();
      const added =
        result.data.words + result.data.replacements + result.data.snippets;
      toast.success(t("settings.dictionary.file.imported", { count: added }));
    } catch (error) {
      toastError(t("settings.dictionary.file.importFailed"), error);
    }
  };

  const exportFile = async () => {
    try {
      const path = await save({
        defaultPath: t("settings.dictionary.file.defaultName"),
        filters: [
          { name: t("settings.dictionary.file.kind"), extensions: ["json"] },
        ],
      });
      if (!path) return;
      const result = await commands.exportDictionary(path);
      if (result.status === "error") throw new Error(result.error);
      toast.success(t("settings.dictionary.file.exported"));
    } catch (error) {
      toastError(t("settings.dictionary.file.exportFailed"), error);
    }
  };

  const onEnter =
    (action: () => void) => (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        action();
      }
    };

  return (
    <SettingsGroup title={t("settings.dictionary.title")}>
      <CustomWords descriptionMode="inline" grouped />

      <SettingContainer
        title={t("settings.dictionary.replacements.title")}
        description={t("settings.dictionary.replacements.description")}
        descriptionMode="inline"
        layout="stacked"
        grouped
      >
        <div className="flex flex-col gap-3">
          {replacements.length > 0 && (
            <ul
              className="flex flex-col gap-1"
              aria-label={t("settings.dictionary.replacements.title")}
            >
              {replacements.map((replacement) => (
                <Entry
                  key={replacement.from}
                  said={replacement.from}
                  written={replacement.to}
                  removeLabel={t("settings.dictionary.remove", {
                    phrase: replacement.from,
                  })}
                  disabled={isUpdating("replacements")}
                  onRemove={() =>
                    void updateSetting(
                      "replacements",
                      replacements.filter((r) => r !== replacement),
                    )
                  }
                />
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-44"
              variant="compact"
              aria-label={t("settings.dictionary.replacements.said")}
              placeholder={t("settings.dictionary.replacements.saidExample")}
              value={from}
              maxLength={100}
              onChange={(event) => setFrom(event.target.value)}
              onKeyDown={onEnter(addReplacement)}
            />
            <span aria-hidden="true" className="text-ss-text-tertiary">
              {"→"}
            </span>
            <Input
              className="max-w-44"
              variant="compact"
              aria-label={t("settings.dictionary.replacements.written")}
              placeholder={t("settings.dictionary.replacements.writtenExample")}
              value={to}
              maxLength={100}
              onChange={(event) => setTo(event.target.value)}
              onKeyDown={onEnter(addReplacement)}
            />
            <Button
              size="md"
              onClick={addReplacement}
              disabled={
                !from.trim() || !to.trim() || isUpdating("replacements")
              }
            >
              {t("settings.dictionary.replacements.add")}
            </Button>
          </div>
        </div>
      </SettingContainer>

      <SettingContainer
        title={t("settings.dictionary.snippets.title")}
        description={t("settings.dictionary.snippets.description")}
        descriptionMode="inline"
        layout="stacked"
        grouped
      >
        <div className="flex flex-col gap-3">
          {snippets.length > 0 && (
            <ul
              className="flex flex-col gap-1"
              aria-label={t("settings.dictionary.snippets.title")}
            >
              {snippets.map((snippet) => (
                <Entry
                  key={snippet.trigger}
                  said={snippet.trigger}
                  written={snippet.text.split("\n").join(" ⏎ ")}
                  removeLabel={t("settings.dictionary.remove", {
                    phrase: snippet.trigger,
                  })}
                  disabled={isUpdating("snippets")}
                  onRemove={() =>
                    void updateSetting(
                      "snippets",
                      snippets.filter((s) => s !== snippet),
                    )
                  }
                />
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2">
            <Input
              className="max-w-60"
              variant="compact"
              aria-label={t("settings.dictionary.snippets.trigger")}
              placeholder={t("settings.dictionary.snippets.triggerExample")}
              value={trigger}
              maxLength={100}
              onChange={(event) => setTrigger(event.target.value)}
            />
            <Textarea
              variant="compact"
              aria-label={t("settings.dictionary.snippets.text")}
              placeholder={t("settings.dictionary.snippets.textExample")}
              value={text}
              maxLength={5000}
              onChange={(event) => setText(event.target.value)}
            />
            <div>
              <Button
                size="md"
                onClick={addSnippet}
                disabled={
                  !trigger.trim() || !text.trim() || isUpdating("snippets")
                }
              >
                {t("settings.dictionary.snippets.add")}
              </Button>
            </div>
          </div>
        </div>
      </SettingContainer>

      <SettingContainer
        title={t("settings.dictionary.file.title")}
        description={t("settings.dictionary.file.description")}
        descriptionMode="inline"
        grouped
      >
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={importFile}>
            {t("settings.dictionary.file.import")}
          </Button>
          <Button variant="secondary" size="sm" onClick={exportFile}>
            {t("settings.dictionary.file.export")}
          </Button>
        </div>
      </SettingContainer>
    </SettingsGroup>
  );
};
