import React from "react";
import { useTranslation } from "react-i18next";
import SilkScribeWordmark from "../icons/SilkScribeWordmark";

interface OnboardingShellProps {
  stepLabels: string[];
  activeStep: number;
  eyebrow: string;
  title: string;
  description: string;
  footer?: React.ReactNode;
  compactHeader?: boolean;
  children: React.ReactNode;
}

const OnboardingShell: React.FC<OnboardingShellProps> = ({
  stepLabels,
  activeStep,
  eyebrow,
  title,
  description,
  footer,
  compactHeader = false,
  children,
}) => {
  const { t } = useTranslation();

  return (
    <div className="ss-onboarding-scene relative flex h-[100dvh] w-screen overflow-hidden p-3 text-ss-text-primary">
      <div className="ss-onboarding-speechline" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex w-full max-w-[1480px] flex-1 items-center justify-center">
        <div className="ss-onboarding-card flex h-full max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-[var(--ss-radius-window)] border border-ss-border-default bg-ss-bg-surface shadow-[var(--ss-shadow-lift)]">
          <header
            className={`border-b border-ss-border-subtle px-5 md:px-6 ${
              compactHeader ? "py-3" : "py-3.5"
            }`}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <div className="max-w-[250px] overflow-hidden px-1">
                  <SilkScribeWordmark
                    height={compactHeader ? 34 : 38}
                    fit="cover"
                    className="w-full"
                    imageScale={1.71}
                  />
                </div>

                <div className="rounded-full border border-ss-border-subtle bg-ss-bg-surface-alt px-3 py-1.5 text-xs font-semibold tabular-nums text-ss-text-secondary">
                  {t("onboarding.shared.stepCounter", {
                    current: activeStep + 1,
                    total: stepLabels.length,
                  })}
                </div>
              </div>

              <ol
                className="grid grid-cols-5 gap-0"
                aria-label={t("onboarding.shared.stepCounter", {
                  current: activeStep + 1,
                  total: stepLabels.length,
                })}
              >
                {stepLabels.map((label, index) => {
                  const state =
                    index < activeStep
                      ? "complete"
                      : index === activeStep
                        ? "active"
                        : "upcoming";

                  return (
                    <li
                      key={`${label}-${index}`}
                      className="relative min-w-0 px-1"
                      aria-current={state === "active" ? "step" : undefined}
                    >
                      <div className="relative flex items-center">
                        {index > 0 ? (
                          <span
                            className={`h-px flex-1 ${index <= activeStep ? "bg-ss-brand-secondary/45" : "bg-ss-border-default"}`}
                          />
                        ) : (
                          <span className="flex-1" />
                        )}
                        <span
                          className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold transition-colors duration-[var(--ss-duration-state)] ${
                            state === "complete"
                              ? "border-ss-brand-primary bg-ss-brand-primary text-ss-brand-primary-ink"
                              : state === "active"
                                ? "border-ss-brand-secondary bg-ss-brand-secondary text-ss-brand-secondary-ink ring-4 ring-ss-brand-secondary/10"
                                : "border-ss-border-default bg-ss-bg-surface text-ss-text-tertiary"
                          }`}
                        >
                          {index + 1}
                        </span>
                        {index < stepLabels.length - 1 ? (
                          <span
                            className={`h-px flex-1 ${index < activeStep ? "bg-ss-brand-secondary/45" : "bg-ss-border-default"}`}
                          />
                        ) : (
                          <span className="flex-1" />
                        )}
                      </div>
                      <span
                        className={`mt-1 block truncate text-center text-[10px] font-semibold ${state === "active" ? "text-ss-brand-secondary" : "text-ss-text-tertiary"}`}
                        title={label}
                      >
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 md:px-6 md:pb-6">
            <div className="flex h-full flex-col gap-4">
              <div className="shrink-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-ss-brand-secondary">
                  {eyebrow}
                </p>
                <h1 className="mt-2 max-w-4xl text-[clamp(1.8rem,1.5rem+1.2vw,2.65rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-ss-text-primary">
                  {title}
                </h1>
                <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-ss-text-secondary md:text-[15px]">
                  {description}
                </p>
              </div>

              <div className="min-h-0 flex-1">{children}</div>
            </div>
          </div>

          {footer && (
            <footer className="shrink-0 border-t border-ss-border-subtle px-5 py-4 md:px-6">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingShell;
