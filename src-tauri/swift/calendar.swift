import Foundation
import EventKit

// Reads the person's calendar through EventKit, after they connect it: what's
// coming up, for Home, meeting titles and a reminder to take notes. Events are
// only read, never changed, and nothing leaves this Mac.

private let store = EKEventStore()

private func response(_ object: Any) -> UnsafeMutablePointer<CChar>? {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let text = String(data: data, encoding: .utf8) else { return strdup("[]") }
    return strdup(text)
}

@_cdecl("ss_calendar_free") public func ssCalendarFree(_ pointer: UnsafeMutablePointer<CChar>?) {
    free(pointer)
}

/// 0 not asked yet, 1 denied or restricted, 2 full access, 3 add-only access.
@_cdecl("ss_calendar_access") public func ssCalendarAccess() -> Int32 {
    let status = EKEventStore.authorizationStatus(for: .event)
    if #available(macOS 14.0, *) {
        switch status {
        case .fullAccess: return 2
        case .writeOnly: return 3
        case .notDetermined: return 0
        default: return 1
        }
    }
    switch status.rawValue {
    case 3: return 2 // .authorized before macOS 14
    case 0: return 0
    default: return 1
    }
}

/// Asks for full access (macOS shows its prompt once). Blocks until the person
/// answers, so call it off the main thread. Returns the same codes as
/// `ss_calendar_access`.
@_cdecl("ss_calendar_request_access") public func ssCalendarRequestAccess() -> Int32 {
    let done = DispatchSemaphore(value: 0)
    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { _, _ in done.signal() }
    } else {
        store.requestAccess(to: .event) { _, _ in done.signal() }
    }
    _ = done.wait(timeout: .now() + 300)
    return ssCalendarAccess()
}

/// A video-call link in the event, if it has one.
private func joinURL(_ event: EKEvent) -> String? {
    let hosts = ["zoom.us", "meet.google.com", "teams.microsoft.com", "teams.live.com", "webex.com", "whereby.com", "around.co"]
    var candidates: [String] = []
    if let url = event.url?.absoluteString { candidates.append(url) }
    if let location = event.location { candidates.append(location) }
    if let notes = event.notes { candidates.append(notes) }
    guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return nil }
    for text in candidates {
        let range = NSRange(text.startIndex..., in: text)
        for match in detector.matches(in: text, options: [], range: range) {
            guard let url = match.url, let host = url.host?.lowercased() else { continue }
            if hosts.contains(where: { host == $0 || host.hasSuffix("." + $0) }) {
                return url.absoluteString
            }
        }
    }
    return nil
}

/// Events overlapping [from, to] (Unix seconds), as a JSON array, soonest first.
@_cdecl("ss_calendar_events") public func ssCalendarEvents(_ from: Double, _ to: Double) -> UnsafeMutablePointer<CChar>? {
    guard ssCalendarAccess() == 2 else { return response([]) }
    let predicate = store.predicateForEvents(
        withStart: Date(timeIntervalSince1970: from),
        end: Date(timeIntervalSince1970: to),
        calendars: nil)
    let events = store.events(matching: predicate)
        .filter { $0.status != .canceled }
        .sorted { $0.startDate < $1.startDate }
        .map { event -> [String: Any] in
            var entry: [String: Any] = [
                "id": event.calendarItemIdentifier + "@" + String(Int(event.startDate.timeIntervalSince1970)),
                "title": event.title ?? "",
                "start": event.startDate.timeIntervalSince1970,
                "end": event.endDate.timeIntervalSince1970,
                "all_day": event.isAllDay,
                "calendar": event.calendar?.title ?? "",
                "attendees": event.attendees?.count ?? 0,
            ]
            if let url = joinURL(event) { entry["join_url"] = url }
            return entry
        }
    return response(events)
}
