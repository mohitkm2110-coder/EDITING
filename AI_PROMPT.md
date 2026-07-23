# Deep Wave — AI Video Editor Prompt (Qwen 3)

Build an AI-powered video editing agent using **Qwen 3 as the primary LLM**.

The LLM must act as the brain of the editing system. It should understand the user's instructions, analyze video metadata and AI-detected events, decide what edits should be applied, and generate a structured JSON editing plan.

## IMPORTANT ARCHITECTURE

- LLM: **Qwen 3**
- Video understanding/vision: Use a suitable vision model when visual analysis is required.
- Speech-to-text: **Whisper**
- Audio/beat analysis: **Librosa**
- Video processing: **FFmpeg**
- The LLM must **NOT** directly edit or render video.
- The LLM should generate a precise editing plan in **JSON**.
- FFmpeg or the video-processing engine must execute that editing plan.

## CORE WORKFLOW

1. User uploads the original video.
2. Keep the original video completely untouched.
3. Ask the user to select or upload music.
4. Show all editing options **before** processing.
5. **All editing options must be OFF by default.**
6. The user selects the desired options.
7. Only start processing after the user clicks "Generate Edit".
8. Analyze the video and music.
9. Qwen 3 generates a structured JSON editing plan.
10. The video-processing engine executes the plan.
11. Render the final video **without changing anything that the user did not request**.

## EDITING OPTIONS

- Auto Cut Boring Clips
- Auto Detect Highlights
- Auto Add Captions
- Auto Add Transitions
- Auto Add Effects
- Auto Zoom Effects
- Auto Beat Sync
- Color Grading

## CRITICAL VIDEO RULE

If "Auto Cut Boring Clips" is **OFF**, NEVER trim, cut, delete, or shorten any part of the original video.

The final video must preserve:
- **100%** of the original footage
- Original video duration
- Original sequence of clips

Music can be added and edited independently without modifying the original footage.

## AI VIDEO ANALYSIS

Analyze the video to detect:
- Important gameplay moments
- Kills and eliminations
- Round Won events
- Match Point / Final Round events
- Score changes
- High-action moments
- Important audio events
- Gameplay highlights

For gaming videos, prioritize actual gameplay events and important game-state changes over random visual changes.

## MUSIC & BEAT SYNC

When Auto Beat Sync is enabled:
- Analyze the music using audio analysis.
- Detect beats, strong beats, drops, and major transitions.
- Synchronize effects, zooms, transitions, and other visual edits with the music.
- Never cut the original video unless Auto Cut Boring Clips is enabled.
- Keep gameplay audio and music properly balanced.
- If music is shorter than the video, intelligently loop or extend it.
- If music is longer than the video, match it to the final video duration.

## COLOR GRADING

For gaming videos:
- Improve exposure and contrast.
- Maintain natural colors.
- Avoid excessive brightness.
- Avoid over-saturation.
- Avoid washed-out footage.
- Use clean, professional gaming-style color grading.

## EFFECTS

- Keep effects subtle and professional.
- Avoid excessive flashes, glitches, shakes, and transitions.
- Synchronize effects with important gameplay moments or music beats.
- Do not add unnecessary effects.

## QWEN 3 JSON OUTPUT

Before editing, Qwen 3 must generate a structured JSON plan containing:
- Original video duration
- Music duration
- Detected important moments
- Detected beats
- Enabled editing options
- Planned edits
- Planned effects
- Planned transitions
- Color grading settings
- Audio settings
- Expected final duration

The JSON must be machine-readable and must be passed to the video-processing engine.

The AI must never randomly modify the user's footage. Every modification must be based on an enabled editing option or an explicit user instruction.

The system should be modular, reliable, and easy to extend with additional AI models and editing features in the future.
