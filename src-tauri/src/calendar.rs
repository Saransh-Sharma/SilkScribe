//! The person's calendar, read on this Mac once they connect it
//! (swift/calendar.swift): upcoming meetings on Home, meeting notes named
//! after the event, and a reminder through the meeting orb as one starts.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashSet;
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// One calendar event. Times are Unix seconds.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Type)]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub start: f64,
    pub end: f64,
    #[serde(default)]
    pub all_day: bool,
    #[serde(default)]
    pub calendar: String,
    /// How many people are invited.
    #[serde(default)]
    pub attendees: u32,
    /// A Zoom, Meet, Teams or similar link in the event.
    #[serde(default)]
    pub join_url: Option<String>,
}

impl CalendarEvent {
    /// A timed event with other people or a call link, rather than a
    /// reminder to oneself like "Focus time".
    pub fn is_meeting(&self) -> bool {
        !self.all_day && (self.attendees > 0 || self.join_url.is_some())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum CalendarAccess {
    /// macOS hasn't asked yet.
    NotDetermined,
    /// Turned off in System Settings.
    Denied,
    Granted,
    /// Only allowed to add events, which isn't enough to read them.
    WriteOnly,
    /// This build or platform can't read calendars.
    #[cfg_attr(
        all(target_os = "macos", not(feature = "mac-app-store")),
        allow(dead_code)
    )]
    Unavailable,
}

#[derive(Clone, Copy, Debug, Serialize, Type)]
pub struct CalendarStatus {
    pub access: CalendarAccess,
    /// The person connected it and macOS allows it.
    pub connected: bool,
}

#[cfg(all(target_os = "macos", not(feature = "mac-app-store")))]
unsafe extern "C" {
    fn ss_calendar_access() -> i32;
    fn ss_calendar_request_access() -> i32;
    fn ss_calendar_events(from: f64, to: f64) -> *mut std::ffi::c_char;
    fn ss_calendar_free(json: *mut std::ffi::c_char);
}

#[cfg(all(target_os = "macos", not(feature = "mac-app-store")))]
fn access_from(code: i32) -> CalendarAccess {
    match code {
        0 => CalendarAccess::NotDetermined,
        2 => CalendarAccess::Granted,
        3 => CalendarAccess::WriteOnly,
        _ => CalendarAccess::Denied,
    }
}

fn access() -> CalendarAccess {
    #[cfg(all(target_os = "macos", not(feature = "mac-app-store")))]
    {
        access_from(unsafe { ss_calendar_access() })
    }
    #[cfg(not(all(target_os = "macos", not(feature = "mac-app-store"))))]
    {
        CalendarAccess::Unavailable
    }
}

/// Shows macOS's prompt if it hasn't been answered. Blocks until it is.
fn request_access() -> CalendarAccess {
    #[cfg(all(target_os = "macos", not(feature = "mac-app-store")))]
    {
        access_from(unsafe { ss_calendar_request_access() })
    }
    #[cfg(not(all(target_os = "macos", not(feature = "mac-app-store"))))]
    {
        CalendarAccess::Unavailable
    }
}

/// Events overlapping `from..to` (Unix seconds), soonest first.
fn events(from: f64, to: f64) -> Vec<CalendarEvent> {
    #[cfg(all(target_os = "macos", not(feature = "mac-app-store")))]
    {
        let json = unsafe {
            let pointer = ss_calendar_events(from, to);
            if pointer.is_null() {
                return Vec::new();
            }
            let text = std::ffi::CStr::from_ptr(pointer)
                .to_string_lossy()
                .into_owned();
            ss_calendar_free(pointer);
            text
        };
        serde_json::from_str(&json).unwrap_or_default()
    }
    #[cfg(not(all(target_os = "macos", not(feature = "mac-app-store"))))]
    {
        let _ = (from, to);
        Vec::new()
    }
}

fn now() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs_f64())
        .unwrap_or_default()
}

fn connected(app: &AppHandle) -> bool {
    crate::settings::get_settings(app).calendar_connected && access() == CalendarAccess::Granted
}

