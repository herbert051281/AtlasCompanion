# Windows Code Signing for Atlas Companion

## Why this matters
Windows Smart App Control / SmartScreen can block unsigned or low-reputation binaries.
Code-signing dramatically reduces blocks and trust prompts.

## Recommended certificate types
- **EV Code Signing** (best trust/reputation, fastest acceptance)
- **OV Code Signing** (works, but reputation ramps slower)

## Typical providers
DigiCert, Sectigo, GlobalSign, SSL.com (examples).

## Current practical path
1. Build unsigned artifacts locally:
   ```powershell
   npm run companion:package:portable
   npm run companion:package:win
   ```
2. Sign artifacts on Windows build machine using your cert.
3. Distribute signed executable/installer.

## Signing with signtool (example)
```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a "dist\Skillmaster Companion Setup 0.1.0.exe"
```

For portable exe, sign similarly:
```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a "dist\Skillmaster Companion 0.1.0.exe"
```

## Verify signature
```powershell
signtool verify /pa "dist\Skillmaster Companion Setup 0.1.0.exe"
```

## Distribution recommendation
- Internal testing: use `win-unpacked` or signed portable exe.
- External distribution: signed NSIS installer.

## Security notes
- Never commit private keys/cert files.
- Keep cert material in secure vault/HSM/token.
- Timestamp signatures to preserve validity after cert expiry.
