import { useEffect, useState, useRef } from "react";
import { Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { platform } from "@tauri-apps/plugin-os";
import {
  checkAccessibilityPermission,
  checkMicrophonePermission,
} from "tauri-plugin-macos-permissions-api";
import "./App.css";
import AccessibilityPermissions from "./components/AccessibilityPermissions";
import Footer from "./components/footer";
import Onboarding, {
  OnboardingPractice,
  OnboardingSetup,
  PermissionStep,
} from "./components/onboarding";
import { Sidebar, SidebarSection, SECTIONS_CONFIG } from "./components/Sidebar";
import { useSettings } from "./hooks/useSettings";
import { useSettingsStore } from "./stores/settingsStore";
import { commands } from "@/bindings";
import {
  enterOnboardingWindowMode,
  exitOnboardingWindowMode,
} from "@/lib/utils/onboardingWindow";
import { getLanguageDirection, initializeRTL } from "@/lib/utils/rtl";

type OnboardingStep =
  | "welcome"
  | "microphone_permission"
  | "accessibility_permission"
  | "setup"
  | "practice"
  | "done";

interface PermissionSnapshot {
  accessibility: boolean;
  microphone: boolean;
}

const renderSettingsContent = (section: SidebarSection) => {
  const ActiveComponent =
    SECTIONS_CONFIG[section]?.component || SECTIONS_CONFIG.general.component;
  return <ActiveComponent />;
};

function App() {
  const { i18n } = useTranslation();
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(
    null,
  );
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [permissions, setPermissions] = useState<PermissionSnapshot>({
    accessibility: false,
    microphone: false,
  });
  const [currentSection, setCurrentSection] = useState<SidebarSection>("home");
  const { settings, updateSetting } = useSettings();
  const direction = getLanguageDirection(i18n.language);
  const refreshAudioDevices = useSettingsStore(
    (state) => state.refreshAudioDevices,
  );
  const refreshOutputDevices = useSettingsStore(
    (state) => state.refreshOutputDevices,
  );
  const hasCompletedPostOnboardingInit = useRef(false);

  const loadPermissionSnapshot = async (): Promise<PermissionSnapshot> => {
    if (platform() !== "macos") {
      return {
        accessibility: true,
        microphone: true,
      };
    }

    try {
      const [accessibility, microphone] = await Promise.all([
        checkAccessibilityPermission(),
        checkMicrophonePermission(),
      ]);
      return { accessibility, microphone };
    } catch (e) {
      console.warn("Failed to check permissions:", e);
      return {
        accessibility: false,
        microphone: false,
      };
    }
  };

  const getFirstMissingPermissionStep = (
    snapshot: PermissionSnapshot,
  ): OnboardingStep | null => {
    if (!snapshot.microphone) {
      return "microphone_permission";
    }
    if (!snapshot.accessibility) {
      return "accessibility_permission";
    }
    return null;
  };

  const onboardingStepLabels = [
    i18n.t("onboarding.progress.welcome"),
    i18n.t("onboarding.progress.microphone"),
    i18n.t("onboarding.progress.accessibility"),
    i18n.t("onboarding.progress.setup"),
    i18n.t("onboarding.progress.practice"),
  ];

  const getRepairStepLabels = (snapshot: PermissionSnapshot): string[] => {
    const labels: string[] = [];
    if (!snapshot.microphone) {
      labels.push(i18n.t("onboarding.progress.microphone"));
    }
    if (!snapshot.accessibility) {
      labels.push(i18n.t("onboarding.progress.accessibility"));
    }
    return labels.length > 0 ? labels : [i18n.t("onboarding.progress.setup")];
  };

  const toaster = (
    <Toaster
      theme="system"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex items-center gap-3 rounded-[var(--ss-radius-lg)] border border-ss-border-default bg-ss-bg-surface px-4 py-3 text-sm text-ss-text-primary shadow-[var(--ss-shadow-lift)]",
          title: "font-semibold text-ss-text-primary",
          description: "text-ss-text-tertiary",
        },
      }}
    />
  );

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  // Initialize RTL direction when language changes
  useEffect(() => {
    initializeRTL(i18n.language);
  }, [i18n.language]);

  useEffect(() => {
    const syncWindowMode = async () => {
      if (
        onboardingStep !== null &&
        onboardingStep !== "done"
      ) {
        await enterOnboardingWindowMode();
        return;
      }

      await exitOnboardingWindowMode();
    };

    void syncWindowMode();
  }, [onboardingStep]);

  // Initialize shortcuts and input handling once onboarding reaches an interactive step.
  useEffect(() => {
    if (
      onboardingStep !== null &&
      onboardingStep !== "welcome" &&
      onboardingStep !== "microphone_permission" &&
      onboardingStep !== "accessibility_permission" &&
      !hasCompletedPostOnboardingInit.current
    ) {
      hasCompletedPostOnboardingInit.current = true;
      Promise.all([
        commands.initializeEnigo(),
        commands.initializeShortcuts(),
      ]).catch((e) => {
        console.warn("Failed to initialize:", e);
      });
      refreshAudioDevices();
      refreshOutputDevices();
    }
  }, [onboardingStep, refreshAudioDevices, refreshOutputDevices]);

  // Handle keyboard shortcuts for debug mode toggle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+Shift+D (Windows/Linux) or Cmd+Shift+D (macOS)
      const isDebugShortcut =
        event.shiftKey &&
        event.key.toLowerCase() === "d" &&
        (event.ctrlKey || event.metaKey);

      if (isDebugShortcut) {
        event.preventDefault();
        const currentDebugMode = settings?.debug_mode ?? false;
        updateSetting("debug_mode", !currentDebugMode);
      }
    };

    // Add event listener when component mounts
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup event listener when component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settings?.debug_mode, updateSetting]);

  const checkOnboardingStatus = async () => {
    try {
      const settingsResult = await commands.getAppSettings();
      const onboardingComplete =
        settingsResult.status === "ok"
          ? Boolean(settingsResult.data.has_completed_onboarding)
          : false;
      setHasCompletedOnboarding(onboardingComplete);

      const currentPermissions = await loadPermissionSnapshot();
      setPermissions(currentPermissions);

      if (!onboardingComplete) {
        setOnboardingStep("welcome");
        return;
      }

      setOnboardingStep(getFirstMissingPermissionStep(currentPermissions) ?? "done");
    } catch (error) {
      console.error("Failed to check onboarding status:", error);
      const fallbackPermissions =
        platform() === "macos"
          ? { accessibility: false, microphone: false }
          : { accessibility: true, microphone: true };
      setPermissions(fallbackPermissions);
      setOnboardingStep("welcome");
    }
  };

  const handleWelcomeContinue = async () => {
    const currentPermissions = await loadPermissionSnapshot();
    setPermissions(currentPermissions);
    setOnboardingStep(getFirstMissingPermissionStep(currentPermissions) ?? "setup");
  };

  const handlePermissionContinue = async () => {
    const currentPermissions = await loadPermissionSnapshot();
    setPermissions(currentPermissions);

    const nextMissingStep = getFirstMissingPermissionStep(currentPermissions);
    if (nextMissingStep) {
      setOnboardingStep(nextMissingStep);
      return;
    }

    setOnboardingStep(hasCompletedOnboarding ? "done" : "setup");
  };

  const handlePracticeComplete = () => {
    setHasCompletedOnboarding(true);
    setOnboardingStep("done");
  };

  // Still checking onboarding status
  if (onboardingStep === null) {
    return toaster;
  }

  if (onboardingStep === "welcome") {
    return (
      <>
        {toaster}
        <Onboarding
          onContinue={handleWelcomeContinue}
          stepLabels={onboardingStepLabels}
          activeStep={0}
        />
      </>
    );
  }

  if (onboardingStep === "microphone_permission") {
    const stepLabels = hasCompletedOnboarding
      ? getRepairStepLabels(permissions)
      : onboardingStepLabels;
    const activeStep = hasCompletedOnboarding ? 0 : 1;

    return (
      <>
        {toaster}
        <PermissionStep
          permission="microphone"
          mode={hasCompletedOnboarding ? "repair" : "onboarding"}
          stepLabels={stepLabels}
          activeStep={activeStep}
          onContinue={handlePermissionContinue}
        />
      </>
    );
  }

  if (onboardingStep === "accessibility_permission") {
    const stepLabels = hasCompletedOnboarding
      ? getRepairStepLabels(permissions)
      : onboardingStepLabels;
    const activeStep = hasCompletedOnboarding
      ? stepLabels.length > 1
        ? 1
        : 0
      : 2;

    return (
      <>
        {toaster}
        <PermissionStep
          permission="accessibility"
          mode={hasCompletedOnboarding ? "repair" : "onboarding"}
          stepLabels={stepLabels}
          activeStep={activeStep}
          onContinue={handlePermissionContinue}
        />
      </>
    );
  }

  if (onboardingStep === "setup") {
    return (
      <>
        {toaster}
        <OnboardingSetup
          onReady={() => setOnboardingStep("practice")}
          stepLabels={onboardingStepLabels}
          activeStep={3}
        />
      </>
    );
  }

  if (onboardingStep === "practice") {
    return (
      <>
        {toaster}
        <OnboardingPractice
          onComplete={handlePracticeComplete}
          stepLabels={onboardingStepLabels}
          activeStep={4}
        />
      </>
    );
  }

  return (
    <>
      {toaster}
      <div
        dir={direction}
        className="relative h-screen overflow-hidden select-none cursor-default bg-transparent text-ss-text-primary"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-ss-brand-highlight/8 via-ss-brand-secondary/4 to-transparent" />
        <div className="pointer-events-none absolute -left-20 top-12 h-48 w-48 rounded-full bg-ss-brand-secondary/10 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full bg-ss-brand-highlight/12 blur-3xl" />

        <div className="relative flex h-full flex-col px-4 py-4">
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-[24px] border border-ss-border-subtle bg-ss-bg-surface/90 shadow-[var(--ss-shadow-lift)] backdrop-blur-sm">
            <Sidebar
              activeSection={currentSection}
              onSectionChange={setCurrentSection}
            />
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <div className="app-content-scroll flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 px-5 py-5">
                  <AccessibilityPermissions />
                  {renderSettingsContent(currentSection)}
                </div>
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    </>
  );
}

export default App;
