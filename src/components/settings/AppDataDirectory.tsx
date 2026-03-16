import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { SettingContainer } from "../ui/SettingContainer";
import { PathDisplay } from "../ui/PathDisplay";

interface AppDataDirectoryProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

export const AppDataDirectory: React.FC<AppDataDirectoryProps> = ({
  descriptionMode = "inline",
  grouped = false,
}) => {
  const { t } = useTranslation();
  const [appDirPath, setAppDirPath] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAppDirectory = async () => {
      try {
        const result = await commands.getAppDirPath();
        if (result.status === "ok") {
          setAppDirPath(result.data);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load app directory",
        );
      } finally {
        setLoading(false);
      }
    };

    loadAppDirectory();
  }, []);

  const handleOpen = async () => {
    if (!appDirPath) return;
    try {
      await commands.openAppDataDir();
    } catch (openError) {
      console.error("Failed to open app data directory:", openError);
    }
  };

  if (loading) {
    return (
      <SettingContainer
        title={t("settings.about.appDataDirectory.title")}
        description={t("settings.about.appDataDirectory.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
        layout="stacked"
      >
        <div className="animate-pulse">
          <div className="mb-2 h-4 w-1/3 rounded bg-ss-bg-surface-alt" />
          <div className="h-8 rounded bg-ss-bg-surface-alt" />
        </div>
      </SettingContainer>
    );
  }

  if (error) {
    return (
      <SettingContainer
        title={t("settings.about.appDataDirectory.title")}
        description={t("settings.about.appDataDirectory.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
        layout="stacked"
      >
        <div className="rounded-[var(--ss-radius-md)] border border-ss-state-danger/20 bg-ss-state-danger/8 px-3 py-3 text-sm text-ss-state-danger">
          {t("errors.loadDirectory", { error })}
        </div>
      </SettingContainer>
    );
  }

  return (
    <SettingContainer
      title={t("settings.about.appDataDirectory.title")}
      description={t("settings.about.appDataDirectory.description")}
      descriptionMode={descriptionMode}
      grouped={grouped}
      layout="stacked"
    >
      <PathDisplay
        path={appDirPath}
        onOpen={handleOpen}
        disabled={!appDirPath}
      />
    </SettingContainer>
  );
};
