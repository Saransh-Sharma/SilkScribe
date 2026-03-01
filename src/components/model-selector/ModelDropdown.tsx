import React from "react";
import { useTranslation } from "react-i18next";
import type { ModelInfo } from "@/bindings";
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

  const handleModelClick = (modelId: string) => {
    onModelSelect(modelId);
  };

  return (
    <div className="absolute bottom-full start-0 z-50 mb-3 w-72 max-h-[60vh] overflow-y-auto rounded-[18px] border border-ss-border-default bg-ss-bg-surface p-2 shadow-[var(--ss-shadow-lift)]">
      {downloadedModels.length > 0 ? (
        <div>
          {downloadedModels.map((model) => (
            <div
              key={model.id}
              onClick={() => handleModelClick(model.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleModelClick(model.id);
                }
              }}
              tabIndex={0}
              role="button"
              className={`w-full cursor-pointer rounded-[14px] px-3 py-2.5 text-start transition-colors focus:outline-none ${
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
                </div>
                {currentModelId === model.id && (
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ss-brand-secondary">
                    {t("modelSelector.active")}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-3 py-2 text-sm text-ss-text-tertiary">
          {t("modelSelector.noModelsAvailable")}
        </div>
      )}
    </div>
  );
};

export default ModelDropdown;
