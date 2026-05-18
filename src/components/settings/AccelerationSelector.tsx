import { type FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import type {
  OrtAcceleratorSetting,
  WhisperAcceleratorSetting,
} from "@/bindings";
import { useSettings } from "../../hooks/useSettings";
import { Dropdown, type DropdownOption } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";

interface AccelerationSelectorProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

function encodeWhisperValue(
  accelerator: WhisperAcceleratorSetting,
  gpuDevice: number,
): string {
  if (accelerator === "cpu") {
    return "cpu";
  }
  if (accelerator === "gpu" && gpuDevice >= 0) {
    return `gpu:${gpuDevice}`;
  }
  return "auto";
}

function decodeWhisperValue(value: string): {
  accelerator: WhisperAcceleratorSetting;
  gpuDevice: number;
} {
  if (value === "cpu") {
    return { accelerator: "cpu", gpuDevice: -1 };
  }
  if (value.startsWith("gpu:")) {
    return {
      accelerator: "gpu",
      gpuDevice: Number.parseInt(value.slice(4), 10),
    };
  }
  return { accelerator: "auto", gpuDevice: -1 };
}

export const AccelerationSelector: FC<AccelerationSelectorProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const [whisperOptions, setWhisperOptions] = useState<DropdownOption[]>([]);
  const [ortOptions, setOrtOptions] = useState<DropdownOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    commands
      .getAvailableAccelerators()
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (result.status === "error") {
          throw new Error(String(result.error));
        }

        const available = result.data;
        const ortLabels: Record<OrtAcceleratorSetting, string> = {
          auto: t("settings.advanced.acceleration.labels.auto"),
          cpu: t("settings.advanced.acceleration.labels.cpu"),
          cuda: t("settings.advanced.acceleration.labels.cuda"),
          directml: t("settings.advanced.acceleration.labels.directml"),
          rocm: t("settings.advanced.acceleration.labels.rocm"),
        };

        const nextWhisperOptions: DropdownOption[] = [
          {
            value: "auto",
            label: t("settings.advanced.acceleration.gpuDevice.auto"),
          },
        ];

        for (const device of available.gpu_devices) {
          const vramLabel =
            device.total_vram_mb >= 1024
              ? `${(device.total_vram_mb / 1024).toFixed(1)} GB`
              : `${device.total_vram_mb} MB`;

          nextWhisperOptions.push({
            value: `gpu:${device.id}`,
            label: `${device.name} (${vramLabel})`,
          });
        }

        nextWhisperOptions.push({
          value: "cpu",
          label: t("settings.advanced.acceleration.labels.cpu"),
        });
        setWhisperOptions(nextWhisperOptions);

        const ortAccelerators = available.ort.includes("auto")
          ? available.ort
          : ["auto", ...available.ort];

        setOrtOptions(
          ortAccelerators.map((value) => ({
            value,
            label: ortLabels[value as OrtAcceleratorSetting] ?? value,
          })),
        );
      })
      .catch((error) => {
        console.error("Failed to load accelerator options:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  const currentWhisper = encodeWhisperValue(
    (getSetting("whisper_accelerator") ?? "auto") as WhisperAcceleratorSetting,
    (getSetting("whisper_gpu_device") ?? -1) as number,
  );
  const currentOrt = getSetting("ort_accelerator") ?? "auto";

  const handleWhisperChange = async (value: string) => {
    const { accelerator, gpuDevice } = decodeWhisperValue(value);
    if (accelerator === "gpu") {
      await updateSetting("whisper_gpu_device", gpuDevice);
      await updateSetting("whisper_accelerator", accelerator);
    } else {
      await updateSetting("whisper_accelerator", accelerator);
      await updateSetting("whisper_gpu_device", gpuDevice);
    }
  };

  return (
    <>
      <SettingContainer
        title={t("settings.advanced.acceleration.whisper.title")}
        description={t("settings.advanced.acceleration.whisper.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
        layout="horizontal"
      >
        <Dropdown
          options={whisperOptions}
          selectedValue={currentWhisper}
          onSelect={handleWhisperChange}
          disabled={
            isUpdating("whisper_accelerator") ||
            isUpdating("whisper_gpu_device")
          }
        />
      </SettingContainer>
      {ortOptions.length > 2 ? (
        <SettingContainer
          title={t("settings.advanced.acceleration.ort.title")}
          description={t("settings.advanced.acceleration.ort.description")}
          descriptionMode={descriptionMode}
          grouped={grouped}
          layout="horizontal"
        >
          <Dropdown
            options={ortOptions}
            selectedValue={currentOrt}
            onSelect={(value) =>
              updateSetting("ort_accelerator", value as OrtAcceleratorSetting)
            }
            disabled={isUpdating("ort_accelerator")}
          />
        </SettingContainer>
      ) : null}
    </>
  );
};
