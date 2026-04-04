# Changelog - Loopconomy

All notable changes to this project will be documented in this file.

## [v1.1.3-1r] - Voice System Update

### Added
- **Voice System (Kokoro + RVC Miku)**
  - `/summon [channel]` - Join VC and enable voice AI
  - `/sealaway` - Disconnect from VC
  - Voice pipeline with Kokoro-82M TTS (af_bella voice)
  - RVC voice conversion with Infamous_Miku_V2 model
  - Pitch shift: +12 semitones (Neru sound)
  - Pitch extraction: rmvpe
  - Index rate: 0.65
  - High-pass filter at 200Hz for "2004 BIOS" sound
  - Always-on when agentic mode is enabled

- **Image Vision**
  - AI can now analyze images using qwen3-vl:235b-instruct-cloud
  - Added analyze_image tool to AI

- **LUMA Updates**
  - Version display system
  - Patch notes system
  - Git-pull update mechanism

### Fixed
- TypeScript compilation errors in ai.ts (context message filtering)
- TypeScript compilation errors in copyright.ts (channel filtering)
- Command registration issues with empty commandList

### Changed
- Updated config to use commandList: [] (allow all commands)
- AI thinking messages now use custom arrays (UNHINGED_THINKING, FUN_MESSAGES, INTEREST_MESSAGES)
- Smarter agentic mode with importance threshold
- Better AI context (last 5 messages)

---

## [v1.1.0-r4] - Command Fix Update

### Fixed
- Login API response format (added success field)
- AI custom thinking messages
- Copyright SmartClaim periodic scanning with appeals thread

---

## [v1.1.0-r3] - Previous Releases

### Added
- Housing system (/housing buy, sell, rent)
- Jobs system (/jobs apply, work, quit)
- Company system (/company create, issue-stock, buy-stock)
- Stock market (/stock market, buy, sell, portfolio)
- AI agentic mode with reasoning
- LUMA Node.js CLI replacement

### Fixed
- Various economy resets
- Database schema additions
