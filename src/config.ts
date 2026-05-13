import { z } from "zod";

const portSchema = z.coerce.number().int().min(1).max(65535);

const envSchema = z.object({
  EMAIL_HOST: z.string().min(1, "EMAIL_HOST is required"),
  EMAIL_PORT: portSchema,
  EMAIL_USER: z.string().email("EMAIL_USER must be a valid email"),
  EMAIL_PASS: z.string().min(1, "EMAIL_PASS is required"),
  SMTP_HOST: z.string().min(1, "SMTP_HOST is required"),
  SMTP_PORT: portSchema,
  SMTP_USER: z.string().email("SMTP_USER must be a valid email"),
  SMTP_PASS: z.string().min(1, "SMTP_PASS is required"),
});

export interface Config {
  imap: { host: string; port: number; user: string; pass: string };
  smtp: { host: string; port: number; user: string; pass: string };
}

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const messages = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    throw new Error(`Configuration error — ${messages}`);
  }
  const env = result.data;
  return {
    imap: {
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASS,
    },
    smtp: { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER, pass: env.SMTP_PASS },
  };
}
