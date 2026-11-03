import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  commands,
  type AppCategory,
  type DictationStyle,
  type RecentApp,
} from "@/bindings";
import { useSettings } from "../../hooks/useSettings";
import { toastError } from "@/lib/utils/toastError";
import { Dropdown, SettingContainer, SettingsGroup, ToggleSwitch } from "../ui";

const TONED: AppCategory[] = ["messaging", "email", "documents", "other"];
const FIXED: AppCategory[] = ["code", "ai_chat"];
const ALL: AppCategory[] = [...TONED.slice(0, 3), ...FIXED, "other"];
const DEFAULT_TONE: Partial<Record<AppCategory, DictationStyle>> = {
  messaging: "casual",
  email: "formal",
};

/** How AI cleanup writes for each kind of app (Slack vs Mail vs an editor),
 * and which kind each app you've dictated into counts as. */
export const DictationStyles: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating, refreshSettings } =
    useSettings();
  const enabled = getSetting("per_app_styles") ?? true;
  const styles = getSetting("app_styles") ?? {};
  const overrides = getSetting("app_category_overrides") ?? {};
  const [apps, setApps] = useState<RecentApp[]>([]);

  useEffect(() => {
    if (!enabled) return;
    void commands
      .recentDictationApps()
      .then((result) => {
        if (result.status === "ok") setApps(result.data);
      })
      .catch(() => {});
  }, [enabled]);

  // Styles shape AI cleanup; without it there's nothing to adjust yet, but
  // say they exist rather than hide them.
  if (!(getSetting("post_process_enabled") ?? false))
    return (
      <SettingsGroup title={t("settings.styles.title")}>
        <p className="px-4 py-3 text-sm text-ss-text-secondary">
          {t("settings.styles.needsCleanup")}
        </p>
      </SettingsGroup>
    );

  const save = async (request: Promise<{ status: string; error?: string }>) => {
    try {
      const result = await request;
      if (result.status === "error") throw new Error(result.error);
      await refreshSettings();
    } catch (error) {
      toastError(t("workspace.errors.saveStyle"), error);
    }
  };

  const toneOptions = (["casual", "neutral", "formal"] as const).map(
    (tone) => ({ value: tone, label: t(`settings.styles.tones.${tone}`) }),
  );
  const categoryOptions = ALL.map((category) => ({
    value: category,
    label: t(`settings.styles.categories.${category}`),
  }));

  return (
    <SettingsGroup title={t("settings.styles.title")}>
      <ToggleSwitch
        checked={enabled}
        onChange={(value) => void updateSetting("per_app_styles", value)}
        isUpdating={isUpdating("per_app_styles")}
        label={t("settings.styles.enable.label")}
        description={t("settings.styles.enable.description")}
        descriptionMode="inline"
        grouped
      />
      {enabled && (
        <>
          {TONED.map((category) => (
            <SettingContainer
              key={category}
              title={t(`settings.styles.categories.${category}`)}
              descriptionMode="inline"
              layout="horizontal"
              grouped
            >
              <Dropdown
                ariaLabel={t(`settings.styles.categories.${category}`)}
                options={toneOptions}
                selectedValue={
                  styles[category] ?? DEFAULT_TONE[category] ?? "neutral"
                }
                onSelect={(tone) =>
                  void save(
                    commands.changeAppStyleSetting(
                      category,
                      tone as DictationStyle,
                    ),
                  )
                }
              />
            </SettingContainer>
          ))}
          {FIXED.map((category) => (
            <SettingContainer
              key={category}
              title={t(`settings.styles.categories.${category}`)}
              description={t(`settings.styles.fixed.${category}`)}
              descriptionMode="inline"
              grouped
            >
              <span />
            </SettingContainer>
          ))}
          {apps.length > 0 && (
            <SettingContainer
              title={t("settings.styles.apps.title")}
              description={t("settings.styles.apps.description")}
              descriptionMode="inline"
              layout="stacked"
              grouped
            >
              <ul className="flex flex-col gap-2">
                {apps.map((app) => (
                  <li
                    key={app.bundle_id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0 truncate text-sm text-ss-text-primary">
                      {app.name}
                    </span>
                    <Dropdown
                      ariaLabel={app.name}
                      options={[
                        {
                          value: "",
                          label: t("settings.styles.apps.builtIn"),
                        },
                        ...categoryOptions,
                      ]}
                      selectedValue={overrides[app.bundle_id] ?? ""}
                      onSelect={(value) =>
                        void save(
                          commands.changeAppCategoryOverride(
                            app.bundle_id,
                            (value || null) as AppCategory | null,
                          ),
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            </SettingContainer>
          )}
        </>
      )}
    </SettingsGroup>
  );
};
