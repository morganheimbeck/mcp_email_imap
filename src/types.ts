export interface EmailSummary {
  uid: string;
  messageId: string;
  from: string;
  subject: string;
  date: string; // ISO 8601
  seen: boolean;
  folder: string;
}

export interface EmailMessage extends EmailSummary {
  to: string[];
  cc: string[];
  textBody: string;
  htmlBody: string;
  headers: Record<string, string>;
}

export interface Folder {
  path: string;
  name: string;
  delimiter: string;
  flags: string[];
}

export interface Draft {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}
