#Requires AutoHotkey v2.0
#SingleInstance Force

; Get parameters from command line
if (A_Args.Length < 2) {
    MsgBox "Usage: mouse-move.ahk x y [speed]"
    ExitApp(1)
}

x := Integer(A_Args[1])
y := Integer(A_Args[2])
speed := (A_Args.Length >= 3) ? Integer(A_Args[3]) : 5

MouseMove(x, y, speed)
ExitApp(0)
