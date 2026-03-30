# Paper Pill

A minimal “soul pharmacy” web app: unload your mind, distill, receive one book as prescription. Built with React, Vite, Tailwind CSS, and Framer Motion.

### Setup

```bash
cd paperpill   # or wherever you cloned/renamed this folder
npm install
npm run dev
```

Open the URL printed in the terminal (default **http://localhost:3001/**). If that port is taken, Vite will show another port—use that one.

### Environment (LLM)

Copy `.env.example` to `.env` and set `VITE_PAPER_PILL_API_KEY`. Restart the dev server after editing `.env`. See `.env.example` for optional API URL / model overrides.

**Why it used to show only mock results:** browsers block cross-origin requests (CORS) to DeepSeek/Moonshot. `npm run dev` now proxies API calls through Vite (`/__paperpill/openai`), so the browser only talks to `localhost` and the real API is reached from the dev server.

If the API still fails, open **DevTools → Console**: you’ll see `[Paper Pill] API failed — using mock prescription` with the error message.

### Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run preview` — preview production build
- `npm run lint` — ESLint
