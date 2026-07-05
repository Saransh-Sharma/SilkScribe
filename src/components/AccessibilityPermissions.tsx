import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { checkAccessibilityPermission } from "tauri-plugin-macos-permissions-api";
import {
  getErrorMessage,
  PermissionStatusCard,
  type PermissionStatus,
} from "./onboarding/PermissionStep";
import { Button } from "./ui/Button";

interface AccessibilityPermissionsProps {
  onStartRepair: () => void;
}

const AccessibilityPermissions: React.FC<AccessibilityPermissionsProps> = ({
  onStartRepair,
}) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PermissionStatus>("checking");
  const [error, setError] = useState<string | null>(null);

  const isMacOS = type() === "macos";

  const checkPermissions = async (): Promise<void> => {
    if (!isMacOS) return;

    setStatus("checking");
    setError(null);

    try {
      const hasPermissions = await checkAccessibilityPermission();
      setStatus(hasPermissions ? "granted" : "needed");
    } catch (permissionError) {
      console.error(
        "Error checking accessibility permissions:",
        permissionError,
      );
      setError(getErrorMessage(permissionError));
      setStatus("error");
    }
  };

  useEffect(() => {
    void checkPermissions();
  }, [isMacOS]);

  if (!isMacOS || status === "granted") {
    return null;
  }

  return (
    <section className="w-full rounded-[var(--ss-radius-lg)] border border-ss-border-subtle bg-ss-bg-surface p-4 shadow-[var(--ss-shadow-card)]">
      <PermissionStatusCard
        permission="accessibility"
        status={status}
        error={error}
      />
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          onClick={onStartRepair}
          variant="primary-soft"
          size="sm"
        >
          {t("onboarding.permissions.shared.repairAction")}
        </Button>
        <Button
          type="button"
          onClick={() => void checkPermissions()}
          variant="secondary"
          size="sm"
        >
          {t("onboarding.permissions.shared.checkAgain")}
        </Button>
      </div>
    </section>
  );
};

export default AccessibilityPermissions;
