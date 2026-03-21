; mouse_drag_wrapper.ahk - Drag from one position to another
; Called by Node.js with JSON params as first argument
#Requires AutoHotkey v2.0
#SingleInstance Force
#Include primitives.ahk

try {
    paramsJson := A_Args[1]
    params := Jxon_Load(&paramsJson)
    
    button := params["button"]
    x1 := Integer(params["x1"])
    y1 := Integer(params["y1"])
    x2 := Integer(params["x2"])
    y2 := Integer(params["y2"])
    speed := params.Has("speed") ? Integer(params["speed"]) : 10
    
    ; Execute the drag
    PrimitiveMouseDrag(button, x1, y1, x2, y2, speed)
    
    ; Output success
    FileAppend('{"success":true,"from":{"x":' . x1 . ',"y":' . y1 . '},"to":{"x":' . x2 . ',"y":' . y2 . '}}', "*")
    ExitApp(0)
} catch as err {
    FileAppend('{"success":false,"error":"' . err.Message . '"}', "*")
    ExitApp(1)
}

; JSON parser
Jxon_Load(&src) {
    obj := Map()
    src := Trim(src, "{}")
    for pair in StrSplit(src, ",") {
        parts := StrSplit(pair, ":", , 2)
        if parts.Length = 2 {
            key := Trim(parts[1], '" ')
            val := Trim(parts[2], '" ')
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
