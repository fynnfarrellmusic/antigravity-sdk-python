# Prompt to paste into Google AI Studio (Gemini) to wire this into the real app

Open the AI Studio project that holds the video page, paste this, and attach
`server.py` and `video-panel.js` from this folder plus your page's source.

---

You are a senior full-stack engineer integrating a video generation module into an
existing platform (AI agent + digital twin + lifestyle support + creative network).

CONTEXT
- The video page UI already exists and renders correctly, but clicking "generate"
  never shows a result.
- I'm attaching a working reference backend (`server.py`: FastAPI + Gemini prompt
  refiner + Veo via google-genai, with start -> poll -> download) and a frontend
  helper (`video-panel.js`).

YOUR TASKS
1. Find the generate handler in my page. Replace its logic with the three-step flow:
   POST /api/video -> poll GET /api/video/{id} every ~4s -> set <video>.src to the
   returned url. Keep my existing markup and styling; only bind to my element IDs.
2. Remove any API keys from client code. The key lives only in the server env var
   GEMINI_API_KEY.
3. Match my stack. If I use React/Next/Vue/Angular, translate video-panel.js into
   idiomatic code (hooks/composables) and, if I use Next.js or Node, port server.py
   to route handlers using `@google/genai` (`ai.models.generateVideos`,
   `ai.operations.getVideosOperation`, then download the file).
4. Integrate with the platform: accept an optional `user_context` (digital twin
   style/preferences) and prepend it to the refiner so videos reflect the user's
   creative profile. Store finished videos in our existing storage instead of local
   disk, and replace the in-memory JOBS dict with our DB/queue.
5. Add: per-user rate limiting, auth check on all three endpoints, a cancel button,
   and clear error states (refused by safety, timeout, quota).
6. Return: a list of files changed, a diff-style summary, and a 5-step test plan.

RULES
- Don't invent endpoints or models I haven't confirmed. If Veo model names or SDK
  signatures differ in the current docs, tell me and use the current ones.
- Ask me at most 3 clarifying questions, only if truly blocking.
