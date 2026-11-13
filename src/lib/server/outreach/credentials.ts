import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { z } from "zod";

export const senderCredentialsSchema = z.object({
  senderName: z.string().trim().min(1).max(100).default("Dylan (ASP Private Capital)"),
  email: z.string().email(),
  password: z.string().transform(value => value.replace(/\s/g, "")).pipe(z.string().regex(/^[a-zA-Z0-9]{16}$/, "Enter the 16-character Google App Password.")),
}).strict();
export type SenderCredentials = z.infer<typeof senderCredentialsSchema>;
export async function testSenderConnection(input: SenderCredentials) {
  const smtp = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: input.email, pass: input.password }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, tls: { rejectUnauthorized: true } });
  const imap = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: input.email, pass: input.password }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, tls: { rejectUnauthorized: true }, logger: false });
  const results = await Promise.allSettled([
    smtp.verify().finally(() => smtp.close()),
    (async () => { try { await imap.connect(); return true; } finally { imap.close(); } })(),
  ]);
  // Never return provider errors: they can contain authentication or mailbox details.
  return { smtp: results[0].status === "fulfilled", imap: results[1].status === "fulfilled", testedAt: new Date().toISOString() };
}
