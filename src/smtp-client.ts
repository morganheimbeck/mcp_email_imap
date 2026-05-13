import nodemailer, { type Transporter } from "nodemailer";
import type { Config } from "./config.js";
import type { Draft } from "./types.js";

export class SmtpClient {
  private transporter: Transporter;
  private fromAddress: string;

  constructor(config: Config["smtp"]) {
    this.fromAddress = config.user;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: true,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }

  async sendMail(draft: Draft): Promise<string> {
    const info = await this.transporter.sendMail({
      from: draft.from ?? this.fromAddress,
      to: draft.to.join(", "),
      cc: draft.cc?.join(", "),
      bcc: draft.bcc?.join(", "),
      subject: draft.subject,
      text: draft.text,
      html: draft.html,
    });
    return info.messageId as string;
  }
}
