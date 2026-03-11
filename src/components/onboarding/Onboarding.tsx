import React from "react";
import { ArrowRight, ShieldCheck, Sparkles, Waves } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import OnboardingShell from "./OnboardingShell";

interface OnboardingProps {
  onContinue: () => void;
  stepLabels: string[];
  activeStep: number;
}

const FEATURE_KEYS = ["permissions", "engine", "practice"] as const;

const Onboarding: React.FC<OnboardingProps> = ({
  onContinue,
  stepLabels,
  activeStep,
}) => {
  const { t } = useTranslation();

  const iconMap = {
    permissions: ShieldCheck,
    engine: Sparkles,
    practice: Waves,
  } as const;

  return (
    <OnboardingShell
      stepLabels={stepLabels}
      activeStep={activeStep}
      eyebrow={t("onboarding.welcome.eyebrow")}
      title={t("onboarding.welcome.title")}
      description={t("onboarding.welcome.description")}
      compactHeader
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-ss-text-secondary">
            {t("onboarding.welcome.permissionPromise")}
          </p>
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
      <div className="grid h-full gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <section className="flex h-full flex-col justify-between rounded-[28px] border border-ss-border-default bg-ss-bg-surface/94 p-6 shadow-[var(--ss-shadow-card)]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-ss-brand-secondary/20 bg-ss-brand-secondary/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-ss-brand-secondary">
              <Sparkles className="h-3.5 w-3.5" />
              {t("onboarding.welcome.badge")}
            </div>

            <div className="mt-6 grid gap-4">
              {FEATURE_KEYS.map((featureKey) => {
                const Icon = iconMap[featureKey];
                return (
                  <article
                    key={featureKey}
                    className="rounded-[22px] border border-ss-border-subtle bg-ss-bg-surface-alt/90 p-4"
                  >
                    <div className="flex items-start gap-4">
                      <div className="ss-onboarding-float flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-ss-brand-highlight/16 text-ss-brand-primary">
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-ss-text-primary">
                          {t(`onboarding.welcome.features.${featureKey}.title`)}
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-ss-text-secondary">
                          {t(
                            `onboarding.welcome.features.${featureKey}.description`,
                          )}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="rounded-[24px] border border-ss-brand-highlight/20 bg-[linear-gradient(135deg,rgba(254,191,43,0.14),rgba(177,32,95,0.08))] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ss-text-tertiary">
              {t("onboarding.welcome.outcomeLabel")}
            </p>
            <p className="mt-2.5 max-w-2xl text-[clamp(1.08rem,1rem+0.35vw,1.42rem)] font-semibold leading-tight text-ss-text-primary">
              {t("onboarding.welcome.outcome")}
            </p>
          </div>
        </section>

        <aside className="rounded-[28px] border border-ss-border-default bg-ss-bg-surface/94 p-6 shadow-[var(--ss-shadow-card)]">
          <div className="rounded-[22px] border border-ss-border-subtle bg-ss-bg-surface-alt/88 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ss-text-tertiary">
              {t("onboarding.welcome.planLabel")}
            </p>
            <ol className="mt-4 space-y-4">
              {[1, 2, 3].map((stepNumber) => (
                <li key={stepNumber} className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ss-brand-primary text-sm font-bold text-ss-brand-primary-ink shadow-[var(--ss-shadow-card)]">
                    {stepNumber}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ss-text-primary">
                      {t(`onboarding.welcome.plan.step${stepNumber}.title`)}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ss-text-secondary">
                      {t(
                        `onboarding.welcome.plan.step${stepNumber}.description`,
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-5 rounded-[22px] border border-ss-brand-primary/16 bg-ss-brand-primary/8 p-5">
            <p className="text-sm font-semibold text-ss-text-primary">
              {t("onboarding.welcome.outcomeLabel")}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ss-text-secondary">
              {t("onboarding.welcome.outcome")}
            </p>
          </div>
        </aside>
      </div>
    </OnboardingShell>
  );
};

export default Onboarding;
