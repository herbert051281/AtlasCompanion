; keyboard_type_wrapper.ahk - Type text literally (no hotkey interpretation)
; Called by Node.js with JSON params as first argument
#Requires AutoHotkey v2.0
#SingleInstance Force
#Include primitives.ahk

try {
    paramsJson := A_Args[1]
    params := Jxon_Load(&paramsJson)
    
    text := params["text"]
    delayMs := params.Has("delayMs") ? Integer(params["delayMs"]) : 10
    
    ; Execute the typing
    PrimitiveTypeText(text, delayMs)
    
    ; Output success
    FileAppend('{"success":true,"typed":' . StrLen(text) . ' chars}', "*")
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
