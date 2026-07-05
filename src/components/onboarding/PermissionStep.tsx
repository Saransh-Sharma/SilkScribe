import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Keyboard,
  Loader2,
  Mic,
  ShieldCheck,
} from "lucide-react";
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
export type PermissionStatus =
  | "checking"
  | "needed"
  | "error"
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

const isActiveGuidanceState = (status: PermissionStatus) =>
  status === "needed" ||
  status === "requesting" ||
  status === "waiting_for_user";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

interface PermissionVisualProps {
  permission: PermissionKind;
  status: PermissionStatus;
}

const PermissionValuePanel = ({
  permission,
  status,
}: PermissionVisualProps) => {
  const { t } = useTranslation();
  const Icon = ICONS[permission];

  return (
    <section className="flex min-h-0 flex-col rounded-[28px] border border-ss-border-default bg-ss-bg-surface/94 p-6 shadow-[var(--ss-shadow-card)]">
      <div className="flex items-start gap-4">
        <div className="ss-onboarding-float flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-ss-brand-highlight/16 text-ss-brand-primary shadow-[var(--ss-shadow-card)]">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ss-brand-secondary">
            {t(`onboarding.permissions.${permission}.needLabel`)}
          </p>
          <p className="mt-2 text-lg font-semibold leading-tight text-ss-text-primary">
            {t(`onboarding.permissions.${permission}.whyItMattersTitle`)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ss-text-secondary">
            {t(`onboarding.permissions.${permission}.whyItMattersBody`)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {[1, 2, 3].map((index) => (
          <article
            key={`${permission}-value-${index}`}
            className="rounded-[20px] border border-ss-border-subtle bg-ss-bg-surface-alt/82 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ss-brand-primary/10 text-xs font-bold text-ss-brand-primary">
                {index}
              </div>
              <p className="text-sm leading-relaxed text-ss-text-secondary">
                {t(`onboarding.permissions.${permission}.steps.step${index}`)}
              </p>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-auto pt-5">
        <div className="rounded-[22px] border border-ss-brand-highlight/22 bg-[linear-gradient(135deg,rgba(254,191,43,0.16),rgba(255,248,239,0.78))] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ss-text-tertiary">
            {t("onboarding.permissions.shared.privateLabel")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ss-text-secondary">
            {t(`onboarding.permissions.${permission}.privateNote`)}
          </p>
        </div>
      </div>
    </section>
  );
};

const PermissionGuidePreview = ({
  permission,
  status,
}: PermissionVisualProps) => {
  const { t } = useTranslation();
  const Icon = ICONS[permission];
  const isGranted = status === "granted";
  const showGuidance = isActiveGuidanceState(status);

  return (
    <section className="ss-permission-helper-enter relative flex min-h-[440px] flex-col overflow-hidden rounded-[28px] border border-ss-border-default bg-ss-bg-surface/94 p-6 shadow-[var(--ss-shadow-card)]">
      <div
        className={`ss-permission-guide-surface ${
          isGranted ? "ss-permission-guide-granted" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="h-3 w-3 rounded-full bg-[#ed6a5e]" />
            <span className="h-3 w-3 rounded-full bg-[#f5bf4f]" />
            <span className="h-3 w-3 rounded-full bg-[#61c454]" />
          </div>
          <div className="rounded-full border border-ss-border-subtle bg-ss-bg-surface/84 px-3 py-1 text-xs font-semibold text-ss-text-tertiary">
            {t(`onboarding.permissions.${permission}.guide.windowLabel`)}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ss-brand-secondary">
              {t("onboarding.permissions.shared.guidedHelper")}
            </p>
            <h2 className="mt-2 text-xl font-semibold leading-tight text-ss-text-primary">
              {t(`onboarding.permissions.${permission}.guide.title`)}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ss-text-secondary">
              {t(`onboarding.permissions.${permission}.guide.body`)}
            </p>
          </div>
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] ${
              isGranted
                ? "bg-ss-brand-primary text-ss-brand-primary-ink"
                : "bg-ss-brand-secondary/12 text-ss-brand-secondary"
            }`}
          >
            {status === "requesting" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isGranted ? (
              <Check className="h-5 w-5" />
            ) : (
              <Icon className="h-5 w-5" />
            )}
          </div>
        </div>

        <div
          className="relative mt-6 rounded-[24px] border border-ss-border-subtle bg-ss-bg-surface/88 p-4 shadow-[var(--ss-shadow-card)]"
          role="img"
          aria-label={t(
            `onboarding.permissions.${permission}.guide.previewAlt`,
          )}
        >
          <div aria-hidden="true">
            {permission === "microphone" ? (
              <MicrophonePreview status={status} />
            ) : (
              <AccessibilityPreview status={status} />
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex min-w-0 items-center gap-2 rounded-full border border-ss-brand-primary/16 bg-ss-brand-primary/8 px-3.5 py-2 text-sm font-semibold text-ss-text-primary">
            <ShieldCheck className="h-4 w-4 shrink-0 text-ss-brand-primary" />
            <span className="truncate">
              {t(`onboarding.permissions.shared.statuses.${status}`)}
            </span>
          </div>
          {showGuidance ? (
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-ss-brand-secondary">
              <ArrowUp
                className="ss-permission-arrow-pulse h-5 w-5"
                aria-hidden="true"
              />
              <span>{t(`onboarding.permissions.${permission}.guide.cue`)}</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

const MicrophonePreview = ({ status }: { status: PermissionStatus }) => {
  const { t } = useTranslation();
  const isGranted = status === "granted";

  return (
    <div className="grid gap-4">
      <div className="rounded-[22px] border border-ss-border-subtle bg-ss-bg-surface-alt/92 p-4">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-ss-brand-highlight/18 text-ss-brand-primary">
            <Mic className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold leading-tight text-ss-text-primary">
              {t("onboarding.permissions.microphone.guide.promptTitle")}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-ss-text-secondary">
              {t("onboarding.permissions.microphone.guide.promptBody")}
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <div className="rounded-[16px] border border-ss-border-subtle bg-ss-bg-surface px-4 py-2.5 text-center text-sm font-semibold text-ss-text-tertiary">
          {t("onboarding.permissions.microphone.guide.deny")}
        </div>
        <div
          className={`rounded-[16px] border px-4 py-2.5 text-center text-sm font-semibold transition-[background-color,border-color,color,transform] duration-300 ${
            isGranted
              ? "border-ss-brand-primary bg-ss-brand-primary text-ss-brand-primary-ink"
              : "border-ss-brand-highlight bg-ss-brand-highlight/22 text-ss-text-primary"
          }`}
        >
          {isGranted ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Check className="h-4 w-4" />
              {t("onboarding.permissions.microphone.guide.allowed")}
            </span>
          ) : (
            t("onboarding.permissions.microphone.guide.allow")
          )}
        </div>
      </div>
    </div>
  );
};

const AccessibilityPreview = ({ status }: { status: PermissionStatus }) => {
  const { t } = useTranslation();
  const isGranted = status === "granted";

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {[
          t("onboarding.permissions.accessibility.guide.exampleApp1"),
          t("onboarding.permissions.accessibility.guide.exampleApp2"),
        ].map((appName) => (
          <div
            key={appName}
            className="flex items-center justify-between gap-3 rounded-[16px] border border-ss-border-subtle bg-ss-bg-surface-alt/82 px-3.5 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="h-8 w-8 shrink-0 rounded-[12px] bg-ss-bg-surface shadow-[var(--ss-shadow-card)]" />
              <span className="truncate text-sm font-semibold text-ss-text-tertiary">
                {appName}
              </span>
            </div>
            <span className="h-6 w-10 shrink-0 rounded-full border border-ss-border-subtle bg-ss-bg-surface" />
          </div>
        ))}
      </div>

      <div className="relative flex items-center justify-between gap-3 rounded-[18px] border border-ss-brand-highlight/35 bg-[linear-gradient(135deg,rgba(254,191,43,0.18),rgba(255,248,239,0.86))] px-3.5 py-3.5 shadow-[var(--ss-shadow-card)]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-ss-brand-primary text-ss-brand-primary-ink">
            <Keyboard className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ss-text-primary">
              {t("onboarding.permissions.shared.appName")}
            </p>
            <p className="truncate text-xs text-ss-text-tertiary">
              {t("onboarding.permissions.accessibility.guide.rowHelp")}
            </p>
          </div>
        </div>
        <span
          className={`relative h-7 w-12 shrink-0 rounded-full border transition-[background-color,border-color] duration-300 ${
            isGranted
              ? "border-ss-brand-primary bg-ss-brand-primary"
              : "border-ss-border-default bg-ss-bg-surface"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-ss-bg-surface shadow-[var(--ss-shadow-card)] transition-transform duration-300 ${
              isGranted ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </span>
      </div>
    </div>
  );
};

interface PermissionStatusCardProps extends PermissionVisualProps {
  error: string | null;
}

export const PermissionStatusCard = ({
  permission,
  status,
  error,
}: PermissionStatusCardProps) => {
  const { t } = useTranslation();
  const Icon = ICONS[permission];

  return (
    <div
      className="rounded-[24px] border border-ss-brand-secondary/18 bg-ss-brand-secondary/8 p-5"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex items-start gap-3">
        {status === "granted" ? (
          <div className="ss-onboarding-success-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ss-brand-primary text-ss-brand-primary-ink">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ss-brand-secondary/12 text-ss-brand-secondary">
            {status === "requesting" ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Icon className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-base font-semibold text-ss-text-primary">
            {t("onboarding.permissions.shared.statusLabel")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ss-text-secondary">
            {t(`onboarding.permissions.${permission}.statusHelp.${status}`)}
          </p>
          {status === "error" && error ? (
            <p className="mt-2 text-xs leading-relaxed text-ss-state-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const PermissionStep = ({
  permission,
  mode,
  stepLabels,
  activeStep,
  onContinue,
}: PermissionStepProps) => {
  const { t } = useTranslation();
  const pollRef = useRef<number | null>(null);
  const [status, setStatus] = useState<PermissionStatus>("checking");
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const clearPolling = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handlePermissionFailure = useCallback(
    (phase: "check" | "request", error: unknown) => {
      clearPolling();
      const message = getErrorMessage(error);
      console.error(`Failed to ${phase} ${permission} permission:`, error);
      setPermissionError(message);
      setStatus("error");
    },
    [permission],
  );

  const checkPermission = useCallback(async () => {
    try {
      setPermissionError(null);
      return await CHECKERS[permission]();
    } catch (error) {
      handlePermissionFailure("check", error);
      return null;
    }
  }, [handlePermissionFailure, permission]);

  const requestPermission = useCallback(async () => {
    try {
      setPermissionError(null);
      await REQUESTERS[permission]();
      return true;
    } catch (error) {
      handlePermissionFailure("request", error);
      return false;
    }
  }, [handlePermissionFailure, permission]);

  const verifyPermission = useCallback(async () => {
    const granted = await checkPermission();
    if (granted === null) {
      return null;
    }

    setStatus(granted ? "granted" : "waiting_for_user");
    return granted;
  }, [checkPermission]);

  const startPolling = useCallback(() => {
    if (pollRef.current !== null) return;

    pollRef.current = window.setInterval(async () => {
      const granted = await checkPermission();
      if (granted === null) {
        return;
      }

      if (granted) {
        clearPolling();
        setStatus("granted");
      }
    }, 1200);
  }, [checkPermission]);

  useEffect(() => {
    let isCancelled = false;

    const runInitialCheck = async () => {
      const granted = await checkPermission();
      if (isCancelled || granted === null) return;
      setStatus(granted ? "granted" : "needed");
    };

    void runInitialCheck();

    return () => {
      isCancelled = true;
      clearPolling();
    };
  }, [checkPermission, permission]);

  const handleOpenPrompt = async () => {
    setStatus("requesting");
    setPermissionError(null);

    const requested = await requestPermission();
    if (!requested) {
      return;
    }

    const granted = await checkPermission();
    if (granted === null) {
      return;
    }

    setStatus(granted ? "granted" : "waiting_for_user");
    if (!granted) {
      startPolling();
    }
  };

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
            t(`onboarding.permissions.${permission}.primaryAction`)
          )}
        </Button>
        <Button
          onClick={() => {
            setPermissionError(null);
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
      <div className="grid h-full min-h-[560px] gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <PermissionValuePanel permission={permission} status={status} />
        <div className="grid min-h-0 gap-5">
          <PermissionGuidePreview permission={permission} status={status} />
          <PermissionStatusCard
            permission={permission}
            status={status}
            error={permissionError}
          />
        </div>
      </div>
    </OnboardingShell>
  );
};

export default PermissionStep;
