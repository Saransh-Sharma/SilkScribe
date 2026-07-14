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
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
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
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex min-h-9 w-full items-center justify-between gap-1.5 rounded-[var(--ss-radius-sm)] border border-transparent px-2.5 text-xs font-semibold text-ss-text-tertiary transition-colors duration-150 hover:border-ss-border-subtle hover:bg-ss-bg-surface hover:text-ss-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/35"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {t("footer.support.label")}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen ? (
        <div
          className="absolute bottom-[calc(100%+0.5rem)] start-0 z-[var(--ss-layer-dropdown)] min-w-[200px] overflow-hidden rounded-[var(--ss-radius-md)] border border-ss-border-default bg-ss-bg-surface p-1 shadow-[var(--ss-shadow-lift)]"
          role="menu"
        >
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
                role="menuitem"
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
    <footer className="mt-3 border-t border-ss-border-subtle pt-3 text-xs text-ss-text-tertiary">
      <div className="space-y-2 rounded-[var(--ss-radius-md)] bg-[color-mix(in_srgb,var(--ss-bg-surface)_58%,transparent)] p-2 shadow-[var(--ss-shadow-hairline)]">
        <div className="min-w-0 overflow-visible">
          <ModelSelector />
        </div>
        <div className="flex min-h-7 items-center justify-between gap-2 px-1">
          <UpdateChecker className="min-w-0 text-[11px]" />
          <span className="shrink-0 font-mono text-[10px] text-ss-text-tertiary">
            {version
              ? t("common.versionLabel", { version })
              : t("common.loading")}
          </span>
        </div>
        <FooterUtilityMenu />
      </div>
    </footer>
  );
};

export default Footer;
