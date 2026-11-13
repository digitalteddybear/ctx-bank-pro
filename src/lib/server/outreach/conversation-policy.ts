/** Deterministic conversation signals supplement, never replace, live inference. */
export function conversationSignals(text: string) {
  const declinedCall = /(?:no|not|don't|do not|rather not)\s+(?:want (?:to |a )?|a |to )?(?:call|meeting|speak|book)|no calls|email only/i.test(text);
  const timingDeferral = /(?:call|reach|ping|contact|check in with|get back to)\s+(?:me\s+)?(?:back\s+)?in\s+\d+\s+(?:months?|weeks?|years?)|not (?:capital\s+)?liquid|timing isn[’']?t right|later in the year|next year|ping me later|check back|revisit in|reach back out/i.test(text);
  const delegatedBooking = !declinedCall && /(?:can|could|would)\s+you\s+(?:be able to\s+)?(?:book|schedule|arrange)\s+(?:the\s+call|it|this)?\s*(?:for me)?/i.test(text);
  const timePreference = /(?:anytime in the\s+)?(?:afternoon|morning)|tomorrow|at \d{1,2}(?::\d{2})?\s*(?:am|pm)?/i.test(text);
  const nextStep = !declinedCall && !timingDeferral && (delegatedBooking || /how (?:do|can|should) (?:we|i) (?:get started|start|proceed|begin|speak)|next steps?|initiate a conversation|let[’']?s (?:speak|talk|meet|chat)|schedule|booking (?:link|calendar|url)|calendar (?:link|invite)|meeting (?:link|url)|scheduling calendar|book (?:a |the )?(?:\d+\s*(?:min|minutes)\b|(?:call|meeting|conversation|slot|time))|have a (?:call|chat)|ready to book|open to a meeting|arrange a time to speak|set up (?:a |the )?(?:\d+\s*min\s+)?(?:call|meeting|conversation)|share your calendar|grab a slot|where (?:do we|can we|should we|to) (?:begin|start)|(?:speak|meet|call|meeting)\s+(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday)|(?:monday|tuesday|wednesday|thursday|friday)\s+(?:morning|afternoon)|(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|morning|afternoon).*\b(?:works|suits|perfect)/i.test(text));
  const specificOpportunities = /specific opportunities|what opportunities|what deals|current opportunities|what funds/i.test(text);
  const positiveSentiment = /looks? good|sounds? good|sounds? interesting|great|interested/i.test(text);
  const interests = ["managed funds", "private equity", "precious metals"].filter(sector => text.toLowerCase().includes(sector));
  return {
    nextStep,
    declinedCall,
    timingDeferral,
    delegatedBooking,
    timePreference,
    specificOpportunities,
    positiveSentiment,
    interests,
    frustrated: /repeat(?:ed|ing)? yourself|not clear|still don[’']?t know|already (?:said|asked)|not answering/i.test(text),
    selfReportedQualification: /sophisticated investor/i.test(text),
  };
}

export function hasRoleDisclosure(text: string) {
  return /\b(?:introducer|liaison)s?\b/i.test(text) && /(?:not|never|rather than)\s+(?:(?:an?|financial|investment)\s+)*(?:advisers?|advisors?|advice)|do not (?:provide|give|offer) (?:financial |investment )?advice/i.test(text);
}

export function normaliseReply(text: string) {
  return text.toLowerCase().replace(/https?:\/\/\S+/g, "[link]").replace(/\s+/g, " ").trim();
}

export function contextualFixtureReply(context: Record<string, unknown>) {
  const actions=context.actionResults as {callback?:{status:string;requestedText:string}}|undefined;
  if(context.intent==="followup"&&actions?.callback?.status==="draft_ready")return {subject:"Following up as requested",body:"Hello,\n\nYou asked us to get back in touch around now. Would you like to continue our conversation, or would another time suit you better?\n\nDylan\nASP Private Capital\nReply stop if you would prefer no further contact."};
  const text = String(context.latestReply ?? "");
  const signals = conversationSignals(text);
  const history = Array.isArray(context.transcript) ? context.transcript as {direction?: string; text?: string}[] : [];
  const prior = history.filter(turn => turn.direction === "outbound").map(turn => turn.text ?? "").join("\n");
  const priorInbound = history.filter(turn => turn.direction === "inbound").map(turn => turn.text ?? "").join("\n");
  const interest = signals.interests[0] ?? conversationSignals(priorInbound).interests[0];
  const prospect = context.prospect as { name?: string } | undefined;
  const crm = context.crmContext as {firstname?:string} | undefined;
  const firstName = prospect?.name && (!crm?.firstname || crm.firstname === prospect.name.split(" ")[0]) ? prospect.name.split(" ")[0] : "";
  const greeting = firstName ? `Hello ${firstName},` : "Hello,";

  const paragraphs: string[] = [greeting];

  if (/who .*asp|what .*asp|more info|what do you do/i.test(text) && !signals.specificOpportunities) paragraphs.push("ASP Private Capital is an introducer and liaison. We connect investors with providers and coordinate questions and documentation.");

  if(context.classification==="unclear") {
    const assessment=context.assessment as {clarification?:string}|undefined;
    paragraphs.push(assessment?.clarification??"Could you clarify what you would like us to help with next?");
  } else if (signals.frustrated) {
    paragraphs.push("You’re right — I didn’t make the next step clear.");
    if (signals.nextStep) paragraphs.push(`You can arrange the introductory call here: ${String(context.bookingUrl ?? "")}`);
  } else if (signals.timingDeferral) {
    const actions=context.actionResults as {callback?:{dueAt:string|null;status:string}}|undefined;
    const due=actions?.callback?.dueAt;
    paragraphs.push(due?`Of course. I’ve saved a reminder for ${new Date(due).toLocaleDateString('en-GB',{timeZone:'Europe/London',dateStyle:'long'})} so we can follow up then.`:"Of course. When would you prefer us to get back in touch?");
  } else if (signals.delegatedBooking) {
    paragraphs.push(typeof context.schedulingReply === "string" ? context.schedulingReply : "Of course. Which day and time window would suit you, and in which time zone?");
  } else if (signals.specificOpportunities) {
    paragraphs.push("To clarify regarding specific opportunities: we discuss individual opportunities during an introductory conversation, after understanding what you are looking for.");
    if (signals.nextStep || context.classification === "booking") {
      paragraphs.push(`The next step is an introductory conversation${interest ? ` about your interest in ${interest}` : ""}. You can choose a convenient time directly on our calendar here: ${String(context.bookingUrl ?? "")}`);
    }
  } else if (signals.nextStep || (context.classification === "booking" && !signals.declinedCall)) {
    if (interest) paragraphs.push(`Thank you for clarifying your interest in ${interest}.`);
    paragraphs.push(`The next step is an introductory conversation${interest ? ` about your interest in ${interest}` : ""}. You can choose a convenient time here: ${String(context.bookingUrl ?? "")}`);
  } else if (/fees?|costs?|charges?/i.test(text)) {
    paragraphs.push("I don’t have verified fee information to quote here. I can ask the relevant team to clarify the charges and who pays them.");
  } else if (signals.declinedCall) {
    paragraphs.push("We can continue by email. What would you like to clarify first?");
  } else if (interest) {
    paragraphs.push(`Thank you for following up regarding ${interest}. What would you like to understand about our general macroeconomic outlook in this area?`);
  } else if (signals.positiveSentiment) {
    paragraphs.push("Thank you for following up. We would be glad to explore this further with you.");
    paragraphs.push(`If you would like to initiate an introductory conversation to share our macroeconomic perspective, you are welcome to pick a time here: ${String(context.bookingUrl ?? "")}`);
  } else {
    paragraphs.push("Thank you for following up. To make sure I address your specific focus, could you clarify whether you are primarily focused on managed funds, private equity, or precious metals?");
  }

  if (!/\b(?:introducer|liaison)s?\b/i.test(prior + "\n" + paragraphs.join("\n"))) {
    paragraphs.push("As an introducer, ASP helps coordinate these conversations; we do not provide investment advice.");
  }

  return {
    subject: "Re: Your private-market interests",
    body: paragraphs.join("\n\n") + "\n\nBest regards,\nDylan\nASP Private Capital\n\nReply stop if you would prefer no further contact."
  };
}

/** Ignore greetings/signatures; detect repeated answer paragraphs even if URLs change. */
export function repeatsAnswer(body:string,prior:string[]) {
 const blocks=(text:string)=>text.split(/\n\s*\n/).map(normaliseReply).filter(x=>x.length>65&&!/^(best regards|kind regards|reply stop)/.test(x));
 const old=new Set(prior.flatMap(blocks));return blocks(body).some(block=>old.has(block));
}
