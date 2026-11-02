//! Notices when a call starts — a known call app is running and something
//! other than SilkScribe is using the microphone — and offers, through the
//! meeting orb, to take notes. Nothing is recorded until the person says so.

use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use crate::app_context::FocusedApp;

/// Desktop call apps, by bundle identifier, with the name to show.
const CALL_APPS: &[(&str, &str)] = &[
    ("us.zoom.xos", "Zoom"),
    ("com.microsoft.teams2", "Microsoft Teams"),
    ("com.microsoft.teams", "Microsoft Teams"),
    ("com.cisco.webexmeetingsapp", "Webex"),
    ("Cisco-Systems.Spark", "Webex"),
    ("com.apple.FaceTime", "FaceTime"),
    ("com.hnc.Discord", "Discord"),
    ("com.tinyspeck.slackmacgap", "Slack"),
];

const POLL: Duration = Duration::from_secs(2);
/// How long a call has to look live before offering notes.
const SETTLE: Duration = Duration::from_secs(5);
/// How long the mic has to be quiet before a new call can be offered again.
const QUIET_RESET: Duration = Duration::from_secs(30);
/// An unanswered offer goes away after this.
const PROMPT_TIMEOUT: Duration = Duration::from_secs(60);

/// Call apps running now, in `CALL_APPS` order.
pub fn running_call_apps() -> Vec<FocusedApp> {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::objc2_app_kit::NSWorkspace;
        let running: Vec<String> = NSWorkspace::sharedWorkspace()
            .runningApplications()
            .iter()
            .filter_map(|app| app.bundleIdentifier().map(|id| id.to_string()))
            .collect();
        let mut apps: Vec<FocusedApp> = Vec::new();
        for (bundle_id, name) in CALL_APPS {
            if running.iter().any(|id| id == bundle_id) && !apps.iter().any(|a| a.name == *name) {
                apps.push(FocusedApp {
                    bundle_id: bundle_id.to_string(),
                    name: name.to_string(),
                });
            }
        }
        apps
    }
    #[cfg(not(target_os = "macos"))]
    {
        Vec::new()
    }
}

/// The call app among the apps using the mic, if any, in `CALL_APPS` order.
/// A helper process (`us.zoom.xos.helper`) counts as its app.
fn call_app_using_input(users: &[String]) -> Option<FocusedApp> {
    CALL_APPS.iter().find_map(|(bundle_id, name)| {
        users
            .iter()
            .any(|user| {
                user == bundle_id
                    || user
                        .strip_prefix(bundle_id)
                        .is_some_and(|rest| rest.starts_with('.'))
            })
            .then(|| FocusedApp {
                bundle_id: bundle_id.to_string(),
                name: name.to_string(),
            })
    })
}

/// Call apps running now, for "Capture audio from" in the meeting form.
#[tauri::command]
#[specta::specta]
pub fn workspace_call_apps() -> Vec<FocusedApp> {
    running_call_apps()
}

/// What the watcher has seen so far.
#[derive(Default)]
struct Watch {
    /// When the current possible call first looked live.
    live_since: Option<Instant>,
    /// When the mic went quiet.
    quiet_since: Option<Instant>,
    /// Already offered (or answered) for this call.
    offered: bool,
    prompted_at: Option<Instant>,
}

impl Watch {
    /// Advances the state with one observation. Returns the app to offer
    /// notes for, at most once per call.
    fn observe(
        &mut self,
        now: Instant,
        mic_in_use: bool,
        call: Option<FocusedApp>,
    ) -> Option<FocusedApp> {
        if !mic_in_use {
            self.live_since = None;
            let quiet = *self.quiet_since.get_or_insert(now);
            if now.duration_since(quiet) >= QUIET_RESET {
                self.offered = false;
            }
            return None;
        }
        self.quiet_since = None;
        let call = call?;
        let since = *self.live_since.get_or_insert(now);
        if self.offered || now.duration_since(since) < SETTLE {
            return None;
        }
        self.offered = true;
        self.prompted_at = Some(now);
        Some(call)
    }
}

/// Starts the watcher thread. It does nothing while the setting is off or a
/// meeting is recording. Before macOS 14.2 it also waits while SilkScribe's
/// own mic stream is open, as the mic check can't tell other apps from ours.
pub fn start(app: AppHandle) {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }
    #[cfg(target_os = "macos")]
    std::thread::spawn(move || {
        let mut watch = Watch::default();
        loop {
            std::thread::sleep(POLL);
            // AppKit calls on a plain thread autorelease into a pool nobody
            // drains; give each check its own.
            tauri_nspanel::objc2::rc::autoreleasepool(|_| check(&app, &mut watch));
        }
    });
}

