import { logAction } from "../logger.js";
import type { SmtpClient } from "../smtp-client.js";
import type { Draft } from "../types.js";

export interface CreateDraftInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
}

export interface SendEmailInput extends CreateDraftInput {
  confirmed: boolean;
}

export interface SendEmailResult {
  messageId: string;
}

export async function handleCreateDraft(input: CreateDraftInput): Promise<Draft> {
  if (!input.to || input.to.length === 0) throw new Error("to is required and must not be empty");
  if (!input.subject) throw new Error("subject is required");
  const draft: Draft = {
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.text,
    html: input.html,
  };
  logAction("create_draft", { to: draft.to, subject: draft.subject });
  return draft;
}

export async function handleSendEmail(
  smtp: SmtpClient,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  if (input.confirmed !== true) {
    throw new Error(
      "send_email requires confirmed: true — set confirmed to true to authorise sending",
    );
  }
  if (!input.to || input.to.length === 0) throw new Error("to is required and must not be empty");
  if (!input.subject) throw new Error("subject is required");
  const messageId = await smtp.sendMail({
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  logAction("send_email", { to: input.to, subject: input.subject, messageId });
  return { messageId };
}
