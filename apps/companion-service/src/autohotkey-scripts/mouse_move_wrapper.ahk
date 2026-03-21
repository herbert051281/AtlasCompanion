; mouse_move_wrapper.ahk - Move mouse to absolute screen coordinates
; Called by Node.js with JSON params as first argument
#Requires AutoHotkey v2.0
#SingleInstance Force
#Include primitives.ahk

; Parse JSON params from command line
try {
    paramsJson := A_Args[1]
    params := Jxon_Load(&paramsJson)
    
    x := Integer(params["x"])
    y := Integer(params["y"])
    speed := params.Has("speed") ? Integer(params["speed"]) : 10
    
    ; Execute the move
    PrimitiveMouseMove(x, y, speed)
    
    ; Output success
    FileAppend('{"success":true,"x":' . x . ',"y":' . y . '}', "*")
    ExitApp(0)
} catch as err {
    FileAppend('{"success":false,"error":"' . err.Message . '"}', "*")
    ExitApp(1)
}

; JSON parser (minimal implementation for our needs)
Jxon_Load(&src) {
    obj := Map()
    ; Simple JSON parsing - handles {"key":value} format
    src := Trim(src, "{}")
    for pair in StrSplit(src, ",") {
        parts := StrSplit(pair, ":", , 2)
        if parts.Length = 2 {
            key := Trim(parts[1], '" ')
            val := Trim(parts[2], '" ')
            ; Try to convert to number
            if IsNumber(val)
                obj[key] := Number(val)
            else if val = "true"
                obj[key] := true
            else if val = "false"
                obj[key] := false
            else
                obj[key] := val
        }
    }
    return obj
}