/// The first `limit` meetings that haven't ended.
fn upcoming_in(events: Vec<CalendarEvent>, now: f64, limit: usize) -> Vec<CalendarEvent> {
    events
        .into_iter()
        .filter(|event| event.is_meeting() && event.end > now)
        .take(limit)
        .collect()
}

/// The meeting going on now (or starting within five minutes), latest start
/// first: the one a new recording is most likely for.
fn current_in(events: Vec<CalendarEvent>, now: f64) -> Option<CalendarEvent> {
    events
        .into_iter()
        .filter(|event| event.is_meeting() && event.start - 300.0 <= now && now < event.end)
        .max_by(|a, b| a.start.total_cmp(&b.start))
}

/// The meeting happening now, if the calendar is connected.
pub fn current_meeting(app: &AppHandle) -> Option<CalendarEvent> {
    if !connected(app) {
        return None;
    }
    let now = now();
    current_in(events(now - 6.0 * 3600.0, now + 600.0), now)
}

#[tauri::command]
#[specta::specta]
pub fn calendar_status(app: AppHandle) -> CalendarStatus {
    CalendarStatus {
        access: access(),
        connected: connected(&app),
    }
}

/// Connects the calendar, asking macOS for access the first time.
#[tauri::command]
#[specta::specta]
pub async fn connect_calendar(app: AppHandle) -> Result<CalendarStatus, String> {
    let access = tauri::async_runtime::spawn_blocking(request_access)
        .await
        .map_err(|e| e.to_string())?;
    if access == CalendarAccess::Granted {
        let mut settings = crate::settings::get_settings(&app);
        settings.calendar_connected = true;
        crate::settings::write_settings(&app, settings);
    }
    Ok(calendar_status(app))
}

#[tauri::command]
#[specta::specta]
pub fn disconnect_calendar(app: AppHandle) -> CalendarStatus {
    let mut settings = crate::settings::get_settings(&app);
    settings.calendar_connected = false;
    crate::settings::write_settings(&app, settings);
    calendar_status(app)
}

#[tauri::command]
#[specta::specta]
pub fn change_calendar_reminders_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut settings = crate::settings::get_settings(&app);
    settings.calendar_reminders = enabled;
    crate::settings::write_settings(&app, settings);
    Ok(())
}

/// The next few meetings in the coming day, for Home.
#[tauri::command]
#[specta::specta]
pub fn upcoming_meetings(app: AppHandle) -> Vec<CalendarEvent> {
    if !connected(&app) {
        return Vec::new();
    }
    let now = now();
    upcoming_in(events(now, now + 24.0 * 3600.0), now, 4)
}

/// The meeting happening now, to name a new recording after.
#[tauri::command]
#[specta::specta]
pub fn current_calendar_meeting(app: AppHandle) -> Option<CalendarEvent> {
    current_meeting(&app)
}

/// Opens Privacy & Security → Calendars, to turn access back on.
#[tauri::command]
#[specta::specta]
pub fn open_calendar_privacy(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars",
            None::<&str>,
        )
        .map_err(|e| e.to_string())
}

const REMINDER_POLL: Duration = Duration::from_secs(20);
/// Remind from this long before a meeting starts…
const REMIND_BEFORE: f64 = 70.0;
/// …until this long after.
const REMIND_AFTER: f64 = 120.0;

/// Meetings to remind about now: starting within a minute or just started,
/// not reminded about before.
fn due_reminders(
    events: Vec<CalendarEvent>,
    now: f64,
    reminded: &HashSet<String>,
) -> Vec<CalendarEvent> {
    events
        .into_iter()
        .filter(|event| {
            event.is_meeting()
                && event.start - now <= REMIND_BEFORE
                && now - event.start <= REMIND_AFTER
                && !reminded.contains(&event.id)
        })
        .collect()
}

