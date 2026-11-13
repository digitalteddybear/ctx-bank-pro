"use client";
import { useReplyTemplatePreview } from "@/lib/reply-template-preview";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Switch } from "@astryxdesign/core/Switch";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Badge as AstryxBadge } from "@astryxdesign/core/Badge";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import {
  AlertTriangle,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Mail,
  Send,
  Sparkles,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import { requestBackendSync } from "@/lib/backend-sync";

type DemoStatus = {
  modelReady: boolean;
  modelConfigured: boolean;
  recipientEmail: string;
  recipientName: string;
  hubspotContactId: string;
  gmailUser: string | null;
  liveEmailConfigured: boolean;
  hubspotWritesConfigured: boolean;
  hubspotWritesEnabled: boolean;
  recentAuditLogs: Array<{
    timestamp: string;
    operation: string;
    decision: string;
    status: string;
    httpStatus?: number;
  }>;
};
type DemoCrmProperties={ctx_status:string|null;ctx_last_contact:string|null;ctx_booking_link_sent:string|null};

const DEFAULT_FIRST_MESSAGE = `Hello,
We are following up regarding your recorded private-market profile (profile information held in our knowledge bank). The purpose of our outreach is to gather interest into ASP Private Capital as private market liaisons. Specific opportunities are never disclosed until an introductory consultation call or meeting with ASP. The furthest we go regarding opportunities is sharing general macroeconomic perspectives across our operating sectors: managed funds, private equity, and precious metals. We act as a capital introducer and liaison, not an investment adviser. If you are interested in discussing macroeconomic developments across these sectors, please let us know.
Reply stop if you would prefer no further contact.
ASP Private Capital`;

const DEMO_STEPS = [
  "1. Configuration & Message",
  "2. Outreach Dispatch",
  "3. CRM Booking & Follow-up",
] as const;

export function AgentsLiveDemoModal({
  isOpen,
  onOpenChange,
  onRunUpdated,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRunUpdated?: () => void;
}) {
  const [status, setStatus] = useState<DemoStatus | null>(null);

  // Session State
  const [activeStep, setActiveStep] = useState<0 | 1 | 2>(0);
  const [demoState, setDemoState] = useState<"not_started" | "dispatched" | "replied" | "booked">("not_started");
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

  // Target Prospect Configuration
  const [prospectName, setProspectName] = useState("Dylan");
  const [prospectEmail, setProspectEmail] = useState("digitalteddybear2002@gmail.com");
  const [hubspotContactId, setHubspotContactId] = useState("908035561662");
  const prospectDirty = useRef(false);

  // First Outbound Message Configuration (fully editable and reactive)
  const [customSubject, setCustomSubject] = useState("Your private-market interests");
  const [customBody, setCustomBody] = useState(DEFAULT_FIRST_MESSAGE);
  const [replyPreviewOpen,setReplyPreviewOpen]=useState(false);
  const [replyHtmlTemplate,setReplyHtmlTemplate]=useState('<!doctype html><html><body style="font-family:Arial,sans-serif;color:#202124"><div>{{message}}</div></body></html>');
  const replyPreview = useReplyTemplatePreview(replyHtmlTemplate);
  const customBodyRef = useRef<HTMLTextAreaElement>(null);
  const demoTemplateDirty=useRef(false);
  const editReplyTemplate=(value:string)=>{demoTemplateDirty.current=true;setReplyHtmlTemplate(value);};
  useEffect(() => { const saved = localStorage.getItem("ctx-reply-html-template"); if (saved) setReplyHtmlTemplate(saved); }, []);
  useEffect(() => { let active=true; void fetch("/api/agents/campaign?templateScope=demo",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject()).then((data:{version:number;template:string})=>{if(active&&data.version>0&&!demoTemplateDirty.current)setReplyHtmlTemplate(data.template);}).catch(()=>undefined);return()=>{active=false;}; }, []);

  // Dispatched Record (captured upon real launch)
  const [dispatchedRecord, setDispatchedRecord] = useState<{
    subject: string;
    body: string;
    toName: string;
    toEmail: string;
    hubspotContactId: string;
    sentAt: string;
  } | null>(null);

  // Conversation & Booking State
  const [inboundReply, setInboundReply] = useState<{
    from: string;
    text: string;
    date: string;
    classification: string;
  } | null>(null);
  const [agentFollowUp, setAgentFollowUp] = useState<{
    subject: string;
    body: string;
  } | null>(null);
  const [calendarBooking, setCalendarBooking] = useState<{
    eventId: string;
    startsAt: string;
    status: string;
  } | null>(null);
  const [crmProperties,setCrmProperties]=useState<DemoCrmProperties|null>(null);

  // Runtime Controls & UI state
  const [liveSend, setLiveSend] = useState(true);
  const [liveCrm, setLiveCrm] = useState(true);
  const [useLiveModel, setUseLiveModel] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [simulatedReplyText, setSimulatedReplyText] = useState(
    "Hi Dylan, I would like to schedule an introductory consultation call to discuss macroeconomic allocations in precious metals."
  );

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/demo", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load demo status.");
      const data: DemoStatus = await res.json();
      setStatus(data);

      if (!prospectDirty.current && demoState === "not_started") {
        if (data.recipientName) setProspectName(data.recipientName);
        if (data.recipientEmail) setProspectEmail(data.recipientEmail);
        if (data.hubspotContactId) setHubspotContactId(data.hubspotContactId);
      }
      // CRITICAL: We do NOT auto-load past active runs from the database into demoState.
      // The modal opens in a clean, unstarted state ready for the operator to launch.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error connecting to demo API.");
    }
  }, [demoState]);

  useEffect(() => {
    if (isOpen) {
      void refreshStatus();
    }
  }, [isOpen, refreshStatus]);

  const insertDemoField=(token:string)=>{
    const input=customBodyRef.current;
    const start=input?.selectionStart??customBody.length;
    const end=input?.selectionEnd??customBody.length;
    setCustomBody(current=>current.slice(0,start)+token+current.slice(end));
    requestAnimationFrame(()=>{input?.focus();input?.setSelectionRange(start+token.length,start+token.length);});
  };

  const handleResetDemo = () => {
    setActiveStep(0);
    setDemoState("not_started");
    setCurrentRunId(null);
    setDispatchedRecord(null);
    setInboundReply(null);
    setAgentFollowUp(null);
    setCalendarBooking(null);
    setCrmProperties(null);
    setError("");
    setNotice("");
  };

  const handleStartDemo = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const trimmedName = prospectName.trim();
      const trimmedEmail = prospectEmail.trim();
      const trimmedHsId = hubspotContactId.trim();
      const trimmedSubject = customSubject.trim();
      const trimmedBody = customBody.trim();

      const res = await fetch("/api/agents/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          liveSend,
          liveCrm,
          useLiveModel,
          prospectName: trimmedName,
          prospectEmail: trimmedEmail,
          hubspotContactId: trimmedHsId,
          customSubject: trimmedSubject,
          customBody: trimmedBody,
          replyHtmlTemplate,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to initialize demo.");
      setCrmProperties(data.hubspotProperties??null);

      setCurrentRunId(data.runId);
      setDispatchedRecord({
        subject: data.draft?.subject || trimmedSubject,
        body: data.draft?.body || trimmedBody,
        toName: trimmedName,
        toEmail: trimmedEmail,
        hubspotContactId: trimmedHsId,
        sentAt: new Date().toLocaleTimeString(),
      });
      setDemoState("dispatched");
      setActiveStep(1); // Advance directly to Step 2: Outreach Dispatch
      const crmStatus = liveCrm
        ? `HubSpot read ${data.hubspotReadStatus ?? 'not verified'} · email log ${data.emailLogStatus ?? 'not attempted'} · contact update ${data.propertyUpdateStatus ?? 'not attempted'}.`
        : 'HubSpot writes are off.';
      setNotice(liveSend
        ? `Email sent to ${trimmedEmail}. ${crmStatus}`
        : `Draft approved; no email sent. ${crmStatus}`);
      onRunUpdated?.();
      requestBackendSync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo execution failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleSimulateReply = async () => {
    if (!currentRunId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/agents/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate-reply",
          runId: currentRunId,
          text: simulatedReplyText,
          liveSend,
          liveCrm,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to process reply.");

      setInboundReply({
        from: prospectEmail,
        text: simulatedReplyText,
        date: new Date().toLocaleTimeString(),
        classification: data.classification || "booking",
      });
      if(data.hubspotProperties)setCrmProperties(data.hubspotProperties);
      if (data.run?.draft) {
        setAgentFollowUp(data.run.draft);
      }
      setDemoState("replied");
      setActiveStep(2); // Advance directly to Step 3: CRM Booking & Follow-up
      setNotice(`Reply processed: ${String(data.classification).toUpperCase()}. Agent email ${data.replySent ? 'sent' : 'not sent'}; booking link ${data.run?.draft?.body?.includes('cal.com') ? 'included' : 'not included'}. HubSpot inbound log ${data.hubspotReplyLogStatus ?? 'not attempted'} · update ${data.hubspotReplyPropertyStatus ?? 'not attempted'} · agent reply log ${data.hubspotAgentReplyLogStatus ?? 'not attempted'}.`);
      onRunUpdated?.();
      requestBackendSync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to simulate reply.");
    } finally {
      setBusy(false);
    }
  };

  const handleCheckReply = async () => {
    if (!currentRunId) return;
    setPolling(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/agents/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check-reply",
          runId: currentRunId,
          liveSend,
          liveCrm,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to poll reply.");

      if (data.detected) {
        setInboundReply({
          from: data.inboundReply?.from || prospectEmail,
          text: data.inboundReply?.text || "Inbound reply received via IMAP.",
          date: data.inboundReply?.date || new Date().toLocaleTimeString(),
          classification: data.classification || "booking",
        });
        if(data.hubspotProperties)setCrmProperties(data.hubspotProperties);
        if (data.run?.draft) {
          setAgentFollowUp(data.run.draft);
        }
        setDemoState("replied");
        setActiveStep(2); // Advance directly to Step 3: CRM Booking & Follow-up
        setNotice(`Inbound reply detected via IMAP: ${String(data.classification).toUpperCase()}. Agent email ${data.replySent ? 'sent' : 'not sent'}; booking link ${data.run?.draft?.body?.includes('cal.com') ? 'included' : 'not included'}. HubSpot inbound log ${data.hubspotReplyLogStatus ?? 'not attempted'} · update ${data.hubspotReplyPropertyStatus ?? 'not attempted'} · agent reply log ${data.hubspotAgentReplyLogStatus ?? 'not attempted'}.`);
        onRunUpdated?.();
        requestBackendSync();
      } else {
        setNotice("No new reply found in inbox yet. Ensure you sent a reply to the email and try again in a few moments.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "IMAP check failed.");
    } finally {
      setPolling(false);
    }
  };

  const handleCheckBooking = async () => {
    if (!currentRunId) return;
    setBookingBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/agents/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check-booking",
          runId: currentRunId,
          liveCrm,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to check booking.");

      if (!data.booked || !data.booking) {
        setNotice("Waiting for the prospect to complete the Cal.com booking. CTX will update HubSpot after the signed Cal.com webhook confirms it.");
        if(data.crmProperties)setCrmProperties(data.crmProperties);
        return;
      }

      if(data.crmProperties)setCrmProperties(data.crmProperties);
      setCalendarBooking({
        eventId: data.booking.id,
        startsAt: data.booking.startsAt,
        status: data.booking.status,
      });
      setDemoState("booked");
      setNotice("Cal.com confirmed the booking. CTX has reconciled the run and HubSpot status.");
      onRunUpdated?.();
      requestBackendSync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check booking.");
    } finally {
      setBookingBusy(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width="min(95vw, 48rem)"
      maxHeight="90vh"
    >
      <DialogHeader title="Autonomous Agents — Live Interactive Demo" onOpenChange={onOpenChange} />
      {replyPreviewOpen && <Dialog isOpen={replyPreviewOpen} onOpenChange={setReplyPreviewOpen} purpose="form" width="min(88vw, 64rem)" maxHeight="82vh"><DialogHeader title="Reply template preview" onOpenChange={setReplyPreviewOpen}/><HStack gap={3} padding={4} style={{height:"60vh",alignItems:"stretch"}}><VStack gap={2} style={{width:"42%",minWidth:260}}><TextArea label="HTML template" rows={14} value={replyHtmlTemplate} onChange={editReplyTemplate}/><Text type="supporting">Use {'{{message}}'} for the reply text.</Text></VStack><iframe title="Expanded demo email preview" sandbox="" srcDoc={replyPreview.html} style={{flex:1,minWidth:0,border:"1px solid var(--border)",background:"white"}}/></HStack></Dialog>}
      <VStack padding={4} gap={4} height="78vh" isScrollable>
        {/* Step Navigation (Exactly 3 steps, no inbox reply polling tab) */}
        <HStack gap={2}>
          {DEMO_STEPS.map((label, idx) => (
            <Button
              key={label}
              label={label}
              size="sm"
              variant={activeStep === idx ? "primary" : "secondary"}
              onClick={() => setActiveStep(idx as 0 | 1 | 2)}
            />
          ))}
        </HStack>

        {/* STEP 0: Configuration & Message */}
        {activeStep === 0 && (
          <VStack gap={4}>
            {/* Section 1: Target Prospect */}
            <div
              style={{
                padding: "16px",
                borderRadius: "8px",
                background: "var(--background-secondary, rgba(255, 255, 255, 0.04))",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Bot size={18} style={{ color: "var(--primary)" }} />
                  <Text weight="semibold" type="label">
                    Target Prospect Configuration
                  </Text>
                </div>
                <AstryxBadge label="Controlled Test Boundary" variant="success" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <TextInput
                  label="Prospect Name"
                  size="sm"
                  value={prospectName}
                  onChange={(val) => {
                    prospectDirty.current = true;
                    setProspectName(val);
                  }}
                  isDisabled={busy}
                />
                <TextInput
                  label="Prospect Email"
                  type="email"
                  size="sm"
                  value={prospectEmail}
                  onChange={(val) => {
                    prospectDirty.current = true;
                    setProspectEmail(val);
                  }}
                  isDisabled={busy}
                />
              </div>

              <TextInput
                label="HubSpot Contact ID (Optional)"
                size="sm"
                value={hubspotContactId}
                onChange={(val) => {
                  prospectDirty.current = true;
                  setHubspotContactId(val);
                }}
                isDisabled={busy}
                description="Mapped HubSpot test contact record. Defaults to verified test contact 908035561662."
              />
            </div>

            {/* Section 2: First Outbound Message */}
            <div
              style={{
                padding: "16px",
                borderRadius: "8px",
                background: "var(--background-secondary, rgba(255, 255, 255, 0.04))",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Mail size={16} style={{ color: "var(--primary)" }} />
                  <Text weight="semibold" type="label">
                    First Outbound Message
                  </Text>
                </div>
                <AstryxBadge label="Compliance Screened" variant="info" />
              </div>

              <TextInput
                label="Subject Line"
                size="sm"
                value={customSubject}
                onChange={setCustomSubject}
                isDisabled={busy}
              />

              <HStack gap={2} wrap="wrap">{[["First name","{{First name}}"],["Sender","{{Sender}}"],["Sender email","{{Sender email}}"],["Privacy footer","{{Standard company and privacy footer}}"]].map(([label,token])=><Button key={token} label={label} size="sm" variant="secondary" onClick={()=>insertDemoField(token)} isDisabled={busy}/>)}</HStack>
              <TextArea
                ref={customBodyRef}
                label="Opening Message Body"
                rows={6}
                maxLength={8000}
                value={customBody}
                onChange={setCustomBody}
                isDisabled={busy}
                description="Tags resolve from the verified HubSpot contact and sender settings. Unresolved tags block delivery; the saved campaign footer fills the privacy footer tag."
              />
              <TextArea label="Reply HTML template" rows={5} maxLength={20000} value={replyHtmlTemplate} onChange={editReplyTemplate} isDisabled={busy} description="Used only for agent replies after the prospect responds. Use {{message}} for the reply text."/>
              <HStack gap={2}><Button label="Save" size="sm" variant="primary" className="button button--primary button--sm" onClick={async()=>{try{const response=await fetch('/api/agents/campaign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save-reply-template',scope:'demo',template:replyHtmlTemplate})});if(!response.ok)throw new Error('Template was not saved.');localStorage.setItem("ctx-reply-html-template",replyHtmlTemplate);setNotice("Demo reply template saved.");}catch(error){setError(error instanceof Error?error.message:'Template was not saved.');}}}/><Button label="Expand preview" size="sm" onClick={()=>setReplyPreviewOpen(true)} isDisabled={busy}/></HStack>
              <Text type="label">Reply preview</Text>
              {replyPreview.error&&<Text role="alert">{replyPreview.error}</Text>}
              <iframe title="Demo reply email preview" sandbox="" srcDoc={replyPreview.html} style={{width:"100%",height:180,border:"1px solid var(--border)",borderRadius:8,background:"white"}} />
            </div>

            {/* Section 3: Execution Controls */}
            <div
              style={{
                padding: "16px",
                borderRadius: "8px",
                background: "var(--background-secondary, rgba(255, 255, 255, 0.04))",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <Text weight="semibold" type="label">
                Execution Controls
              </Text>

              <Switch
                label="Live Email Dispatch via Gmail SMTP"
                description={`Sends real email over TLS from ${status?.gmailUser ?? "configured Gmail"}.`}
                value={liveSend}
                onChange={setLiveSend}
                isDisabled={busy || !status?.liveEmailConfigured}
              />

              <Switch
                label="Live HubSpot CRM Synchronization"
                description="Updates real HubSpot contact properties (ctx_status, ctx_last_contact) and logs timeline notes."
                value={liveCrm}
                onChange={setLiveCrm}
                isDisabled={busy || !status?.hubspotWritesConfigured}
              />

              <VStack gap={2}>
                <Text type="label" color="secondary">
                  Model
                </Text>
                <SegmentedControl
                  label="Inference mode"
                  value={useLiveModel === undefined ? "auto" : useLiveModel ? "gemini" : "persona"}
                  onChange={(v) => setUseLiveModel(v === "auto" ? undefined : v === "gemini")}
                  size="sm"
                >
                  <SegmentedControlItem value="auto" label={status?.modelReady ? "Auto · Live" : status?.modelConfigured ? "Auto · Setup" : "Auto · Offline"} />
                  <SegmentedControlItem value="persona" label="Offline" />
                  <SegmentedControlItem value="gemini" label="Live" />
                </SegmentedControl>
              </VStack>
            </div>

            <div style={{ marginTop: "4px" }}>
              <Button
                variant="primary"
                size="md"
                label={busy ? "Generating & Dispatching..." : "Launch Live Outreach Demo"}
                isDisabled={busy || !prospectEmail.includes("@")}
                onClick={() => void handleStartDemo()}
              />
            </div>
          </VStack>
        )}

        {/* STEP 1: Outreach Dispatch */}
        {activeStep === 1 && (
          <VStack gap={3}>
            {demoState === "not_started" ? (
              // Pre-launch state: NO fake success notes!
              <VStack gap={3}>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "var(--foreground-muted)",
                    fontSize: "13px",
                  }}
                >
                  <Clock size={16} />
                  <span>
                    <strong>Outreach Not Yet Dispatched:</strong> Review your configured message below. Click &quot;Launch Demo&quot; to send.
                  </span>
                </div>

                <div
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    background: "var(--background-secondary, rgba(0, 0, 0, 0.2))",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <Text weight="semibold" type="label">
                      To: {prospectName} &lt;{prospectEmail}&gt;
                    </Text>
                    <AstryxBadge label="Configured Draft" variant="neutral" />
                  </div>
                  <Text weight="semibold" style={{ fontSize: "13px", marginBottom: "8px" }}>
                    Subject: {customSubject}
                  </Text>
                  <pre
                    style={{
                      fontSize: "12px",
                      lineHeight: "1.5",
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                      color: "var(--foreground-muted)",
                    }}
                  >
                    {customBody}
                  </pre>
                </div>

                <HStack gap={2}>
                  <Button
                    variant="primary"
                    size="sm"
                    label={busy ? "Dispatching..." : "Launch Live Outreach Demo"}
                    isDisabled={busy}
                    onClick={() => void handleStartDemo()}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    label="Edit Message"
                    onClick={() => setActiveStep(0)}
                  />
                </HStack>
              </VStack>
            ) : (
              // Dispatched state: Shows actual dispatched message
              <VStack gap={3}>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    background: "rgba(34, 197, 94, 0.1)",
                    border: "1px solid rgba(34, 197, 94, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "var(--success, #22c55e)",
                    fontSize: "13px",
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>
                    First Outbound Message Approved by Compliance &amp; Dispatched to{" "}
                    <strong>{dispatchedRecord?.toName || prospectName} &lt;{dispatchedRecord?.toEmail || prospectEmail}&gt;</strong>!
                  </span>
                </div>

                {/* Dispatched Message Content */}
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    background: "var(--background-secondary, rgba(0, 0, 0, 0.2))",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <Text weight="semibold" type="label">
                      Subject: {dispatchedRecord?.subject || customSubject}
                    </Text>
                    <Text color="secondary" type="supporting">
                      {dispatchedRecord?.sentAt ? `Sent at ${dispatchedRecord.sentAt}` : "Dispatched"}
                    </Text>
                  </div>
                  <pre
                    style={{
                      fontSize: "12px",
                      lineHeight: "1.5",
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                      color: "var(--foreground-muted)",
                    }}
                  >
                    {dispatchedRecord?.body || customBody}
                  </pre>
                </div>

                {/* HubSpot CRM Status Verification */}
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: "8px",
                    background: "var(--background-secondary, rgba(255, 255, 255, 0.03))",
                    border: "1px solid var(--border)",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px",
                  }}
                >
                  <div>
                    <Text color="secondary" type="supporting">
                      CRM Contact Status:
                    </Text>
                    <AstryxBadge label="ctx_status: Dispatched" variant="info" />
                  </div>
                  <div>
                    <Text color="secondary" type="supporting">
                      Delivery Method:
                    </Text>
                    <AstryxBadge label={liveSend ? "Gmail SMTP (TLS)" : "Simulated Sandbox"} variant="neutral" />
                  </div>
                </div>

                {/* Inbound Prospect Reply Section (unified directly here) */}
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    background: "var(--background-secondary, rgba(255, 255, 255, 0.04))",
                    border: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <Text weight="semibold" type="label">
                    Prospect Inbound Reply &amp; Trigger Follow-up
                  </Text>
                  <Text color="secondary" type="supporting">
                    Simulate a reply from <strong>{dispatchedRecord?.toEmail || prospectEmail}</strong> requesting an introductory consultation call:
                  </Text>
                  <TextArea
                    rows={3}
                    label="Prospect Reply"
                    value={simulatedReplyText}
                    onChange={setSimulatedReplyText}
                    isDisabled={busy}
                  />
                  <HStack gap={2} wrap="wrap">
                    <Button
                      variant="primary"
                      size="sm"
                      label={busy ? "Processing Reply..." : "Simulate Inbound Reply & Trigger Follow-up"}
                      isDisabled={busy || !simulatedReplyText.trim()}
                      onClick={() => void handleSimulateReply()}
                    />
                    {liveSend && (
                      <Button
                        variant="secondary"
                        size="sm"
                        label={polling ? "Checking IMAP..." : "Check Gmail for Real Reply (IMAP)"}
                        isDisabled={polling || busy}
                        onClick={() => void handleCheckReply()}
                      />
                    )}
                  </HStack>
                </div>
              </VStack>
            )}
          </VStack>
        )}

        {/* STEP 2: CRM Booking & Follow-up */}
        {activeStep === 2 && (
          <VStack gap={3}>
            {demoState === "not_started" || demoState === "dispatched" ? (
              // Awaiting reply state: NO fake booked or confirmed states!
              <VStack gap={3}>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "var(--foreground-muted)",
                    fontSize: "13px",
                  }}
                >
                  <Clock size={16} />
                  <span>
                    <strong>Awaiting Prospect Inbound Reply:</strong> This stage activates after the prospect replies and the agent sends the Cal.com scheduling link.
                  </span>
                </div>

                <div
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    background: "var(--background-secondary, rgba(255, 255, 255, 0.03))",
                    border: "1px solid var(--border)",
                  }}
                >
                  <Text color="secondary" type="body" style={{ marginBottom: "12px" }}>
                    Status: <AstryxBadge label="Awaiting Inbound Conversation" variant="neutral" />
                  </Text>
                  <Button
                    variant="primary"
                    size="sm"
                    label={demoState === "not_started" ? "Go to Step 1: Configuration & Message" : "Go to Step 2: Outreach Dispatch"}
                    onClick={() => setActiveStep(demoState === "not_started" ? 0 : 1)}
                  />
                </div>
              </VStack>
            ) : demoState === "replied" ? (
              // Replied state: Shows inbound reply, Cal.com follow-up, status is Replied, and gives confirmation action
              <VStack gap={3}>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    background: "rgba(59, 130, 246, 0.1)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "var(--primary, #3b82f6)",
                    fontSize: "13px",
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>
                    <strong>Inbound Reply Received &amp; Processed!</strong> Intent Classified as{" "}
                    <strong>{inboundReply?.classification?.toUpperCase() ?? "BOOKING"}</strong>.
                  </span>
                </div>

                {/* Prospect Inbound Reply */}
                <div
                  style={{
                    padding: "14px",
                    borderRadius: "8px",
                    background: "var(--background-secondary, rgba(0, 0, 0, 0.2))",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <Text weight="semibold" type="label">
                      Prospect Inbound Reply ({inboundReply?.from || prospectEmail})
                    </Text>
                    <AstryxBadge label="Sentiment: Call Request" variant="info" />
                  </div>
                  <pre
                    style={{
                      fontSize: "12px",
                      lineHeight: "1.5",
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                      color: "var(--foreground-muted)",
                    }}
                  >
                    {inboundReply?.text}
                  </pre>
                </div>

                {/* Agent Follow-up Sent with Cal.com Link */}
                {agentFollowUp && (
                  <div
                    style={{
                      padding: "14px",
                      borderRadius: "8px",
                      background: "var(--background-secondary, rgba(0, 0, 0, 0.2))",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <Text weight="semibold" type="label">
                        Agent Follow-up Dispatched (Cal.com Booking Link)
                      </Text>
                      <AstryxBadge label="Subject: Re: Your private-market interests" variant="neutral" />
                    </div>
                    <pre
                      style={{
                        fontSize: "12px",
                        lineHeight: "1.5",
                        whiteSpace: "pre-wrap",
                        fontFamily: "inherit",
                        color: "var(--foreground-muted)",
                      }}
                    >
                      {agentFollowUp.body}
                    </pre>
                  </div>
                )}

                {/* HubSpot CRM State: Replied */}
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: "8px",
                    background: "var(--background-secondary, rgba(255, 255, 255, 0.03))",
                    border: "1px solid var(--border)",
                  }}
                >
                  <Text weight="medium" style={{ marginBottom: "8px" }}>
                    HubSpot CRM State Verification
                  </Text>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <Text color="secondary" type="supporting">
                        CRM Contact Status:
                      </Text>
                      <AstryxBadge label={`ctx_status: ${crmProperties?.ctx_status ?? 'not verified'}`} variant="info" />
                    </div>
                    <div>
                      <Text color="secondary" type="supporting">
                        Booking Link Dispatched:
                      </Text>
                      <AstryxBadge label={`ctx_booking_link_sent: ${crmProperties?.ctx_booking_link_sent ?? 'not verified'}`} variant={crmProperties?.ctx_booking_link_sent==='true'?'success':'neutral'} />
                    </div>
                  </div>
                </div>

                {/* Compliance Governance Notice */}
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    background: "rgba(245, 158, 11, 0.08)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    color: "var(--warning, #f59e0b)",
                    fontSize: "12px",
                    lineHeight: "1.5",
                  }}
                >
                  <strong>Compliance &amp; CRM Integrity Rule:</strong> Just because a prospect replies asking for a call does NOT mean they are booked. The contact remains in <strong>Replied</strong> status until the meeting is confirmed in Google Calendar.
                </div>

                {/* Action: Confirm Google Calendar Meeting Sync */}
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    background: "var(--background-secondary, rgba(255, 255, 255, 0.04))",
                    border: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Calendar size={18} style={{ color: "var(--primary)" }} />
                    <Text weight="semibold" type="label">
                      Cal.com booking
                    </Text>
                  </div>
                  <Text color="secondary" type="supporting">
                    The prospect chooses a slot from the link in the agent reply. Cal.com then confirms the booking by webhook; CTX updates the run and HubSpot. No booking is recorded before that confirmation.
                  </Text>
                  <div>
                    <Button
                      variant="primary"
                      size="sm"
                      label={bookingBusy ? "Checking" : "Check booking"}
                      isDisabled={bookingBusy || !currentRunId}
                      onClick={() => void handleCheckBooking()}
                    />
                  </div>
                </div>
              </VStack>
            ) : (
              // Booked state: Meeting confirmed in Google Calendar & HubSpot Booked
              <VStack gap={3}>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    background: "rgba(34, 197, 94, 0.12)",
                    border: "1px solid rgba(34, 197, 94, 0.35)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "var(--success, #22c55e)",
                    fontSize: "13px",
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>
                    <strong>Booking confirmed by Cal.com.</strong> HubSpot Contact Status is{" "}
                    <strong>Booked</strong>.
                  </span>
                </div>

                <div
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    background: "var(--background-secondary, rgba(255, 255, 255, 0.03))",
                    border: "1px solid var(--border)",
                  }}
                >
                  <Text weight="medium" style={{ marginBottom: "8px" }}>
                    Google Calendar &amp; Cal.com Details
                  </Text>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                    <div>
                      <Text color="secondary" type="supporting">
                        Calendar Event ID:
                      </Text>
                      <Text weight="semibold" style={{ fontSize: "12px" }}>
                        {calendarBooking?.eventId ?? "cal-meet-confirmed"}
                      </Text>
                    </div>
                    <div>
                      <Text color="secondary" type="supporting">
                        Meeting Start Time:
                      </Text>
                      <Text weight="semibold" style={{ fontSize: "12px" }}>
                        {calendarBooking?.startsAt ? new Date(calendarBooking.startsAt).toUTCString() : "Not available"}
                      </Text>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <Text color="secondary" type="supporting">
                        CRM Contact Status:
                      </Text>
                      <AstryxBadge label={`ctx_status: ${crmProperties?.ctx_status ?? 'not verified'}`} variant={crmProperties?.ctx_status==='Booked'?'success':'neutral'} />
                    </div>
                    <div>
                      <Text color="secondary" type="supporting">
                        Booking Link Sent:
                      </Text>
                      <AstryxBadge label={`ctx_booking_link_sent: ${crmProperties?.ctx_booking_link_sent ?? 'not verified'}`} variant={crmProperties?.ctx_booking_link_sent==='true'?'success':'neutral'} />
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    background: "rgba(34, 197, 94, 0.05)",
                    border: "1px solid rgba(34, 197, 94, 0.2)",
                    fontSize: "12px",
                    color: "var(--foreground-muted)",
                  }}
                >
                  • HubSpot activity timeline updated: <strong>Meeting Confirmed in Google Calendar (via Cal.com)</strong>.<br />
                  • Workflow run status transitioned: <strong>BOOKED</strong>.
                </div>

                <HStack gap={2}>
                  <Button
                    variant="primary"
                    size="sm"
                    label="Run New Demo"
                    onClick={handleResetDemo}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    label="View in Dashboard"
                    onClick={() => onOpenChange(false)}
                  />
                </HStack>
              </VStack>
            )}
          </VStack>
        )}

        {/* Feedback / Alert Banners */}
        {notice && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "6px",
              background: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              color: "var(--primary, #3b82f6)",
              fontSize: "12px",
            }}
          >
            {notice}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "6px",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "var(--destructive, #ef4444)",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* Live Audit Log Stream */}
        {status?.recentAuditLogs && status.recentAuditLogs.length > 0 && (
          <div style={{ marginTop: "12px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
            <Text type="label" color="secondary" style={{ marginBottom: "8px" }}>
              HubSpot Gateway Audit Trail:
            </Text>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {status.recentAuditLogs.slice(0, 4).map((log, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "var(--foreground-muted)",
                    padding: "4px 8px",
                    background: "rgba(255, 255, 255, 0.02)",
                    borderRadius: "4px",
                  }}
                >
                  <span>
                    • [{new Date(log.timestamp).toLocaleTimeString()}] {log.operation} &rarr;{" "}
                    <strong>{log.decision}</strong> ({log.status})
                  </span>
                  {log.httpStatus && <span>HTTP {log.httpStatus}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </VStack>
    </Dialog>
  );
}
