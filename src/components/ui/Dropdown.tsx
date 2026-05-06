import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  className?: string;
  selectedValue: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onRefresh?: () => void;
}

interface DropdownMenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "top" | "bottom";
}

const VIEWPORT_PADDING = 12;
const MENU_GAP = 8;
const DEFAULT_MENU_HEIGHT = 160;
const MAX_MENU_HEIGHT = 288;

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  selectedValue,
  onSelect,
  className = "",
  placeholder = "Select an option...",
  disabled = false,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [menuPosition, setMenuPosition] =
    useState<DropdownMenuPosition | null>(null);

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const measuredMenuHeight =
      menuRef.current?.offsetHeight ??
      Math.min(
        DEFAULT_MENU_HEIGHT + Math.max(options.length - 2, 0) * 36,
        MAX_MENU_HEIGHT,
      );

    const spaceBelow = Math.max(
      0,
      window.innerHeight - triggerRect.bottom - MENU_GAP - VIEWPORT_PADDING,
    );
    const spaceAbove = Math.max(
      0,
      triggerRect.top - MENU_GAP - VIEWPORT_PADDING,
    );

    const placement =
      spaceBelow >= measuredMenuHeight || spaceBelow >= spaceAbove
        ? "bottom"
        : "top";
    const availableHeight = placement === "bottom" ? spaceBelow : spaceAbove;
    const maxHeight = Math.min(MAX_MENU_HEIGHT, availableHeight);
    const renderedHeight = Math.min(measuredMenuHeight, maxHeight);
    const maxLeft = Math.max(
      VIEWPORT_PADDING,
      window.innerWidth - triggerRect.width - VIEWPORT_PADDING,
    );
    const left = Math.min(
      Math.max(triggerRect.left, VIEWPORT_PADDING),
      maxLeft,
    );
    const top =
      placement === "bottom"
        ? triggerRect.bottom + MENU_GAP
        : Math.max(
            VIEWPORT_PADDING,
            triggerRect.top - MENU_GAP - renderedHeight,
          );

    setMenuPosition({
      top,
      left,
      width: triggerRect.width,
      maxHeight,
      placement,
    });
  }, [options.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        dropdownRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }

      setIsOpen(false);
    };

    if (!isOpen) return;

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || disabled) return;

    updateMenuPosition();

    const animationFrame = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [disabled, isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const selectedOption = options.find(
    (option) => option.value === selectedValue,
  );

  const handleSelect = (value: string) => {
    onSelect(value);
    setIsOpen(false);
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen && onRefresh) onRefresh();
    setIsOpen(!isOpen);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`flex min-h-11 min-w-[220px] items-center justify-between gap-2 rounded-[var(--ss-radius-md)] border px-3.5 py-2 text-start text-sm font-medium transition-[background-color,border-color,box-shadow,transform] duration-150 ${
          disabled
            ? "cursor-not-allowed border-ss-border-subtle bg-ss-bg-surface-alt text-ss-text-disabled opacity-70"
            : "cursor-pointer border-ss-border-default bg-ss-bg-elevated text-ss-text-primary hover:-translate-y-0.5 hover:border-ss-brand-secondary/35 hover:bg-ss-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/35"
        }`}
        onClick={handleToggle}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-haspopup="listbox"
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <svg
          className={`w-4 h-4 ms-2 transition-transform duration-200 ${isOpen ? "transform rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen && !disabled && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              aria-label={selectedOption?.label || placeholder}
              className="overflow-y-auto overscroll-contain rounded-[var(--ss-radius-md)] border border-ss-border-default bg-ss-bg-surface p-1 shadow-[var(--ss-shadow-lift)] transition-[opacity,transform] duration-150"
              style={{
                position: "fixed",
                top: menuPosition?.top ?? -9999,
                left: menuPosition?.left ?? -9999,
                width: menuPosition?.width,
                maxHeight: menuPosition?.maxHeight,
                zIndex: 9999,
                opacity: menuPosition ? 1 : 0,
                transform:
                  menuPosition?.placement === "top"
                    ? "translateY(-2px)"
                    : "translateY(2px)",
              }}
            >
              {options.length === 0 ? (
                <div className="px-3 py-2 text-sm text-ss-text-tertiary">
                  {t("common.noOptionsFound")}
                </div>
              ) : (
                options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selectedValue === option.value}
                    className={`w-full rounded-[10px] px-3 py-2 text-start text-sm transition-colors duration-150 ${
                      selectedValue === option.value
                        ? "bg-ss-brand-secondary/14 font-semibold text-ss-brand-secondary"
                        : "text-ss-text-secondary hover:bg-ss-bg-surface-alt hover:text-ss-text-primary"
                    } ${option.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                    onClick={() => handleSelect(option.value)}
                    disabled={option.disabled}
                  >
                    <span className="truncate">{option.label}</span>
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};
