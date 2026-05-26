export type RawJsonlRecord = Record<string, unknown> & { type?: string };

export interface SummaryRecord {
  type: "summary";
  summary: string;
  leafUuid: string;
  [key: string]: unknown;
}

export interface MessageRecord {
  type: "user" | "assistant";
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  sessionId?: string;
  isSidechain?: boolean;
  message: {
    role: "user" | "assistant";
    content: unknown;
  };
  [key: string]: unknown;
}

export interface ConversationMeta {
  filePath: string;
  fileName: string;
  projectFolder: string;
  projectDisplayName: string;
  conversationId: string;
  title: string;
  hasSummary: boolean;
  leafUuid: string | undefined;
  firstMessageAt: string | undefined;
  lastModifiedAt: string;
  realMessageCount: number;
  archived: boolean;
  sizeBytes: number;
}

export interface RenderedMessage {
  role: "user" | "assistant";
  uuid: string;
  timestamp: string;
  text: string;
  raw: MessageRecord;
}
