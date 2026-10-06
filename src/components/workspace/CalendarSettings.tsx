import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CalendarStatus } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { toastError } from "@/lib/utils/toastError";
import { WsToggle } from "./controls";
import { api } from "./api";

/** Connecting the calendar, in the AI notes settings. Opt-in: nothing is read
 * until the person connects it, and it never leaves this Mac. */
export function CalendarSettings() {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    void api
      .calendarStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status || status.access === "unavailable") return null;

  const connect = async () => {
    setWorking(true);
    try {
      setStatus(await api.connectCalendar());
    } catch (error) {
      toastError(t("workspace.errors.connectCalendar"), error);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="ws-calendar-settings">
      <h2>{t("workspace.calendar.title")}</h2>
      <p className="ws-description">{t("workspace.calendar.description")}</p>
      {status.connected ? (
        <>
          <WsToggle
            checked={getSetting("calendar_reminders") ?? true}
            onChange={(enabled) =>
              void updateSetting("calendar_reminders", enabled)
            }
            label={t("workspace.calendar.reminders")}
            hint={t("workspace.calendar.remindersHint")}
          />
          <button
            className="ws-secondary"
            onClick={async () => setStatus(await api.disconnectCalendar())}
          >
            {t("workspace.calendar.disconnect")}
          </button>
        </>
      ) : status.access === "denied" || status.access === "write_only" ? (
        <div className="ws-alert">
          <p>{t("workspace.calendar.denied")}</p>
          <button
            className="ws-secondary"
            onClick={() =>
              void api
                .openCalendarPrivacy()
                .catch((error) =>
                  toastError(t("workspace.errors.connectCalendar"), error),
                )
            }
          >
            {t("workspace.calendar.openSettings")}
          </button>
        </div>
      ) : (
        <button
          className="ws-primary"
          disabled={working}
          onClick={() => void connect()}
        >
          {t("workspace.calendar.connect")}
        </button>
      )}
    </div>
  );
}
