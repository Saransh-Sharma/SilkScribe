//! The macOS share sheet, for sending notes or a recipe's text to Mail,
//! Messages, Notes, Slack and other apps without copying and pasting.

use tauri::AppHandle;

/// Where the share button is, in the window's web coordinates, so the share
/// menu opens beside it.
#[derive(Clone, Copy, Debug, serde::Deserialize, specta::Type)]
pub struct ShareAnchor {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Opens the share menu for `text` beside `anchor`. Returns once the menu is
/// on its way; what the person picks is up to them and the app they choose.
#[tauri::command]
#[specta::specta]
pub async fn share_text(app: AppHandle, text: String, anchor: ShareAnchor) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri::Manager;
        let window = app
            .get_webview_window("main")
            .ok_or("The main window isn't open")?;
        app.run_on_main_thread(move || {
            if let Err(error) = platform::show(&window, &text, anchor) {
                log::warn!("Couldn't open the share menu: {error}");
            }
        })
        .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, text, anchor);
        Err("Sharing isn't available on this system".into())
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::ShareAnchor;
    use std::cell::RefCell;
    use tauri_nspanel::objc2::rc::Retained;
    use tauri_nspanel::objc2::runtime::AnyObject;
    use tauri_nspanel::objc2::AllocAnyThread;
    use tauri_nspanel::objc2_app_kit::{NSSharingServicePicker, NSView};
    use tauri_nspanel::objc2_foundation::{NSArray, NSPoint, NSRect, NSRectEdge, NSSize, NSString};

    thread_local! {
        /// The picker on screen. It must outlive the menu and the service it
        /// starts, so it's kept until the next share replaces it.
        static PICKER: RefCell<Option<Retained<NSSharingServicePicker>>> =
            const { RefCell::new(None) };
    }

    pub fn show(
        window: &tauri::WebviewWindow,
        text: &str,
        anchor: ShareAnchor,
    ) -> Result<(), String> {
        let view = window.ns_view().map_err(|e| e.to_string())? as *mut NSView;
        // SAFETY: Tauri hands out the window's live content view; this runs on
        // the main thread, which owns it.
        let view: &NSView = unsafe { view.as_ref() }.ok_or("No window view")?;
        let item: Retained<AnyObject> =
            Retained::into_super(Retained::into_super(NSString::from_str(text)));
        let items = NSArray::from_retained_slice(&[item]);
        // SAFETY: NSString conforms to NSPasteboardWriting, as the items must.
        let picker = unsafe {
            NSSharingServicePicker::initWithItems(NSSharingServicePicker::alloc(), &items)
        };
        let bounds = view.bounds();
        let y = if view.isFlipped() {
            anchor.y
        } else {
            bounds.size.height - anchor.y - anchor.height
        };
        let rect = NSRect::new(
            NSPoint::new(anchor.x, y),
            NSSize::new(anchor.width.max(1.0), anchor.height.max(1.0)),
        );
        picker.showRelativeToRect_ofView_preferredEdge(rect, view, NSRectEdge::MinY);
        PICKER.with(|slot| *slot.borrow_mut() = Some(picker));
        Ok(())
    }
}
