import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export interface InboundEmail {
  uid: number;
  from: string;
  fromName?: string;
  subject: string;
  text: string;
  date: Date;
  inReplyTo?: string;
}

export function cleanReplyBody(text: string): string {
  if (!text) return "";
  const cutPatterns = [
    /\n\s*On\s+[\s\S]+?wrote:\s*[\s\S]*/i,
    /\n\s*---\s*Original Message\s*---[\s\S]*/i,
    /\n\s*_{2,}[\s\S]*/i,
    /\n\s*>[\s\S]*/,
  ];
  let cleaned = text;
  for (const pat of cutPatterns) {
    cleaned = cleaned.replace(pat, "");
  }
  return cleaned.trim();
}

/** Snapshot all existing message UIDs currently in INBOX from this prospect */
export async function getExistingProspectMessageUids(prospectEmail: string): Promise<Set<number>> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  const existing = new Set<number>();
  if (!user || !pass || !prospectEmail) return existing;

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const seqs = await client.search({ from: prospectEmail.toLowerCase().trim() });
      if (seqs && seqs.length) {
        for (const seq of seqs) {
          try {
            const msg = await client.fetchOne(seq, { uid: true });
            if (msg && msg.uid) existing.add(Number(msg.uid));
          } catch {
            // continue
          }
        }
      }
    } finally {
      lock.release();
    }
  } catch {
    // Ignore error
  } finally {
    await client.logout().catch(() => {});
  }
  return existing;
}

export async function fetchLatestInboundReply(options: {
  prospectEmail: string;
  subjectKeyword?: string;
  processedUids?: Set<number>;
  minDate?: Date;
}): Promise<InboundEmail | null> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

  if (!user || !pass) {
    throw new Error("Missing GMAIL_USER or GMAIL_APP_PASSWORD in environment");
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    logger: false,
  });

  try {
    await client.connect();
  } catch {
    return null;
  }

  const lock = await client.getMailboxLock("INBOX");
  try {
    const searchCriteria: Record<string, unknown> = {};
    if (options.prospectEmail) {
      searchCriteria.from = options.prospectEmail.trim().toLowerCase();
    }
    if (options.subjectKeyword) {
      searchCriteria.subject = options.subjectKeyword;
    }

    const seqs = await client.search(searchCriteria);
    if (!seqs || !seqs.length) return null;

    // Iterate backwards from newest to find latest matching prospect
    for (let i = seqs.length - 1; i >= 0 && i >= seqs.length - 15; i--) {
      const seq = seqs[i];
      try {
        const msg = await client.fetchOne(seq, { uid: true, envelope: true, source: true });
        if (!msg) continue;

        const uid = Number(msg.uid);
        if (options.processedUids?.has(uid)) continue;

        const senderAddress = msg.envelope?.from?.[0]?.address?.toLowerCase() ?? "";
        const targetProspect = options.prospectEmail.toLowerCase().trim();

        const matchesSender = senderAddress === targetProspect;
        const msgDate = msg.envelope?.date ? new Date(msg.envelope.date) : new Date();

        // Strict temporal boundary: Reply must not predate the outbound email
        if (options.minDate && msgDate.getTime() < options.minDate.getTime() - 5000) {
          continue;
        }

        if (matchesSender && msg.source) {
          const parsed = await simpleParser(msg.source) as { text?: string };
          const rawText = parsed.text ?? "";
          const cleanedText = cleanReplyBody(rawText);

          return {
            uid,
            from: senderAddress,
            fromName: msg.envelope?.from?.[0]?.name,
            subject: msg.envelope?.subject ?? "",
            text: cleanedText || rawText.trim(),
            date: msgDate,
            inReplyTo: msg.envelope?.inReplyTo,
          };
        }
      } catch {
        // Continue scanning
      }
    }

    return null;
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}

/** Check if the human operator sent a manual email from Sent Mail to this prospect */
export async function checkOperatorSentIntervention(options: {
  prospectEmail: string;
  afterDate?: Date;
}): Promise<{ manualSentDetected: boolean; subject?: string; date?: Date } | null> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) return null;

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    logger: false,
  });

  try {
    await client.connect();
    let lock;
    try {
      lock = await client.getMailboxLock("[Gmail]/Sent Mail");
    } catch {
      try {
        lock = await client.getMailboxLock("Sent");
      } catch {
        return null;
      }
    }

    try {
      const searchCriteria: Record<string, unknown> = {};
      if (options.prospectEmail) {
        searchCriteria.to = options.prospectEmail;
      }
      const seqs = await client.search(searchCriteria);
      if (!seqs || !seqs.length) return null;

      for (let i = seqs.length - 1; i >= 0 && i >= seqs.length - 10; i--) {
        const msg = await client.fetchOne(seqs[i], { envelope: true, source: true });
        if (!msg) continue;
        const msgDate = msg.envelope?.date ? new Date(msg.envelope.date) : new Date();
        if (options.afterDate && msgDate.getTime() < options.afterDate.getTime() - 5000) {
          continue;
        }

        const rawSource = msg.source ? msg.source.toString() : "";
        const rawLower = rawSource.toLowerCase();
        // RFC 5322 header names are case-insensitive. Gmail normalizes X-ASP-Origin to X-Asp-Origin.
        const isAgentOutreach =
          rawLower.includes("x-asp-origin: autonomous_agent") ||
          rawLower.includes("x-asp-agent: dylan") ||
          rawLower.includes("x-asp-workflow-id") ||
          rawLower.includes("x-asp-origin");

        if (!isAgentOutreach) {
          return {
            manualSentDetected: true,
            subject: msg.envelope?.subject,
            date: msgDate,
          };
        }
      }
      return null;
    } finally {
      lock.release();
    }
  } catch {
    return null;
  } finally {
    await client.logout().catch(() => {});
  }
}
