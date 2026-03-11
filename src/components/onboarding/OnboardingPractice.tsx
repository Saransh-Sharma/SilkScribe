import React, { useState } from "react";
import { Check, Mic, Sparkles, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { commands } from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import { useSettings } from "@/hooks/useSettings";
import { Textarea } from "@/components/ui";
import { Button } from "../ui/Button";
import OnboardingShell from "./OnboardingShell";

interface OnboardingPracticeProps {
  onComplete: () => void;
  stepLabels: string[];
  activeStep: number;
}

const OnboardingPractice: React.FC<OnboardingPracticeProps> = ({
  onComplete,
  stepLabels,
  activeStep,
}) => {
  const { t } = useTranslation();
  const osType = useOsType();
  const { settings } = useSettings();
  const [trialText, setTrialText] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);

  const transcribeBinding =
    settings?.bindings?.transcribe?.current_binding?.trim() ?? "";
  const shortcutLabel = transcribeBinding
    ? formatKeyCombination(transcribeBinding, osType)
    : t("onboarding.practice.shortcutFallback");
  const trialCompleted = trialText.trim().length > 0;

  const handleFinish = async () => {
    setIsCompleting(true);

    try {
      const result = await commands.completeOnboarding();
      if (result.status === "error") {
        throw new Error(result.error);
      }
      onComplete();
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
      toast.error(t("onboarding.practice.finishFailed"));
      setIsCompleting(false);
    }
  };

  return (
    <OnboardingShell
      stepLabels={stepLabels}
      activeStep={activeStep}
      eyebrow={t("onboarding.practice.eyebrow")}
      title={t("onboarding.practice.title")}
      description={t("onboarding.practice.description")}
      compactHeader
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-ss-text-secondary">
            {trialCompleted
              ? t("onboarding.practice.readyToFinish")
              : t("onboarding.practice.prompt")}
          </p>

          <Button
            onClick={handleFinish}
            variant="primary"
            size="lg"
            disabled={isCompleting}
            className="rounded-[18px] px-6"
          >
            {isCompleting
              ? t("onboarding.practice.finishing")
              : trialCompleted
                ? t("onboarding.practice.finish")
                : t("onboarding.practice.skip")}
          </Button>
        </div>
      }
    >
      <div className="grid h-full gap-5 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
        <aside className="rounded-[28px] border border-ss-border-default bg-ss-bg-surface/94 p-6 shadow-[var(--ss-shadow-card)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-ss-brand-secondary/18 bg-ss-brand-secondary/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-ss-brand-secondary">
            <Sparkles className="h-3.5 w-3.5" />
            {t("onboarding.practice.badge")}
          </div>

          <div className="mt-5 space-y-3">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className="rounded-[22px] border border-ss-border-subtle bg-ss-bg-surface-alt/88 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ss-brand-primary text-sm font-bold text-ss-brand-primary-ink">
                    {step}
                  </div>
                  <p className="text-sm font-semibold text-ss-text-primary">
                    {t(`onboarding.practice.steps.step${step}.title`, {
                      shortcut: shortcutLabel,
                    })}
                  </p>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ss-text-secondary">
                  {t(`onboarding.practice.steps.step${step}.description`, {
                    shortcut: shortcutLabel,
                  })}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[24px] border border-ss-brand-highlight/20 bg-[linear-gradient(135deg,rgba(254,191,43,0.15),rgba(177,32,95,0.09))] p-5">
            <div className="flex items-center gap-3">
              <Wand2 className="h-5 w-5 text-ss-brand-primary" />
              <p className="text-sm font-semibold text-ss-text-primary">
                {t("onboarding.practice.tipTitle")}
              </p>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ss-text-secondary">
              {t("onboarding.practice.tipBody")}
            </p>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col rounded-[28px] border border-ss-border-default bg-ss-bg-surface/94 p-6 shadow-[var(--ss-shadow-card)]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-ss-brand-highlight/24 bg-ss-brand-highlight/12 px-4 py-2 text-sm font-semibold text-ss-brand-primary">
              <Mic className="h-4 w-4" />
              {shortcutLabel}
            </div>
            {trialCompleted && (
              <div className="ss-onboarding-success-ring inline-flex items-center gap-2 rounded-full border border-ss-brand-primary/24 bg-ss-brand-primary/12 px-4 py-2 text-sm font-semibold text-ss-brand-primary">
                <Check className="h-4 w-4" />
                {t("onboarding.practice.success")}
              </div>
              )}
          </div>

          <div className="mt-4 rounded-[24px] border border-ss-border-subtle bg-ss-bg-surface-alt/78 p-4">
            <p className="text-sm font-semibold text-ss-text-primary">
              {t("onboarding.practice.helperTitle")}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ss-text-secondary">
              {t("onboarding.practice.helper")}
            </p>
          </div>

          <div className="mt-4 min-h-0 flex-1">
            <Textarea
              autoFocus
              value={trialText}
              onChange={(event) => setTrialText(event.target.value)}
              placeholder={t("onboarding.practice.placeholder")}
              className="h-full min-h-[220px] resize-none rounded-[24px] border-ss-border-default bg-ss-bg-surface-alt/75 p-5 text-base shadow-none"
            />
          </div>
        </section>
      </div>
    </OnboardingShell>
  );
};

export default OnboardingPractice;