/// Starts the reminder thread. It only acts while the calendar is connected,
/// reminders are on, nothing is recording and the orb isn't already asking.
pub fn start(app: AppHandle) {
    #[cfg(not(all(target_os = "macos", not(feature = "mac-app-store"))))]
    {
        let _ = app;
    }
    #[cfg(all(target_os = "macos", not(feature = "mac-app-store")))]
    std::thread::spawn(move || {
        let mut reminded: HashSet<String> = HashSet::new();
        loop {
            std::thread::sleep(REMINDER_POLL);
            let settings = crate::settings::get_settings(&app);
            if !settings.calendar_connected || !settings.calendar_reminders {
                continue;
            }
            let meeting = app
                .try_state::<std::sync::Arc<crate::workspace::Workspace>>()
                .is_some_and(|ws| ws.meeting_active.load(std::sync::atomic::Ordering::SeqCst));
            if meeting || crate::meeting_orb::is_prompting(&app) {
                continue;
            }
            if access() != CalendarAccess::Granted {
                continue;
            }
            let now = now();
            let due = due_reminders(
                events(now - REMIND_AFTER, now + REMIND_BEFORE),
                now,
                &reminded,
            );
            for event in &due {
                reminded.insert(event.id.clone());
            }
            if let Some(event) = due.into_iter().next() {
                log::info!("A calendar meeting is starting; offering to take notes");
                crate::meeting_orb::show_prompt(
                    &app,
                    crate::meeting_orb::MeetingPrompt {
                        app: None,
                        title: Some(event.title),
                    },
                );
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(id: &str, start: f64, minutes: f64) -> CalendarEvent {
        CalendarEvent {
            id: id.into(),
            title: id.into(),
            start,
            end: start + minutes * 60.0,
            all_day: false,
            calendar: "Work".into(),
            attendees: 3,
            join_url: None,
        }
    }

    #[test]
    fn only_meetings_with_people_or_a_call_count() {
        let mut solo = event("Focus time", 0.0, 60.0);
        solo.attendees = 0;
        assert!(!solo.is_meeting());
        solo.join_url = Some("https://zoom.us/j/1".into());
        assert!(solo.is_meeting());
        let mut day = event("Offsite", 0.0, 60.0);
        day.all_day = true;
        assert!(!day.is_meeting());
    }

    #[test]
    fn upcoming_skips_meetings_that_ended() {
        let now = 10_000.0;
        let upcoming = upcoming_in(
            vec![
                event("Ended", now - 3600.0, 30.0),
                event("Now", now - 600.0, 30.0),
                event("Later", now + 3600.0, 30.0),
            ],
            now,
            4,
        );
        let titles: Vec<_> = upcoming.iter().map(|e| e.title.as_str()).collect();
        assert_eq!(titles, ["Now", "Later"]);
    }

    #[test]
    fn the_current_meeting_is_the_latest_one_under_way() {
        let now = 10_000.0;
        let current = current_in(
            vec![
                event("Long workshop", now - 3600.0, 180.0),
                event("Standup", now - 60.0, 15.0),
                event("Tomorrow", now + 86_400.0, 30.0),
            ],
            now,
        );
        assert_eq!(current.unwrap().title, "Standup");
        // A meeting about to start counts too.
        let soon = current_in(vec![event("Soon", now + 120.0, 30.0)], now);
        assert_eq!(soon.unwrap().title, "Soon");
        assert!(current_in(vec![event("Later", now + 900.0, 30.0)], now).is_none());
    }

    #[test]
    fn each_meeting_is_reminded_about_once_around_its_start() {
        let now = 10_000.0;
        let mut reminded = HashSet::new();
        let events = vec![
            event("Starting", now + 50.0, 30.0),
            event("Started", now - 60.0, 30.0),
            event("Under way", now - 900.0, 30.0),
            event("Later", now + 600.0, 30.0),
        ];
        let due = due_reminders(events.clone(), now, &reminded);
        let titles: Vec<_> = due.iter().map(|e| e.title.as_str()).collect();
        assert_eq!(titles, ["Starting", "Started"]);
        reminded.extend(due.into_iter().map(|e| e.id));
        assert!(due_reminders(events, now, &reminded).is_empty());
    }
}
