import React from "react";
import SelectComponent from "react-select";
import CreatableSelect from "react-select/creatable";
import type {
  ActionMeta,
  Props as ReactSelectProps,
  SingleValue,
  StylesConfig,
} from "react-select";

export type SelectOption = {
  value: string;
  label: string;
  isDisabled?: boolean;
};

type BaseProps = {
  value: string | null;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  isClearable?: boolean;
  onChange: (value: string | null, action: ActionMeta<SelectOption>) => void;
  onBlur?: () => void;
  className?: string;
  formatCreateLabel?: (input: string) => string;
};

type CreatableProps = {
  isCreatable: true;
  onCreateOption: (value: string) => void;
};

type NonCreatableProps = {
  isCreatable?: false;
  onCreateOption?: never;
};

export type SelectProps = BaseProps & (CreatableProps | NonCreatableProps);

const baseBackground =
  "var(--ss-bg-elevated)";
const hoverBackground =
  "color-mix(in srgb, var(--ss-brand-secondary) 10%, var(--ss-bg-surface))";
const focusBackground =
  "color-mix(in srgb, var(--ss-brand-secondary) 14%, var(--ss-bg-surface))";
const neutralBorder = "var(--ss-border-default)";

const selectStyles: StylesConfig<SelectOption, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: 44,
    borderRadius: 14,
    borderColor: state.isFocused ? "var(--ss-brand-secondary)" : neutralBorder,
    boxShadow: state.isFocused
      ? "0 0 0 3px color-mix(in srgb, var(--ss-action-focus) 28%, transparent)"
      : "none",
    backgroundColor: state.isFocused ? focusBackground : baseBackground,
    fontSize: "0.875rem",
    color: "var(--ss-text-primary)",
    transition: "all 150ms ease",
    cursor: state.isDisabled ? "not-allowed" : "pointer",
    ":hover": {
      borderColor: "color-mix(in srgb, var(--ss-brand-secondary) 35%, var(--ss-border-default))",
      backgroundColor: hoverBackground,
    },
  }),
  valueContainer: (base) => ({
    ...base,
    paddingInline: 12,
    paddingBlock: 4,
  }),
  input: (base) => ({
    ...base,
    color: "var(--ss-text-primary)",
  }),
  singleValue: (base) => ({
    ...base,
    color: "var(--ss-text-primary)",
  }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color: state.isFocused
      ? "var(--ss-brand-secondary)"
      : "var(--ss-text-tertiary)",
    ":hover": {
      color: "var(--ss-brand-secondary)",
    },
  }),
  clearIndicator: (base) => ({
    ...base,
    color: "var(--ss-text-tertiary)",
    ":hover": {
      color: "var(--ss-brand-secondary)",
    },
  }),
  menu: (provided) => ({
    ...provided,
    zIndex: 30,
    marginTop: 8,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "var(--ss-bg-surface)",
    color: "var(--ss-text-primary)",
    border: "1px solid var(--ss-border-default)",
    boxShadow: "var(--ss-shadow-lift)",
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? focusBackground
      : state.isFocused
        ? hoverBackground
        : "transparent",
    color: state.isSelected ? "var(--ss-brand-secondary)" : "var(--ss-text-primary)",
    cursor: state.isDisabled ? "not-allowed" : base.cursor,
    opacity: state.isDisabled ? 0.5 : 1,
  }),
  placeholder: (base) => ({
    ...base,
    color: "var(--ss-text-tertiary)",
  }),
};

export const Select: React.FC<SelectProps> = React.memo(
  ({
    value,
    options,
    placeholder,
    disabled,
    isLoading,
    isClearable = true,
    onChange,
    onBlur,
    className = "",
    isCreatable,
    formatCreateLabel,
    onCreateOption,
  }) => {
    const selectValue = React.useMemo(() => {
      if (!value) return null;
      const existing = options.find((option) => option.value === value);
      if (existing) return existing;
      return { value, label: value, isDisabled: false };
    }, [value, options]);

    const handleChange = (
      option: SingleValue<SelectOption>,
      action: ActionMeta<SelectOption>,
    ) => {
      onChange(option?.value ?? null, action);
    };

    const sharedProps: Partial<ReactSelectProps<SelectOption, false>> = {
      className,
      classNamePrefix: "app-select",
      value: selectValue,
      options,
      onChange: handleChange,
      placeholder,
      isDisabled: disabled,
      isLoading,
      onBlur,
      isClearable,
      styles: selectStyles,
    };

    if (isCreatable) {
      return (
        <CreatableSelect<SelectOption, false>
          {...sharedProps}
          onCreateOption={onCreateOption}
          formatCreateLabel={formatCreateLabel}
        />
      );
    }

    return <SelectComponent<SelectOption, false> {...sharedProps} />;
  },
);

Select.displayName = "Select";
