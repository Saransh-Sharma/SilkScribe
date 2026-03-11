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
    <div className="ss-onboarding-scene relative flex h-screen w-screen overflow-hidden px-4 py-4 text-ss-text-primary">
      <div className="ss-onboarding-orb ss-onboarding-orb-a" />
      <div className="ss-onboarding-orb ss-onboarding-orb-b" />
      <div className="ss-onboarding-orb ss-onboarding-orb-c" />
      <div className="ss-onboarding-grid" />

      <div className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-1 items-center justify-center">
        <div className="ss-onboarding-card flex h-full max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-[36px] border border-ss-border-default bg-ss-bg-surface/90 shadow-[var(--ss-shadow-lift)] backdrop-blur-xl">
          <header
            className={`border-b border-ss-border-subtle px-5 py-4 md:px-6 ${
              compactHeader ? "md:py-3.5" : "md:py-4.5"
            }`}
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div className="max-w-[340px] overflow-hidden rounded-[18px] border border-ss-border-subtle bg-ss-bg-surface-alt px-3 py-1.5 shadow-[var(--ss-shadow-card)]">
                  <SilkScribeWordmark
                    height={compactHeader ? 40 : 46}
                    fit="cover"
                    className="w-full"
                    imageScale={1.71}
                  />
                </div>

                <div className="rounded-[18px] border border-ss-brand-highlight/16 bg-ss-brand-highlight/10 px-4 py-2 text-sm font-medium text-ss-text-primary">
                  {t("onboarding.shared.stepCounter", {
                    current: activeStep + 1,
                    total: stepLabels.length,
                  })}
                </div>
              </div>

              <ol className="grid gap-2 md:auto-cols-fr md:grid-flow-col">
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
                      className={`rounded-[18px] border px-3.5 py-2.5 transition-[transform,background-color,border-color,box-shadow] duration-300 ${
                        state === "complete"
                          ? "border-ss-brand-primary/28 bg-ss-brand-primary/12 text-ss-text-primary shadow-[var(--ss-shadow-card)]"
                          : state === "active"
                            ? "ss-onboarding-progress-active border-ss-brand-secondary/28 bg-ss-brand-secondary/12 text-ss-text-primary shadow-[var(--ss-shadow-card)]"
                            : "border-ss-border-subtle bg-ss-bg-surface-alt/82 text-ss-text-tertiary"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                            state === "complete"
                              ? "bg-ss-brand-primary text-ss-brand-primary-ink"
                              : state === "active"
                                ? "bg-ss-brand-secondary text-ss-brand-secondary-ink"
                                : "bg-ss-bg-surface text-ss-text-tertiary"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <span className="truncate text-sm font-semibold leading-tight">
                          {label}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 md:px-6 md:pb-6 md:pt-5">
            <div className="flex h-full flex-col gap-5">
              <div className="shrink-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-ss-brand-secondary">
                  {eyebrow}
                </p>
                <h1 className="mt-3 max-w-4xl text-[clamp(1.95rem,1.5rem+1.5vw,3rem)] font-semibold leading-[0.94] text-ss-text-primary">
                  {title}
                </h1>
                <p className="mt-3 max-w-3xl text-[clamp(0.96rem,0.92rem+0.24vw,1.08rem)] leading-relaxed text-ss-text-secondary">
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
