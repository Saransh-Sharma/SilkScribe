import React from "react";
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
  const downloadedModels = models.filter((m) => m.is_downloaded);

  const formatModelSize = (sizeMb: number) => {
    if (sizeMb >= 1024) {
      return `${(sizeMb / 1024).toFixed(sizeMb >= 10_240 ? 0 : 1)} GB`;
    }

    return `${sizeMb} MB`;
  };

  const handleModelClick = (modelId: string) => {
    onModelSelect(modelId);
  };

  return (
    <div
      className="absolute bottom-full start-0 z-[var(--ss-layer-dropdown)] mb-3 max-h-[60vh] w-80 overflow-y-auto rounded-[18px] border border-ss-border-default bg-ss-bg-surface p-2 shadow-[var(--ss-shadow-lift)]"
      role="listbox"
      aria-label={t("modelSelector.active")}
    >
      {downloadedModels.length > 0 ? (
        <div>
          {downloadedModels.map((model) => (
            <button
              type="button"
              key={model.id}
              onClick={() => handleModelClick(model.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleModelClick(model.id);
                }
              }}
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
