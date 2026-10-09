# Video Generator Component: quick start

**What was wrong:** Veo doesn't hand back a video, it hands back a *job*. The page
has to start the job, keep checking on it, then play the file. That loop is what
this adds.

## 5 steps

1. **Get a Gemini API key** (Google AI Studio -> "Get API key"). Video generation
   needs a paid/billing-enabled key.
2. **Run the backend**
   ```sh
   cd video_component
   pip install fastapi uvicorn google-genai
   export GEMINI_API_KEY="your_key"
   uvicorn server:app --reload --port 8000
   ```
3. **Give your page a `<video id="player" controls>`** plus your existing prompt box,
   button, and a status line.
4. **Hook up the frontend**: add `video-panel.js` and call `initVideoPanel({...})`
   with your element references (example at the top of that file).
5. **Test it**: type "a paper boat drifting down a neon-lit rainy street, slow
   tracking shot", hit generate, wait 1–3 minutes.

## If it still doesn't show a video

| Symptom | Likely cause |
|---|---|
| Status stuck on "generating" | Normal for up to ~3 min; check server logs after that |
| `refused` | Gemini moderator declined the prompt, reword it |
| `No video returned` | Veo safety filter, or the key has no video access/billing |
| Browser CORS error | Frontend on a different port: add FastAPI `CORSMiddleware` or set `apiBase: ''` and proxy |
| 404 on model | Set `VEO_MODEL` to a model your key can use (check current Veo model list) |

Configurable env vars: `VEO_MODEL`, `REFINER_MODEL`, `VIDEO_OUT_DIR`.

## Letting Gemini adapt it to the real infrastructure

Paste `GEMINI_PROMPT.md` into AI Studio with these files + your page source. It
tells Gemini to translate the flow to your stack and add auth, rate limits,
storage, and digital-twin personalisation.
