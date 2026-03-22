#Requires AutoHotkey v2.0
#SingleInstance Force

; Get parameters from command line
; Usage: mouse-click.ahk [x] [y] [button] [count]
if (A_Args.Length < 1) {
    MsgBox "Usage: mouse-click.ahk [x] [y] [button] [count]"
    ExitApp(1)
}

x := (A_Args.Length >= 1 && A_Args[1] != "") ? Integer(A_Args[1]) : ""
y := (A_Args.Length >= 2 && A_Args[2] != "") ? Integer(A_Args[2]) : ""
button := (A_Args.Length >= 3) ? A_Args[3] : "left"
count := (A_Args.Length >= 4) ? Integer(A_Args[4]) : 1

if (x != "" && y != "") {
    MouseMove(x, y, 5)
}

MouseClick(button, , , count)
ExitApp(0)
