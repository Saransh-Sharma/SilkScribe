import React from "react";
import { ArrowRight, Keyboard, Mic, Waves } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import OnboardingShell from "./OnboardingShell";

interface OnboardingProps {
  onOpenWorkspace?: () => void;
  onContinue: () => void;
  stepLabels: string[];
  activeStep: number;
}

const PLAN_STEPS = [
  { step: 1, icon: Mic },
  { step: 2, icon: Keyboard },
  { step: 3, icon: Waves },
] as const;

const Onboarding: React.FC<OnboardingProps> = ({
  onContinue,
  onOpenWorkspace,
  stepLabels,
  activeStep,
}) => {
  const { t } = useTranslation();

  return (
    <OnboardingShell
      stepLabels={stepLabels}
      activeStep={activeStep}
      title={t("onboarding.welcome.title")}
      description={t("onboarding.welcome.description")}
      compactHeader
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          {onOpenWorkspace ? (
            <div>
              <button
                className="text-sm font-semibold text-ss-brand-primary underline"
                onClick={onOpenWorkspace}
              >
                {t("workspace.workspaceFirst")}
              </button>
              <p className="mt-1 text-xs text-ss-text-secondary">
                {t("workspace.workspaceFirstHelp")}
              </p>
            </div>
          ) : (
            <span />
          )}
          <Button
            onClick={onContinue}
            variant="primary"
            size="lg"
            className="shrink-0 rounded-[18px] px-6"
          >
            {t("onboarding.welcome.continue")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div className="flex h-full items-center p-2 lg:p-4">
        <ol className="w-full max-w-xl space-y-4">
          {PLAN_STEPS.map(({ step, icon: Icon }) => (
            <li
              key={step}
              className="flex items-start gap-4 border-b border-ss-border-subtle py-3.5 last:border-b-0"
            >
              <div className="ss-onboarding-float flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-ss-brand-highlight/16 text-ss-brand-primary">
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <div>
                <p className="text-base font-semibold text-ss-text-primary">
                  {t(`onboarding.welcome.plan.step${step}.title`)}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ss-text-secondary">
                  {t(`onboarding.welcome.plan.step${step}.description`)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </OnboardingShell>
  );
};

export default Onboarding;
