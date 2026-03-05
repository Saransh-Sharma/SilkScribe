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
import Onboarding, { AccessibilityOnboarding } from "./components/onboarding";
import { Sidebar, SidebarSection, SECTIONS_CONFIG } from "./components/Sidebar";
import { useSettings } from "./hooks/useSettings";
import { useSettingsStore } from "./stores/settingsStore";
import { commands } from "@/bindings";
import { getLanguageDirection, initializeRTL } from "@/lib/utils/rtl";

type OnboardingStep = "accessibility" | "guided_setup" | "done";

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

  // Initialize shortcuts and input handling once onboarding reaches an interactive step.
  useEffect(() => {
    if (
      onboardingStep !== null &&
      onboardingStep !== "accessibility" &&
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

      if (platform() === "macos") {
        try {
          const [hasAccessibility, hasMicrophone] = await Promise.all([
            checkAccessibilityPermission(),
            checkMicrophonePermission(),
          ]);
          if (!hasAccessibility || !hasMicrophone) {
            setOnboardingStep("accessibility");
            return;
          }
        } catch (e) {
          console.warn("Failed to check permissions:", e);
        }
      }

      setOnboardingStep(onboardingComplete ? "done" : "guided_setup");
    } catch (error) {
      console.error("Failed to check onboarding status:", error);
      setOnboardingStep(
        platform() === "macos" ? "accessibility" : "guided_setup",
      );
    }
  };

  const handleAccessibilityComplete = () => {
    setOnboardingStep(hasCompletedOnboarding ? "done" : "guided_setup");
  };

  const handleOnboardingComplete = () => {
    setHasCompletedOnboarding(true);
    setOnboardingStep("done");
  };

  // Still checking onboarding status
  if (onboardingStep === null) {
    return toaster;
  }

  if (onboardingStep === "accessibility") {
    return (
      <>
        {toaster}
        <AccessibilityOnboarding onComplete={handleAccessibilityComplete} />
      </>
    );
  }

  if (onboardingStep === "guided_setup") {
    return (
      <>
        {toaster}
        <Onboarding onComplete={handleOnboardingComplete} />
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
                <div className="mx-auto flex w-full max-w-[860px] flex-col gap-5 px-5 py-5">
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
