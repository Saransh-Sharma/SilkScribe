import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import type { ModelInfo } from "@/bindings";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getTranslatedModelName,
  getTranslatedModelDescription,
} from "../../lib/utils/modelTranslation";

interface ModelDropdownProps {
  models: ModelInfo[];
  currentModelId: string;
  onModelSelect: (modelId: string) => void;
}

const ModelDropdown: React.FC<ModelDropdownProps> = ({
  models,
  currentModelId,
  onModelSelect,
}) => {
  const { t } = useTranslation();
  const downloadedModels = useMemo(
    () => models.filter((m) => m.is_downloaded),
    [models],
  );
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = downloadedModels.findIndex(
    (model) => model.id === currentModelId,
  );
  const [focusedIndex, setFocusedIndex] = useState(
    selectedIndex >= 0 ? selectedIndex : 0,
  );

  useEffect(() => {
    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setFocusedIndex(nextIndex);

    const animationFrame = window.requestAnimationFrame(() => {
      optionRefs.current[nextIndex]?.focus();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [downloadedModels.length, selectedIndex]);

  const formatModelSize = (sizeMb: number) => {
    if (sizeMb >= 1024) {
      return `${(sizeMb / 1024).toFixed(sizeMb >= 10_240 ? 0 : 1)} GB`;
    }

    return `${sizeMb} MB`;
  };

  const handleModelClick = (modelId: string) => {
    onModelSelect(modelId);
  };

  const focusOption = (index: number) => {
    if (downloadedModels.length === 0) return;

    const nextIndex =
      (index + downloadedModels.length) % downloadedModels.length;
    setFocusedIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };

  const handleOptionKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    modelId: string,
  ) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusOption(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusOption(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusOption(0);
        break;
      case "End":
        event.preventDefault();
        focusOption(downloadedModels.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        handleModelClick(modelId);
        break;
    }
  };

  return (
    <div
      className="absolute bottom-full start-0 z-[var(--ss-layer-dropdown)] mb-3 max-h-[60vh] w-80 overflow-y-auto rounded-[18px] border border-ss-border-default bg-ss-bg-surface p-2 shadow-[var(--ss-shadow-lift)]"
      role="listbox"
      aria-label={t("modelSelector.active")}
    >
      {downloadedModels.length > 0 ? (
        <div>
          {downloadedModels.map((model, index) => (
            <button
              type="button"
              key={model.id}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              onClick={() => handleModelClick(model.id)}
              onFocus={() => setFocusedIndex(index)}
              onKeyDown={(event) => handleOptionKeyDown(event, index, model.id)}
              tabIndex={focusedIndex === index ? 0 : -1}
              role="option"
              aria-selected={currentModelId === model.id}
              className={`w-full cursor-pointer rounded-[14px] px-3 py-2.5 text-start transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/35 ${
                currentModelId === model.id
                  ? "bg-ss-brand-secondary/12 text-ss-brand-secondary"
                  : "text-ss-text-secondary hover:bg-ss-bg-surface-alt"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-current">
                    {getTranslatedModelName(model, t)}
                    {model.is_custom && (
                      <span className="ms-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ss-text-tertiary">
                        {t("modelSelector.custom")}
                      </span>
                    )}
                  </div>
                  <div className="pe-4 text-xs italic text-ss-text-tertiary">
                    {getTranslatedModelDescription(model, t)}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-ss-text-tertiary">
                    {t("modelSelector.modelMeta", {
                      size: formatModelSize(model.size_mb),
                      engine: model.engine_type,
                    })}
                  </div>
                </div>
                {currentModelId === model.id && (
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ss-brand-secondary">
                    {t("modelSelector.active")}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Sparkles}
          title={t("modelSelector.noModelsAvailable")}
          className="border-0 bg-transparent px-3 py-4 shadow-none"
        />
      )}
    </div>
  );
};

export default ModelDropdown;
