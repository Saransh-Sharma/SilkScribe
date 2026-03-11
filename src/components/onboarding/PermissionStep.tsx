import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Loader2, Mic, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  checkAccessibilityPermission,
  checkMicrophonePermission,
  requestAccessibilityPermission,
  requestMicrophonePermission,
} from "tauri-plugin-macos-permissions-api";
import OnboardingShell from "./OnboardingShell";
import { Button } from "../ui/Button";

export type PermissionKind = "microphone" | "accessibility";
type PermissionStatus =
  | "checking"
  | "needed"
  | "requesting"
  | "waiting_for_user"
  | "granted";

interface PermissionStepProps {
  permission: PermissionKind;
  mode: "onboarding" | "repair";
  stepLabels: string[];
  activeStep: number;
  onContinue: () => void;
}

const ICONS = {
  microphone: Mic,
  accessibility: Keyboard,
} as const;

const CHECKERS = {
  microphone: checkMicrophonePermission,
  accessibility: checkAccessibilityPermission,
} as const;

const REQUESTERS = {
  microphone: requestMicrophonePermission,
  accessibility: requestAccessibilityPermission,
} as const;

const PermissionStep = ({
  permission,
  mode,
  stepLabels,
  activeStep,
  onContinue,
}: PermissionStepProps) => {
  const { t } = useTranslation();
  const Icon = ICONS[permission];
  const pollRef = useRef<number | null>(null);
  const [status, setStatus] = useState<PermissionStatus>("checking");

  const clearPolling = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const verifyPermission = useCallback(async () => {
    const granted = await CHECKERS[permission]().catch(() => false);
    setStatus(granted ? "granted" : "waiting_for_user");
    return granted;
  }, [permission]);

  const startPolling = useCallback(() => {
    if (pollRef.current !== null) return;

    pollRef.current = window.setInterval(async () => {
      const granted = await CHECKERS[permission]().catch(() => false);
      if (granted) {
        clearPolling();
        setStatus("granted");
      }
    }, 1200);
  }, [permission]);

  useEffect(() => {
    let isCancelled = false;

    const runInitialCheck = async () => {
      const granted = await CHECKERS[permission]().catch(() => false);
      if (isCancelled) return;
      setStatus(granted ? "granted" : "needed");
    };

    void runInitialCheck();

    return () => {
      isCancelled = true;
      clearPolling();
    };
  }, [permission]);

  const handleOpenPrompt = async () => {
    setStatus("requesting");

    try {
      await REQUESTERS[permission]();
    } catch (error) {
      console.error(`Failed requesting ${permission} permission:`, error);
    }

    const granted = await CHECKERS[permission]().catch(() => false);
    setStatus(granted ? "granted" : "waiting_for_user");
    if (!granted) {
      startPolling();
    }
  };

  const stepItems = [1, 2, 3, 4].map((index) =>
    t(`onboarding.permissions.${permission}.steps.step${index}`),
  );

  const footerActions =
    status === "granted" ? (
      <Button
        onClick={onContinue}
        variant="primary"
        size="lg"
        className="rounded-[18px] px-6"
      >
        {t("onboarding.permissions.shared.continue")}
      </Button>
    ) : (
      <>
        <Button
          onClick={handleOpenPrompt}
          variant="primary"
          size="lg"
          disabled={status === "requesting"}
          className="rounded-[18px] px-5"
        >
          {status === "requesting" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("onboarding.permissions.shared.openingPrompt")}
            </>
          ) : (
            t("onboarding.permissions.shared.openPrompt")
          )}
        </Button>
        <Button
          onClick={() => {
            setStatus("waiting_for_user");
            startPolling();
          }}
          variant="secondary"
          size="lg"
          className="rounded-[18px]"
        >
          {t("onboarding.permissions.shared.iEnabledIt")}
        </Button>
        <Button
          onClick={() => void verifyPermission()}
          variant="ghost"
          size="lg"
          className="rounded-[18px]"
        >
          {t("onboarding.permissions.shared.checkAgain")}
        </Button>
      </>
    );

  return (
    <OnboardingShell
      stepLabels={stepLabels}
      activeStep={activeStep}
      eyebrow={t(
        mode === "repair"
          ? "onboarding.permissions.shared.repairEyebrow"
          : "onboarding.permissions.shared.eyebrow",
      )}
      title={t(`onboarding.permissions.${permission}.title`)}
      description={t(`onboarding.permissions.${permission}.description`)}
      compactHeader
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-ss-text-secondary">
            {t(`onboarding.permissions.${permission}.manualHint`)}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {footerActions}
          </div>
        </div>
      }
    >
      <div className="grid h-full gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className="rounded-[28px] border border-ss-border-default bg-ss-bg-surface/94 p-6 shadow-[var(--ss-shadow-card)]">
          <div className="flex items-start gap-4">
            <div className="ss-onboarding-float flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-ss-brand-highlight/16 text-ss-brand-primary shadow-[var(--ss-shadow-card)]">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ss-brand-secondary">
                {t(`onboarding.permissions.${permission}.needLabel`)}
              </p>
              <p className="mt-2 text-lg font-semibold text-ss-text-primary">
                {t(`onboarding.permissions.${permission}.whyItMattersTitle`)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ss-text-secondary">
                {t(`onboarding.permissions.${permission}.whyItMattersBody`)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <article className="rounded-[22px] border border-ss-border-subtle bg-ss-bg-surface-alt/88 p-4">
              <p className="text-sm font-semibold text-ss-text-primary">
                {t(`onboarding.permissions.${permission}.breaksWithoutTitle`)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ss-text-secondary">
                {t(`onboarding.permissions.${permission}.breaksWithoutBody`)}
              </p>
            </article>
            <article className="rounded-[22px] border border-ss-border-subtle bg-ss-bg-surface-alt/88 p-4">
              <p className="text-sm font-semibold text-ss-text-primary">
                {t(`onboarding.permissions.${permission}.afterGrantTitle`)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ss-text-secondary">
                {t(`onboarding.permissions.${permission}.afterGrantBody`)}
              </p>
            </article>
          </div>
        </section>

        <section className="rounded-[28px] border border-ss-border-default bg-ss-bg-surface/94 p-6 shadow-[var(--ss-shadow-card)]">
          <div className="flex items-center justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-ss-brand-primary/18 bg-ss-brand-primary/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-ss-brand-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("onboarding.permissions.shared.stepByStep")}
            </div>
            <div className="rounded-full border border-ss-border-subtle bg-ss-bg-surface-alt/88 px-4 py-2 text-sm font-semibold text-ss-text-primary">
              {t(`onboarding.permissions.shared.statuses.${status}`)}
            </div>
          </div>

          <ol className="mt-5 grid gap-3">
            {stepItems.slice(0, 3).map((item, index) => (
              <li
                key={`${permission}-${index}`}
                className="rounded-[22px] border border-ss-border-subtle bg-ss-bg-surface-alt/88 p-4"
              >
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ss-brand-primary text-xs font-bold text-ss-brand-primary-ink">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-relaxed text-ss-text-secondary">
                    {item}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 rounded-[24px] border border-ss-brand-secondary/18 bg-ss-brand-secondary/8 p-5">
            <div className="flex items-center gap-3">
              {status === "granted" ? (
                <div className="ss-onboarding-success-ring flex h-11 w-11 items-center justify-center rounded-full bg-ss-brand-primary text-ss-brand-primary-ink">
                  <ShieldCheck className="h-5 w-5" />
                </div>
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ss-brand-secondary/12 text-ss-brand-secondary">
                  {status === "requesting" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
              )}
              <div>
                <p className="text-base font-semibold text-ss-text-primary">
                  {t("onboarding.permissions.shared.statusLabel")}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ss-text-secondary">
                  {t(`onboarding.permissions.${permission}.statusHelp.${status}`)}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </OnboardingShell>
  );
};

export default PermissionStep;
