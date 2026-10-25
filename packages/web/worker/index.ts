import { registerCategories } from "@agentic-wordle/core/engine";
import { words } from "@words";
import { type ApiEnv, handleApi } from "./api.ts";

interface Env extends ApiEnv {
  ASSETS: Fetcher;
}

// The answer lists are private. They are bundled into the Worker and never served as assets.
registerCategories(words);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error: "invalid_request" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
