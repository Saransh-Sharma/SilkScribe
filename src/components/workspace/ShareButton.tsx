import { useTranslation } from "react-i18next";
import { Share } from "lucide-react";
import { commands } from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import { toastError } from "@/lib/utils/toastError";

/** Opens the macOS share menu (Mail, Messages, Notes, Slack…) for some text.
 * Only on macOS; elsewhere there's Copy. */
export function ShareButton({
  text,
  label,
}: {
  /** The text to share, or how to get it when the menu opens. */
  text: string | (() => Promise<string>);
  label?: string;
}) {
  const { t } = useTranslation();
  const osType = useOsType();
  if (osType !== "macos") return null;
  return (
    <button
      type="button"
      className="ws-secondary"
      onClick={async (event) => {
        const box = event.currentTarget.getBoundingClientRect();
        try {
          const body = typeof text === "string" ? text : await text();
          const result = await commands.shareText(body, {
            x: box.left,
            y: box.top,
            width: box.width,
            height: box.height,
          });
          if (result.status === "error") throw new Error(result.error);
        } catch (error) {
          toastError(t("workspace.share.failed"), error);
        }
      }}
    >
      <Share size={14} aria-hidden="true" />
      {label ?? t("workspace.share.label")}
    </button>
  );
}
