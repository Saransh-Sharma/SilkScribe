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

  // Handle the unified button action based on current state
  const handleButtonClick = async (): Promise<void> => {
    if (permissionState === "request") {
      try {
        await requestAccessibilityPermission();
        // After system prompt, transition to verification state
        setPermissionState("verify");
      } catch (error) {
        console.error("Error requesting permissions:", error);
        setPermissionState("verify");
      }
    } else if (permissionState === "verify") {
      // State is "verify" - check if permission was granted
      await checkPermissions();
    }
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

  // Configure button text and style based on state
  const buttonConfig: Record<
    PermissionState,
    | {
        text: string;
        variant: "primary-soft" | "secondary";
      }
    | null
  > = {
    request: {
      text: t("accessibility.openSettings"),
      variant: "primary-soft",
    },
    verify: {
      text: t("accessibility.openSettings"),
      variant: "secondary",
    },
    granted: null,
  };

  const config = buttonConfig[permissionState];

  return (
    <div className="w-full rounded-[18px] border border-ss-border-subtle bg-ss-bg-surface px-4 py-4 shadow-[var(--ss-shadow-card)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-relaxed text-ss-text-primary">
            {t("accessibility.permissionsDescription")}
          </p>
        </div>
        <Button
          onClick={handleButtonClick}
          variant={config?.variant}
          size="sm"
          className="min-w-[11rem] md:shrink-0"
        >
          {config?.text}
        </Button>
      </div>
    </div>
  );
};

export default AccessibilityPermissions;
