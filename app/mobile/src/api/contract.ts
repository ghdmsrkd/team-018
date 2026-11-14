/**
 * Local copy of the Lambda API contract v0.1 from packages/schema/src/api.ts (main 18cd45f).
 * The app is not part of a JS workspace, so it cannot import the package directly; keep this
 * file in sync with that source. The relay forwards Bedrock Converse JSON unchanged; the
 * model id and maxTokens are fixed on the server and must not be sent.
 */

export interface ToolSpec {
  toolSpec: {
    name: string;
    description: string;
    inputSchema: { json: Record<string, unknown> };
  };
}

export type ContentBlock =
  | { text: string }
  | {
      toolUse: {
        toolUseId: string;
        name: string;
        input: Record<string, unknown>;
      };
    }
  | {
      toolResult: {
        toolUseId: string;
        content: Array<{ text: string } | { json: unknown }>;
        status?: 'success' | 'error';
      };
    };

export interface Message {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

/** POST /chat */
export interface ChatRequest {
  system: Array<{ text: string }>;
  messages: Message[];
  toolConfig?: { tools: ToolSpec[] };
}

export interface ChatResponse {
  output: { message: Message };
  stopReason:
    | 'end_turn'
    | 'tool_use'
    | 'max_tokens'
    | 'stop_sequence'
    | 'content_filtered'
    | string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

export interface ApiError {
  error: string;
  detail?: string;
}

/** Evidence card: the model gives only type and id; the app re-reads content locally. */
export type CardRef =
  | { type: 'trip'; id: string }
  | { type: 'day'; id: string }
  | { type: 'stay'; id: string }
  | { type: 'place'; id: string };

export interface AgentAnswer {
  text: string;
  cards: CardRef[];
}
