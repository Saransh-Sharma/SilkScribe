import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { ChevronDown, FolderOpen, Logs } from "lucide-react";
import { commands } from "@/bindings";
import ModelSelector from "../model-selector";
import UpdateChecker from "../update-checker";

const FooterUtilityMenu = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const actions = [
    {
      key: "appData",
      icon: FolderOpen,
      label: t("footer.support.appData"),
      onClick: async () => {
        await commands.openAppDataDir();
      },
    },
    {
      key: "logs",
      icon: Logs,
      label: t("footer.support.logs"),
      onClick: async () => {
        await commands.openLogDir();
      },
    },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-ss-border-subtle bg-ss-bg-surface-alt px-3 text-xs font-semibold text-ss-text-secondary transition-colors duration-150 hover:border-ss-brand-secondary/30 hover:text-ss-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/35"
      >
        {t("footer.support.label")}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen ? (
        <div className="absolute bottom-[calc(100%+0.5rem)] right-0 z-50 min-w-[180px] overflow-hidden rounded-[16px] border border-ss-border-default bg-ss-bg-surface p-1 shadow-[var(--ss-shadow-lift)]">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-sm text-ss-text-secondary transition-colors duration-150 hover:bg-ss-bg-surface-alt hover:text-ss-text-primary"
                onClick={() => {
                  void action.onClick();
                  setIsOpen(false);
                }}
              >
                <Icon className="h-4 w-4" />
                {action.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

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

    void fetchVersion();
  }, []);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-ss-border-subtle bg-[color-mix(in_srgb,var(--ss-bg-surface)_82%,transparent)] px-3.5 py-2.5 text-xs text-ss-text-tertiary shadow-[var(--ss-shadow-card)]">
        <div className="min-w-0 flex items-center gap-3">
          <ModelSelector />
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <UpdateChecker />
          <span className="rounded-full border border-ss-border-subtle bg-ss-bg-surface-alt px-2.5 py-1 font-mono text-[11px] text-ss-text-secondary">
            {version
              ? t("common.versionLabel", { version })
              : t("common.loading")}
          </span>
          <FooterUtilityMenu />
        </div>
      </div>
    </div>
  );
};

export default Footer;
