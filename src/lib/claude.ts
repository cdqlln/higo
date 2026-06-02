/* Claude API client — direct browser fetch.
 *
 * Requires `anthropic-dangerous-direct-browser-access: true` header.
 * If no API key is configured, callers fall back to demo mode (see runAgent).
 */

import { callTool } from "./mcp";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: ClaudeContent[];
}

export type ClaudeContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface ClaudeStreamEvent {
  type:
    | "text_delta"
    | "tool_use"
    | "tool_result"
    | "message_stop"
    | "error";
  text?: string;
  toolUseId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  toolMs?: number;
  error?: string;
}

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export async function* runAgent(opts: {
  apiKey: string;
  model: string;
  system: string;
  messages: ClaudeMessage[];
  tools: { name: string; description: string; input_schema: object }[];
  maxRounds?: number;
}): AsyncGenerator<ClaudeStreamEvent> {
  const { apiKey, model, system, tools } = opts;
  let messages = [...opts.messages];
  const maxRounds = opts.maxRounds ?? 4;

  for (let round = 0; round < maxRounds; round++) {
    const body: Record<string, unknown> = {
      model,
      max_tokens: 1500,
      system,
      messages,
    };
    if (tools.length > 0) body.tools = tools;

    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      yield { type: "error", error: `Network error: ${(e as Error).message}` };
      return;
    }

    if (!res.ok) {
      const txt = await res.text();
      yield { type: "error", error: `Claude API ${res.status}: ${txt.slice(0, 300)}` };
      return;
    }

    const data = (await res.json()) as {
      content: ClaudeContent[];
      stop_reason: string;
    };

    const assistantContent: ClaudeContent[] = [];
    const toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];

    for (const block of data.content) {
      assistantContent.push(block);
      if (block.type === "text") {
        // emit a single text_delta with the whole text (no streaming for simplicity)
        yield { type: "text_delta", text: block.text };
      } else if (block.type === "tool_use") {
        yield {
          type: "tool_use",
          toolUseId: block.id,
          toolName: block.name,
          toolInput: block.input,
        };
        toolCalls.push({ id: block.id, name: block.name, input: block.input });
      }
    }

    if (data.stop_reason !== "tool_use" || toolCalls.length === 0) {
      yield { type: "message_stop" };
      return;
    }

    // Add the assistant's tool_use turn to the conversation
    messages.push({ role: "assistant", content: assistantContent });

    // Execute tools locally + emit results
    const resultContents: ClaudeContent[] = [];
    for (const tc of toolCalls) {
      const t0 = performance.now();
      let result: unknown;
      let isError = false;
      try {
        result = await callTool(tc.name, tc.input);
      } catch (e) {
        result = { error: (e as Error).message };
        isError = true;
      }
      const ms = Math.round(performance.now() - t0);
      yield {
        type: "tool_result",
        toolUseId: tc.id,
        toolName: tc.name,
        toolResult: result,
        toolMs: ms,
      };
      resultContents.push({
        type: "tool_result",
        tool_use_id: tc.id,
        content: JSON.stringify(result),
        is_error: isError,
      });
    }

    messages.push({ role: "user", content: resultContents });
    // loop continues — model now reads tool results and produces final text
  }

  yield { type: "message_stop" };
}
