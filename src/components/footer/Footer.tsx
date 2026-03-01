import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";

import ModelSelector from "../model-selector";
import UpdateChecker from "../update-checker";

const Footer: React.FC = () => {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.1.2");
      }
    };

    fetchVersion();
  }, []);

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3 rounded-[20px] border border-ss-border-subtle bg-ss-bg-surface px-4 py-3 text-xs text-ss-text-tertiary shadow-[var(--ss-shadow-card)]">
        <div className="flex min-w-0 items-center gap-4">
          <ModelSelector />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <UpdateChecker />
          <span className="text-ss-border-strong">•</span>
          <span className="rounded-full border border-ss-border-subtle bg-ss-bg-surface-alt px-2.5 py-1 font-mono text-[11px] text-ss-text-secondary">
            {version
              ? t("common.versionLabel", { version })
              : t("common.loading")}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Footer;
