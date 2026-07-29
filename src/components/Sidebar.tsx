import React from "react";
import { useTranslation } from "react-i18next";
import {
  Cog,
  Cpu,
  FlaskConical,
  History,
  Home as HomeIcon,
  Sparkles,
} from "lucide-react";
import SilkScribeWordmark from "./icons/SilkScribeWordmark";
import SilkScribeMark from "./icons/SilkScribeMark";
import Footer from "./footer";
import HomeDashboard from "./home/HomeDashboard";
import { useSettings } from "../hooks/useSettings";
import {
  GeneralSettings,
  AdvancedSettings,
  HistorySettings,
  DebugSettings,
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
  component: React.ComponentType<any>;
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

  const primarySections = availableSections.filter(
    (section) => section.id === "home",
  );
  const secondarySections = availableSections.filter(
    (section) => section.id !== "home" && section.id !== "debug",
  );
  const developerSections = availableSections.filter(
    (section) => section.id === "debug",
  );

  const renderSectionList = (
    sections: typeof availableSections,
    labelKey?: string,
  ) => (
    <div className="space-y-2">
      {labelKey ? (
        <p className="px-3.5 text-[10px] font-bold uppercase tracking-[0.2em] text-ss-text-tertiary/80">
          {t(labelKey)}
        </p>
      ) : null}
      <nav
        className="flex flex-col gap-1.5"
        aria-label={labelKey ? t(labelKey) : t("sidebar.home")}
      >
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;

          return (
            <button
              type="button"
              key={section.id}
              className={`ss-nav-item group relative flex min-h-11 w-full items-center gap-3 overflow-hidden rounded-[var(--ss-radius-md)] border px-3 py-2 text-left transition-[background-color,border-color,color,transform] duration-200 ${
                isActive
                  ? "is-active border-ss-brand-secondary/18 bg-ss-bg-elevated text-ss-text-primary shadow-[var(--ss-shadow-card)]"
                  : "border-transparent text-ss-text-secondary hover:translate-x-0.5 hover:border-ss-border-subtle hover:bg-ss-bg-surface/55 rtl:hover:-translate-x-0.5"
              }`}
              onClick={() => onSectionChange(section.id)}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={`relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] transition-[background-color,color,transform] duration-200 ${
                  isActive
                    ? "scale-[1.03] bg-ss-brand-secondary text-ss-brand-secondary-ink shadow-[inset_0_1px_0_rgba(255,255,255,.22)]"
                    : "bg-ss-bg-elevated/75 text-ss-text-tertiary group-hover:text-ss-brand-secondary"
                }`}
              >
                <Icon width={18} height={18} className="shrink-0" />
              </span>
              <span
                className="relative z-[1] truncate text-[13px] font-semibold tracking-[-0.005em]"
                title={t(section.labelKey)}
              >
                {t(section.labelKey)}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );

  return (
    <aside className="ss-sidebar flex h-full w-[248px] shrink-0 flex-col border-e border-ss-border-subtle px-3.5 pb-3 pt-4">
      <div className="ss-sidebar-brand flex items-center overflow-hidden rounded-[20px] px-2.5 py-2">
        <SilkScribeWordmark
          height={38}
          fit="cover"
          className="w-full shrink-0 text-[20px]"
        />
      </div>
      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-0.5">
        {renderSectionList(primarySections)}
        {secondarySections.length > 0
          ? renderSectionList(secondarySections, "sidebar.preferences")
          : null}
        {developerSections.length > 0
          ? renderSectionList(developerSections, "sidebar.developer")
          : null}
      </div>
      <Footer />
    </aside>
  );
};
