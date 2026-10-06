import Foundation
import ApplicationServices

// Reads the focused text field of the frontmost app through the Accessibility
// API: the selected text and a little text either side of the cursor. Used to
// spell names and terms right in AI cleanup and to act on a selection in
// command mode. Nothing here leaves the process; password fields are never
// read.

private func response(_ object: [String: Any]) -> UnsafeMutablePointer<CChar>? {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let text = String(data: data, encoding: .utf8) else { return strdup("{}") }
    return strdup(text)
}

@_cdecl("ss_context_free") public func ssContextFree(_ pointer: UnsafeMutablePointer<CChar>?) {
    free(pointer)
}

private func copyAttribute(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
    return value
}

/// `around`: characters to read before and after the cursor.
/// `selectionLimit`: most characters of selected text to return.
@_cdecl("ss_context_focused_text") public func ssContextFocusedText(_ around: Int32, _ selectionLimit: Int32) -> UnsafeMutablePointer<CChar>? {
    guard AXIsProcessTrusted() else { return response(["error": "not_trusted"]) }
    let system = AXUIElementCreateSystemWide()
    // Don't let a hung app stall dictation.
    AXUIElementSetMessagingTimeout(system, 0.25)
    guard let focused = copyAttribute(system, kAXFocusedUIElementAttribute),
          CFGetTypeID(focused) == AXUIElementGetTypeID() else {
        return response(["error": "no_focus"])
    }
    let element = focused as! AXUIElement
    AXUIElementSetMessagingTimeout(element, 0.25)

    let role = copyAttribute(element, kAXRoleAttribute) as? String ?? ""
    let subrole = copyAttribute(element, kAXSubroleAttribute) as? String ?? ""
    if subrole == (kAXSecureTextFieldSubrole as String) || role == "AXSecureTextField" {
        return response(["secure": true, "role": role])
    }

    let limit = max(0, Int(selectionLimit))
    let selected = (copyAttribute(element, kAXSelectedTextAttribute) as? String) ?? ""
    var before = ""
    var after = ""
    if let value = copyAttribute(element, kAXValueAttribute) as? String {
        let text = value as NSString
        let span = max(0, Int(around))
        if let rangeRef = copyAttribute(element, kAXSelectedTextRangeAttribute),
           CFGetTypeID(rangeRef) == AXValueGetTypeID() {
            var range = CFRange()
            AXValueGetValue(rangeRef as! AXValue, .cfRange, &range)
            let start = min(max(range.location, 0), text.length)
            let end = min(start + max(range.length, 0), text.length)
            let from = max(0, start - span)
            before = text.substring(with: NSRange(location: from, length: start - from))
            let to = min(text.length, end + span)
            after = text.substring(with: NSRange(location: end, length: to - end))
        } else {
            before = String(value.suffix(span))
        }
    }
    return response([
        "secure": false,
        "role": role,
        "selected": String(selected.prefix(limit)),
        "selection_truncated": selected.count > limit,
        "before": before,
        "after": after,
    ])
}
