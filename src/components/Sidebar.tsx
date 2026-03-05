import React from "react";
import { useTranslation } from "react-i18next";
import {
  Cog,
  Cpu,
  FlaskConical,
  History,
  Home as HomeIcon,
  Info,
  Sparkles,
} from "lucide-react";
import SilkScribeWordmark from "./icons/SilkScribeWordmark";
import SilkScribeMark from "./icons/SilkScribeMark";
import HomeDashboard from "./home/HomeDashboard";
import { useSettings } from "../hooks/useSettings";
import {
  GeneralSettings,
  AdvancedSettings,
  HistorySettings,
  DebugSettings,
  AboutSettings,
  PostProcessingSettings,
  ModelsSettings,
} from "./settings";

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

interface IconProps {
  width?: number | string;
  height?: number | string;
  size?: number | string;
  className?: string;
  [key: string]: any;
}

interface SectionConfig {
  labelKey: string;
  icon: React.ComponentType<IconProps>;
  component: React.ComponentType;
  enabled: (settings: any) => boolean;
}

export const SECTIONS_CONFIG = {
  home: {
    labelKey: "sidebar.home",
    icon: HomeIcon,
    component: HomeDashboard,
    enabled: () => true,
  },
  general: {
    labelKey: "sidebar.general",
    icon: SilkScribeMark,
    component: GeneralSettings,
    enabled: () => true,
  },
  models: {
    labelKey: "sidebar.models",
    icon: Cpu,
    component: ModelsSettings,
    enabled: () => true,
  },
  advanced: {
    labelKey: "sidebar.advanced",
    icon: Cog,
    component: AdvancedSettings,
    enabled: () => true,
  },
  postprocessing: {
    labelKey: "sidebar.postProcessing",
    icon: Sparkles,
    component: PostProcessingSettings,
    enabled: (settings) => settings?.post_process_enabled ?? false,
  },
  history: {
    labelKey: "sidebar.history",
    icon: History,
    component: HistorySettings,
    enabled: () => true,
  },
  debug: {
    labelKey: "sidebar.debug",
    icon: FlaskConical,
    component: DebugSettings,
    enabled: (settings) => settings?.debug_mode ?? false,
  },
  about: {
    labelKey: "sidebar.about",
    icon: Info,
    component: AboutSettings,
    enabled: () => true,
  },
} as const satisfies Record<string, SectionConfig>;

interface SidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();

  const availableSections = Object.entries(SECTIONS_CONFIG)
    .filter(([_, config]) => config.enabled(settings))
    .map(([id, config]) => ({ id: id as SidebarSection, ...config }));

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-e border-ss-border-subtle bg-ss-bg-surface-alt/70 px-4 py-5">
      <div className="flex items-center justify-center overflow-hidden rounded-[20px] border border-ss-border-subtle bg-ss-bg-surface px-2 py-2 shadow-[var(--ss-shadow-card)]">
        <SilkScribeWordmark
          height={46}
          fit="cover"
          className="w-full shrink-0"
          imageClassName="scale-[1.12]"
        />
      </div>
      <div className="mt-5 flex flex-1 flex-col gap-1.5">
        {availableSections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;

          return (
            <button
              type="button"
              key={section.id}
              className={`group flex min-h-11 w-full items-center gap-3 rounded-[var(--ss-radius-md)] border px-3 py-2 text-left transition-[background-color,border-color,color,transform] duration-200 ${
                isActive
                  ? "border-ss-brand-secondary/50 bg-ss-brand-secondary/12 text-ss-text-primary shadow-[inset_0_0_0_1px_rgba(0,0,0,0.02)]"
                  : "border-transparent text-ss-text-secondary hover:-translate-y-0.5 hover:border-ss-border-subtle hover:bg-ss-bg-surface"
              }`}
              onClick={() => onSectionChange(section.id)}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  isActive
                    ? "bg-ss-brand-secondary/16 text-ss-brand-secondary"
                    : "bg-ss-bg-elevated text-ss-text-tertiary group-hover:text-ss-brand-secondary"
                }`}
              >
                <Icon width={18} height={18} className="shrink-0" />
              </span>
              <span
                className="truncate text-sm font-semibold tracking-[0.01em]"
                title={t(section.labelKey)}
              >
                {t(section.labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
