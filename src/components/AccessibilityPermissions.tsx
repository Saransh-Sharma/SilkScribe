import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import {
  checkAccessibilityPermission,
  requestAccessibilityPermission,
} from "tauri-plugin-macos-permissions-api";
import { Button } from "./ui/Button";

// Define permission state type
type PermissionState = "request" | "verify" | "granted";

const AccessibilityPermissions: React.FC = () => {
  const { t } = useTranslation();
  const [hasAccessibility, setHasAccessibility] = useState<boolean>(false);
  const [permissionState, setPermissionState] =
    useState<PermissionState>("request");

  // Accessibility permissions are only required on macOS
  const isMacOS = type() === "macos";

  // Check permissions without requesting
  const checkPermissions = async (): Promise<boolean> => {
    const hasPermissions: boolean = await checkAccessibilityPermission();
    setHasAccessibility(hasPermissions);
    setPermissionState(hasPermissions ? "granted" : "verify");
    return hasPermissions;
  };

  // Open the macOS approval flow, then wait for the user to come back
  const requestPermission = async (): Promise<void> => {
    try {
      await requestAccessibilityPermission();
      setPermissionState("verify");
    } catch (error) {
      console.error("Error requesting permissions:", error);
      setPermissionState("verify");
    }
  };

  // Re-check whether the permission was granted in System Settings
  const handleButtonClick = async (): Promise<void> => {
    await checkPermissions();
  };

  // On app boot - check permissions (only on macOS)
  useEffect(() => {
    if (!isMacOS) return;

    const initialSetup = async (): Promise<void> => {
      const hasPermissions: boolean = await checkAccessibilityPermission();
      setHasAccessibility(hasPermissions);
      setPermissionState(hasPermissions ? "granted" : "request");
    };

    initialSetup();
  }, [isMacOS]);

  // Skip rendering on non-macOS platforms or if permission is already granted
  if (!isMacOS || hasAccessibility) {
    return null;
  }

  return (
    <div className="w-full rounded-[18px] border border-ss-border-subtle bg-ss-bg-surface px-4 py-4 shadow-[var(--ss-shadow-card)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-relaxed text-ss-text-primary">
            {t("onboarding.permissions.accessibility.description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end">
          {permissionState === "verify" ? (
            <Button
              onClick={() => void handleButtonClick()}
              variant="secondary"
              size="sm"
            >
              {t("onboarding.permissions.shared.checkAgain")}
            </Button>
          ) : null}
          <Button
            onClick={() => void requestPermission()}
            variant="primary-soft"
            size="sm"
          >
            {t("onboarding.permissions.accessibility.primaryAction")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AccessibilityPermissions;
