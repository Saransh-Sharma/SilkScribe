import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Hand, Repeat } from "lucide-react";
import { commands } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { toastError } from "@/lib/utils/toastError";
import { ShortcutInput } from "../settings/ShortcutInput";
import { ToggleSwitch } from "../ui";
import { Button } from "../ui/Button";
import OnboardingShell from "./OnboardingShell";

interface OnboardingShortcutProps {
  onContinue: () => void;
  stepLabels: string[];
  activeStep: number;
}

/** Pick the dictation shortcut, how it behaves, and (where it runs on this
 * Mac) whether to clean up every dictation. Comes after the permission steps:
 * shortcuts only start once Accessibility is allowed. */
const OnboardingShortcut: React.FC<OnboardingShortcutProps> = ({
  onContinue,
  stepLabels,
  activeStep,
}) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();
  const pushToTalk = getSetting("push_to_talk") ?? true;
  const [onDeviceCleanup, setOnDeviceCleanup] = useState(false);
  const [cleanUp, setCleanUp] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void commands
      .checkAppleIntelligenceAvailable()
      .then(setOnDeviceCleanup)
      .catch(() => {});
  }, []);

  const handleContinue = async () => {
    setSaving(true);
    try {
      if (onDeviceCleanup && cleanUp) {
        const result = await commands.enableOnDeviceCleanup();
        if (result.status === "error") throw new Error(result.error);
      }
    } catch (error) {
      // Cleanup is optional; dictation works without it.
      toastError(t("onboarding.shortcut.cleanupFailed"), error);
    } finally {
      setSaving(false);
      onContinue();
    }
  };

  const modes = [
    { pushToTalk: true, icon: Hand, key: "hold" },
    { pushToTalk: false, icon: Repeat, key: "toggle" },
  ] as const;

  return (
    <OnboardingShell
      stepLabels={stepLabels}
      activeStep={activeStep}
      title={t("onboarding.shortcut.title")}
      description={t("onboarding.shortcut.description")}
      compactHeader
      footer={
        <div className="flex justify-end">
          <Button
            onClick={handleContinue}
            variant="primary"
            size="lg"
            disabled={saving}
            className="rounded-[18px] px-6"
          >
            {t("onboarding.shortcut.continue")}
          </Button>
        </div>
      }
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-3 lg:p-5">
        <ShortcutInput shortcutId="transcribe" descriptionMode="inline" />
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-ss-text-primary">
            {t("onboarding.shortcut.modeTitle")}
          </legend>
          {modes.map(({ pushToTalk: value, icon: Icon, key }) => {
            const selected = pushToTalk === value;
            return (
              <label
                key={key}
                className={`flex cursor-pointer gap-3 rounded-[var(--ss-radius-lg)] border p-4 transition-colors ${
                  selected
                    ? "border-ss-brand-primary bg-ss-bg-elevated"
                    : "border-ss-border-default hover:bg-ss-bg-surface-alt"
                }`}
              >
                <input
                  type="radio"
                  name="dictation-mode"
                  className="sr-only"
                  checked={selected}
                  onChange={() => void updateSetting("push_to_talk", value)}
                />
                <Icon
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    selected ? "text-ss-brand-primary" : "text-ss-text-tertiary"
                  }`}
                  aria-hidden="true"
                />
                <span>
                  <span className="block text-sm font-semibold text-ss-text-primary">
                    {t(`onboarding.shortcut.${key}.title`)}
                  </span>
                  <span className="text-sm text-ss-text-secondary">
                    {t(`onboarding.shortcut.${key}.body`)}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {onDeviceCleanup && (
          <ToggleSwitch
            checked={cleanUp}
            onChange={setCleanUp}
            label={t("onboarding.shortcut.cleanup.label")}
            description={t("onboarding.shortcut.cleanup.description")}
            descriptionMode="inline"
          />
        )}
      </div>
    </OnboardingShell>
  );
};

export default OnboardingShortcut;
