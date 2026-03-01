import React, { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        type="button"
        className={`flex min-h-11 min-w-[220px] items-center justify-between gap-2 rounded-[var(--ss-radius-md)] border px-3.5 py-2 text-start text-sm font-medium transition-[background-color,border-color,box-shadow,transform] duration-150 ${
          disabled
            ? "cursor-not-allowed border-ss-border-subtle bg-ss-bg-surface-alt text-ss-text-disabled opacity-70"
            : "cursor-pointer border-ss-border-default bg-ss-bg-elevated text-ss-text-primary hover:-translate-y-0.5 hover:border-ss-brand-secondary/35 hover:bg-ss-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/35"
        }`}
        onClick={handleToggle}
        disabled={disabled}
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
      {isOpen && !disabled && (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 max-h-72 overflow-y-auto rounded-[var(--ss-radius-md)] border border-ss-border-default bg-ss-bg-surface p-1 shadow-[var(--ss-shadow-lift)]">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-ss-text-tertiary">
              {t("common.noOptionsFound")}
            </div>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
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
        </div>
      )}
    </div>
  );
};