/// One look for a call, and the prompt if one is found.
#[cfg(target_os = "macos")]
fn check(app: &AppHandle, watch: &mut Watch) {
    let settings = crate::settings::get_settings(app);
    let meeting = app
        .try_state::<Arc<crate::workspace::Workspace>>()
        .is_some_and(|ws| ws.meeting_active.load(std::sync::atomic::Ordering::SeqCst));
    let own_stream = app
        .try_state::<Arc<crate::managers::audio::AudioRecordingManager>>()
        .is_some_and(|audio| audio.is_microphone_open());
    if crate::meeting_orb::is_prompting(app) {
        let timed_out = watch
            .prompted_at
            .is_some_and(|at| at.elapsed() >= PROMPT_TIMEOUT);
        // Where macOS says who's using the mic, SilkScribe's own stream
        // doesn't keep the prompt up after the call ends.
        let mic = match crate::workspace::capture::input_apps() {
            Some(users) => Some(!users.is_empty()),
            None => crate::workspace::capture::microphone_in_use(),
        };
        if meeting || timed_out || mic == Some(false) {
            crate::meeting_orb::dismiss_prompt(app);
        }
        return;
    }
    if !settings.suggest_meeting_notes || meeting {
        watch.live_since = None;
        return;
    }
    // Which apps are using the mic, where macOS says. Otherwise all there is
    // to go on is "the mic is busy and a call app is open", which can't tell
    // an idle Slack from the call, nor SilkScribe's own mic stream from theirs.
    let (mic_in_use, call) = match crate::workspace::capture::input_apps() {
        Some(users) => (!users.is_empty(), call_app_using_input(&users)),
        None if own_stream => {
            watch.live_since = None;
            return;
        }
        None => {
            let Some(mic_in_use) = crate::workspace::capture::microphone_in_use() else {
                return;
            };
            (mic_in_use, running_call_apps().into_iter().next())
        }
    };
    if let Some(call) = watch.observe(Instant::now(), mic_in_use, call) {
        log::info!("Call detected in {}; offering to take notes", call.name);
        // Name it after the calendar meeting going on, if there is one.
        let title = crate::calendar::current_meeting(app).map(|event| event.title);
        crate::meeting_orb::show_prompt(
            app,
            crate::meeting_orb::MeetingPrompt {
                app: Some(call),
                title,
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_call_app_is_the_one_using_the_mic() {
        let users = |ids: &[&str]| ids.iter().map(|id| id.to_string()).collect::<Vec<_>>();
        // Slack idles in the background while Teams has the mic.
        assert_eq!(
            call_app_using_input(&users(&["com.microsoft.teams2"])).map(|app| app.name),
            Some("Microsoft Teams".to_string())
        );
        assert_eq!(
            call_app_using_input(&users(&["us.zoom.xos.helper"])).map(|app| app.bundle_id),
            Some("us.zoom.xos".to_string())
        );
        // Voice Memos or a browser isn't a call app we can capture by name.
        assert!(call_app_using_input(&users(&["com.apple.VoiceMemos"])).is_none());
        assert!(call_app_using_input(&users(&["us.zoom.xosmeeting"])).is_none());
        assert!(call_app_using_input(&[]).is_none());
    }

    fn zoom() -> Option<FocusedApp> {
        Some(FocusedApp {
            bundle_id: "us.zoom.xos".into(),
            name: "Zoom".into(),
        })
    }

    #[test]
    fn offers_once_after_the_call_settles() {
        let mut watch = Watch::default();
        let start = Instant::now();
        assert_eq!(watch.observe(start, true, zoom()), None);
        assert_eq!(
            watch.observe(start + Duration::from_secs(2), true, zoom()),
            None
        );
        assert_eq!(watch.observe(start + SETTLE, true, zoom()), zoom());
        // Not again during the same call.
        assert_eq!(watch.observe(start + SETTLE * 3, true, zoom()), None);
    }

    #[test]
    fn needs_a_call_app_and_a_busy_mic() {
        let mut watch = Watch::default();
        let start = Instant::now();
        watch.observe(start, true, None);
        assert_eq!(watch.observe(start + SETTLE, true, None), None);
        watch.observe(start, false, zoom());
        assert_eq!(watch.observe(start + SETTLE, false, zoom()), None);
    }

    #[test]
    fn a_new_call_can_be_offered_after_the_mic_rests() {
        let mut watch = Watch::default();
        let start = Instant::now();
        watch.observe(start, true, zoom());
        assert_eq!(watch.observe(start + SETTLE, true, zoom()), zoom());
        // A short pause (e.g. muting) isn't a new call.
        let pause = start + SETTLE + Duration::from_secs(10);
        watch.observe(pause, false, zoom());
        watch.observe(pause + Duration::from_secs(5), true, zoom());
        assert_eq!(
            watch.observe(pause + Duration::from_secs(20), true, zoom()),
            None
        );
        // After a real break, the next call is offered.
        let later = pause + Duration::from_secs(60);
        watch.observe(later, false, zoom());
        watch.observe(later + QUIET_RESET, false, zoom());
        let next = later + QUIET_RESET + Duration::from_secs(1);
        watch.observe(next, true, zoom());
        assert_eq!(watch.observe(next + SETTLE, true, zoom()), zoom());
    }
}
