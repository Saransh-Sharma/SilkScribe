import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { platform } from "@tauri-apps/plugin-os";
import {
  checkAccessibilityPermission,
  requestAccessibilityPermission,
  checkMicrophonePermission,
  requestMicrophonePermission,
} from "tauri-plugin-macos-permissions-api";
import { toast } from "sonner";
import { commands } from "@/bindings";
import { useSettingsStore } from "@/stores/settingsStore";
import SilkScribeWordmark from "../icons/SilkScribeWordmark";
import { Keyboard, Mic, Check, Loader2 } from "lucide-react";
import { Button } from "../ui/Button";

interface AccessibilityOnboardingProps {
  onComplete: () => void;
}

type PermissionStatus = "checking" | "needed" | "waiting" | "granted";

interface PermissionsState {
  accessibility: PermissionStatus;
  microphone: PermissionStatus;
}

const AccessibilityOnboarding: React.FC<AccessibilityOnboardingProps> = ({
  onComplete,
}) => {
  const { t } = useTranslation();
  const refreshAudioDevices = useSettingsStore(
    (state) => state.refreshAudioDevices,
  );
  const refreshOutputDevices = useSettingsStore(
    (state) => state.refreshOutputDevices,
  );
  const [isMacOS, setIsMacOS] = useState<boolean | null>(null);
  const [permissions, setPermissions] = useState<PermissionsState>({
    accessibility: "checking",
    microphone: "checking",
  });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorCountRef = useRef<number>(0);
  const MAX_POLLING_ERRORS = 3;

  const allGranted =
    permissions.accessibility === "granted" &&
    permissions.microphone === "granted";

  // Check platform and permission status on mount
  useEffect(() => {
    const currentPlatform = platform();
    const isMac = currentPlatform === "macos";
    setIsMacOS(isMac);

    // Skip immediately on non-macOS - no permissions needed
    if (!isMac) {
      onComplete();
      return;
    }

    // On macOS, check both permissions
    const checkInitial = async () => {
      try {
        const [accessibilityGranted, microphoneGranted] = await Promise.all([
          checkAccessibilityPermission(),
          checkMicrophonePermission(),
        ]);

        // If accessibility is granted, initialize Enigo and shortcuts
        if (accessibilityGranted) {
          try {
            await Promise.all([
              commands.initializeEnigo(),
              commands.initializeShortcuts(),
            ]);
          } catch (e) {
            console.warn("Failed to initialize after permission grant:", e);
          }
        }

        const newState: PermissionsState = {
          accessibility: accessibilityGranted ? "granted" : "needed",
          microphone: microphoneGranted ? "granted" : "needed",
        };

        setPermissions(newState);

        // If both already granted, refresh audio devices and skip ahead
        if (accessibilityGranted && microphoneGranted) {
          await Promise.all([refreshAudioDevices(), refreshOutputDevices()]);
          timeoutRef.current = setTimeout(() => onComplete(), 300);
        }
      } catch (error) {
        console.error("Failed to check permissions:", error);
        toast.error(t("onboarding.permissions.errors.checkFailed"));
        setPermissions({
          accessibility: "needed",
          microphone: "needed",
        });
      }
    };

    checkInitial();
  }, [onComplete, refreshAudioDevices, refreshOutputDevices, t]);

  // Polling for permissions after user clicks a button
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;

    pollingRef.current = setInterval(async () => {
      try {
        const [accessibilityGranted, microphoneGranted] = await Promise.all([
          checkAccessibilityPermission(),
          checkMicrophonePermission(),
        ]);

        setPermissions((prev) => {
          const newState = { ...prev };

          if (accessibilityGranted && prev.accessibility !== "granted") {
            newState.accessibility = "granted";
            // Initialize Enigo and shortcuts when accessibility is granted
            Promise.all([
              commands.initializeEnigo(),
              commands.initializeShortcuts(),
            ]).catch((e) => {
              console.warn("Failed to initialize after permission grant:", e);
            });
          }

          if (microphoneGranted && prev.microphone !== "granted") {
            newState.microphone = "granted";
          }

          return newState;
        });

        // If both granted, stop polling, refresh audio devices, and proceed
        if (accessibilityGranted && microphoneGranted) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          // Now that we have mic permission, refresh audio devices
          await Promise.all([refreshAudioDevices(), refreshOutputDevices()]);
          timeoutRef.current = setTimeout(() => onComplete(), 500);
        }

        // Reset error count on success
        errorCountRef.current = 0;
      } catch (error) {
        console.error("Error checking permissions:", error);
        errorCountRef.current += 1;

        if (errorCountRef.current >= MAX_POLLING_ERRORS) {
          // Stop polling after too many consecutive errors
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          toast.error(t("onboarding.permissions.errors.checkFailed"));
        }
      }
    }, 1000);
  }, [onComplete, refreshAudioDevices, refreshOutputDevices, t]);

  // Cleanup polling and timeouts on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleGrantAccessibility = async () => {
    try {
      await requestAccessibilityPermission();
      setPermissions((prev) => ({ ...prev, accessibility: "waiting" }));
      startPolling();
    } catch (error) {
      console.error("Failed to request accessibility permission:", error);
      toast.error(t("onboarding.permissions.errors.requestFailed"));
    }
  };

  const handleGrantMicrophone = async () => {
    try {
      await requestMicrophonePermission();
      setPermissions((prev) => ({ ...prev, microphone: "waiting" }));
      startPolling();
    } catch (error) {
      console.error("Failed to request microphone permission:", error);
      toast.error(t("onboarding.permissions.errors.requestFailed"));
    }
  };

  // Still checking platform/initial permissions
  if (
    isMacOS === null ||
    (permissions.accessibility === "checking" &&
      permissions.microphone === "checking")
  ) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-ss-text-tertiary" />
      </div>
    );
  }

  // All permissions granted - show success briefly
  if (allGranted) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4">
        <div className="rounded-full bg-ss-brand-highlight/18 p-4">
          <Check className="h-12 w-12 text-ss-brand-highlight" />
        </div>
        <p className="text-lg font-semibold text-ss-text-primary">
          {t("onboarding.permissions.allGranted")}
        </p>
      </div>
    );
  }

  // Show permissions request screen
  return (
    <div className="flex h-screen w-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-[560px] rounded-[28px] border border-ss-border-subtle bg-ss-bg-surface/95 px-6 py-7 shadow-[var(--ss-shadow-lift)] backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="overflow-hidden rounded-[22px] border border-ss-border-subtle bg-ss-bg-surface-alt px-2.5 py-2 shadow-[var(--ss-shadow-card)]">
            <SilkScribeWordmark
              height={68}
              fit="cover"
              className="w-full"
              imageClassName="scale-[1.14]"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2">
          <span className="h-2.5 w-8 rounded-full bg-ss-brand-highlight" />
          <span className="h-2.5 w-2.5 rounded-full bg-ss-brand-highlight/55" />
          <span className="h-2.5 w-2.5 rounded-full bg-ss-border-default" />
        </div>

        <div className="mt-6 flex flex-col items-center gap-4">
          <div className="mb-2 text-center">
            <h2 className="mb-2 text-xl font-semibold text-ss-text-primary">
              {t("onboarding.permissions.title")}
            </h2>
            <p className="text-sm leading-relaxed text-ss-text-tertiary">
              {t("onboarding.permissions.description")}
            </p>
          </div>

          <div className="w-full rounded-[18px] border border-ss-border-subtle bg-ss-bg-surface-alt p-4">
            <div className="flex items-center gap-4">
              <div className="shrink-0 rounded-full bg-ss-brand-highlight/14 p-3">
                <Mic className="h-6 w-6 text-ss-brand-highlight" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-ss-text-primary">
                  {t("onboarding.permissions.microphone.title")}
                </h3>
                <p className="mb-3 text-sm text-ss-text-tertiary">
                  {t("onboarding.permissions.microphone.description")}
                </p>
                {permissions.microphone === "granted" ? (
                  <div className="flex items-center gap-2 text-sm text-ss-brand-highlight">
                    <Check className="h-4 w-4" />
                    {t("onboarding.permissions.granted")}
                  </div>
                ) : permissions.microphone === "waiting" ? (
                  <div className="flex items-center gap-2 text-sm text-ss-text-tertiary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("onboarding.permissions.waiting")}
                  </div>
                ) : (
                  <Button
                    onClick={handleGrantMicrophone}
                    variant="primary"
                    size="md"
                  >
                    {t("onboarding.permissions.grant")}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="w-full rounded-[18px] border border-ss-border-subtle bg-ss-bg-surface-alt p-4">
            <div className="flex items-center gap-4">
              <div className="shrink-0 rounded-full bg-ss-brand-secondary/12 p-3">
                <Keyboard className="h-6 w-6 text-ss-brand-secondary" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-ss-text-primary">
                  {t("onboarding.permissions.accessibility.title")}
                </h3>
                <p className="mb-3 text-sm text-ss-text-tertiary">
                  {t("onboarding.permissions.accessibility.description")}
                </p>
                {permissions.accessibility === "granted" ? (
                  <div className="flex items-center gap-2 text-sm text-ss-brand-highlight">
                    <Check className="h-4 w-4" />
                    {t("onboarding.permissions.granted")}
                  </div>
                ) : permissions.accessibility === "waiting" ? (
                  <div className="flex items-center gap-2 text-sm text-ss-text-tertiary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("onboarding.permissions.waiting")}
                  </div>
                ) : (
                  <Button
                    onClick={handleGrantAccessibility}
                    variant="secondary"
                    size="md"
                  >
                    {t("onboarding.permissions.grant")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccessibilityOnboarding;
