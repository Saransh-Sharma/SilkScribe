import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { commands } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { toastError } from "@/lib/utils/toastError";
import { SettingsGroup } from "../ui/SettingsGroup";
import { ToggleSwitch } from "../ui/ToggleSwitch";

/** The config an MCP client needs to start SilkScribe's server. */
export const mcpConfig = (command: string, args: string[]) =>
  JSON.stringify({ mcpServers: { silkscribe: { command, args } } }, null, 2);

/** Let AI apps that speak MCP (Claude, Cursor…) read the library. */
export const McpSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const enabled = getSetting("mcp_enabled") ?? false;
  const [config, setConfig] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    commands
      .mcpLaunchCommand()
      .then((result) => {
        if (result.status === "ok")
          setConfig(mcpConfig(result.data.command, result.data.args));
      })
      .catch(() => setConfig(null));
  }, [enabled]);

  return (
    <SettingsGroup title={t("settings.mcp.title")}>
      <ToggleSwitch
        checked={enabled}
        onChange={(value) => void updateSetting("mcp_enabled", value)}
        isUpdating={isUpdating("mcp_enabled")}
        label={t("settings.mcp.label")}
        description={t("settings.mcp.description")}
        descriptionMode="inline"
        grouped
      />
      {enabled && config && (
        <div className="space-y-2 px-4 py-3">
          <p className="text-sm text-ss-text-secondary">
            {t("settings.mcp.setup")}
          </p>
          <pre
            className="overflow-x-auto rounded-[var(--ss-radius-sm)] bg-ss-bg-surface-alt p-3 text-xs"
            dir="ltr"
          >
            <code>{config}</code>
          </pre>
          <button
            type="button"
            className="ws-secondary"
            onClick={() =>
              writeText(config)
                .then(() => toast.success(t("settings.mcp.copied")))
                .catch((error) =>
                  toastError(t("settings.mcp.copyFailed"), error),
                )
            }
          >
            {t("settings.mcp.copy")}
          </button>
        </div>
      )}
    </SettingsGroup>
  );
};
