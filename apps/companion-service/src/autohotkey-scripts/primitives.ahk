; primitives.ahk - AutoHotkey v2 Mouse and Keyboard Primitives
; This is the base library for Atlas Companion mouse/keyboard automation
#Requires AutoHotkey v2.0
#SingleInstance Force

; ============================================================
; Mouse Operations
; ============================================================

; Move mouse to absolute screen coordinates
; speed: 0 (instant) to 100 (slowest), default 10
PrimitiveMouseMove(x, y, speed := 10) {
    MouseMove(x, y, speed)
}

; Click at current position or specified coordinates
; button: "left", "right", "middle"
; clickCount: 1 for single, 2 for double
PrimitiveMouseClick(button := "left", x := "", y := "", clickCount := 1) {
    if (x != "" && y != "") {
        MouseMove(x, y, 5)
    }
    Click(button, , , clickCount)
}

; Drag from one position to another
PrimitiveMouseDrag(whichButton, x1, y1, x2, y2, speed := 10) {
    MouseMove(x1, y1, speed)
    MouseClickDrag(whichButton, x1, y1, x2, y2, speed)
}

; ============================================================
; Keyboard Operations
; ============================================================

; Type text literally (no hotkey interpretation)
PrimitiveTypeText(text, delayMs := 10) {
    SetKeyDelay(delayMs)
    SendText(text)
}

; Send hotkey combo (e.g., "^a" for Ctrl+A, "!{Tab}" for Alt+Tab)
PrimitiveSendHotkey(hotkey) {
    Send(hotkey)
}

; ============================================================
; Utility
; ============================================================

; Get current mouse position (for debugging/testing)
GetMousePosition() {
    CoordMode("Mouse", "Screen")
    MouseGetPos(&x, &y)
    return { x: x, y: y }
}
