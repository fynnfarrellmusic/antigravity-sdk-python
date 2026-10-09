// Framework-agnostic frontend glue. Paste into your AI Studio page (or import it)
// and point it at your existing elements. Works with plain HTML, React (call it in
// useEffect with refs), Vue, etc.
//
// Usage:
//   initVideoPanel({
//     promptEl: document.querySelector('#prompt'),
//     buttonEl: document.querySelector('#generate'),
//     statusEl: document.querySelector('#status'),
//     videoEl:  document.querySelector('#player'),   // a <video controls> tag
//     apiBase:  'http://localhost:8000',              // '' if served from same origin
//   });

const STATUS_TEXT = {
  queued: 'Warming up…',
  refining: 'Gemini is polishing your idea…',
  generating: 'Rendering your video (this takes 1–3 minutes)…',
  downloading: 'Almost there…',
  done: 'Done!',
};

export function initVideoPanel({ promptEl, buttonEl, statusEl, videoEl, apiBase = '' }) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const say = (msg) => { statusEl.textContent = msg; };

  buttonEl.addEventListener('click', async () => {
    const prompt = promptEl.value.trim();
    if (prompt.length < 3) return say('Tell me a bit more about the video first.');

    buttonEl.disabled = true;
    videoEl.removeAttribute('src');
    try {
      // 1. Start the job
      const start = await fetch(`${apiBase}/api/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, aspect_ratio: '16:9', refine: true }),
      });
      if (!start.ok) throw new Error(`Server said ${start.status}`);
      const { id } = await start.json();

      // 2. Poll until finished (the step that was missing)
      for (;;) {
        await sleep(4000);
        const res = await fetch(`${apiBase}/api/video/${id}`);
        const job = await res.json();
        if (job.status === 'error') throw new Error(job.error || 'Generation failed');
        if (job.status === 'refused') return say(`Can't make that one: ${job.error}`);
        say(STATUS_TEXT[job.status] || job.status);

        // 3. Play the result
        if (job.status === 'done') {
          videoEl.src = `${apiBase}${job.url}`;
          videoEl.load();
          videoEl.play().catch(() => {}); // autoplay may be blocked; controls still work
          return;
        }
      }
    } catch (err) {
      say(`Something went wrong: ${err.message}`);
    } finally {
      buttonEl.disabled = false;
    }
  });
}
