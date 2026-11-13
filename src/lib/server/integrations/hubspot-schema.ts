import { z } from "zod";
import { createHash } from "node:crypto";

export const propertySchema = z.object({
  name: z.string().min(1), label: z.string(), type: z.string(), fieldType: z.string().default("unknown"),
  description: z.string().default(""), groupName: z.string().default(""),
  options: z.array(z.object({ label: z.string(), value: z.string(), hidden: z.boolean().default(false) })).default([]),
  calculated: z.boolean().default(false), hubspotDefined: z.boolean().default(false), archived: z.boolean().default(false),
  externalOptions: z.boolean().default(false), hasUniqueValue: z.boolean().default(false),
  dataSensitivity: z.string().optional(),
  modificationMetadata: z.object({ readOnlyValue: z.boolean().default(true), readOnlyDefinition: z.boolean().default(true) }).default({readOnlyValue:true,readOnlyDefinition:true}),
}).passthrough();
export type ContactProperty = z.infer<typeof propertySchema>;
export const registrySchema = z.object({ source: z.enum(["live", "csv"]), fetchedAt: z.string(), version: z.string(), properties: z.array(propertySchema) });
export type ContactRegistry = z.infer<typeof registrySchema>;
export const mappings: Readonly<Record<string, string>> = Object.freeze({
  firstname: "identity.firstName", lastname: "identity.lastName", email: "identity.email", phone: "identity.phone", mobilephone: "identity.mobilePhone",
  company: "employment.company", jobtitle: "employment.title", city: "location.city", country: "location.country", linkedin: "identity.linkedin",
  investment_interest: "preferences.statedInterest", how_would_you_describe_your_experience_with_investing: "experience.selfReported",
  approximately_how_much_capital_do_you_have_available_for_investment: "capital.selfReported",
  are_you_already_a_certified_highnetworth_individual_or_a_sophisticated_investor: "qualification.selfReportedOnly",
  are_you_an_investor: "investor.selfReported", aum: "assets.selfReported", aum__usd_m_: "assets.selfReportedUsdMillions", holdings: "holdings.selfReported",
  ctx_status: "workflow.status", ctx_last_contact: "workflow.lastContact", ctx_booking_link_sent: "workflow.bookingLinkSent",
});
export function classification(p: ContactProperty): "protected" | "restricted" | "reviewable" {
  if (p.archived || p.calculated || p.modificationMetadata.readOnlyValue || /consent|opt.?out|unsubscribe|legal_basis|subscription|marketa|hs_object_id|email|ip_address/i.test(p.name)) return "protected";
  if (p.dataSensitivity && p.dataSensitivity !== "non_sensitive") return "protected";
  if (/capital|aum|holdings|qualif|certified|highnet|sophisticat|income|revenue|investor|experience/i.test(p.name)) return "restricted";
  return mappings[p.name] ? "reviewable" : "restricted";
}
// Only explicitly mapped, non-sensitive context is eligible for model/vector exposure.
export function contextEligible(p: ContactProperty): boolean { return Boolean(mappings[p.name]) && classification(p) === "reviewable"; }
export function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function makeRegistry(raw: unknown, source: "live" | "csv" = "live"): ContactRegistry {
  const properties = z.object({ results: z.array(propertySchema) }).parse(raw).results.sort((a,b)=>a.name.localeCompare(b.name));
  if (new Set(properties.map(p=>p.name)).size !== properties.length) throw new Error("Duplicate property definitions");
  return {source, fetchedAt:new Date().toISOString(), version:digest(properties), properties};
}
export function validateValue(p: ContactProperty, value: string): string {
  if (value.length > 65536 || !value.trim()) throw new Error("Empty or oversized proposal");
  if (p.type === "number" && (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value)))) throw new Error("Invalid number");
  if (p.type === "bool" && !["true","false"].includes(value)) throw new Error("Invalid boolean");
  if (p.type === "enumeration") {
    if(p.externalOptions) throw new Error("External enumeration requires authoritative options");
    const values = p.fieldType === "checkbox" ? value.split(";") : [value];
    if(values.some(v=>!p.options.some(o=>o.value===v && !o.hidden))) throw new Error("Invalid internal option value");
  }
  if (["date","datetime"].includes(p.type)) {
    const ms = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
    if(!Number.isFinite(ms) || !/^\d+$|^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(value)) throw new Error("Invalid UTC date");
    const d=new Date(ms);
    if(Number.isNaN(d.getTime()) || (p.type === "date" && ms % 86400000 !== 0)) throw new Error("Date must be midnight UTC");
    if(!/^\d+$/.test(value) && d.toISOString().slice(0,10)!==value.slice(0,10)) throw new Error("Invalid calendar date");
  }
  if(!["string","number","bool","enumeration","date","datetime"].includes(p.type)) throw new Error("Unsupported property type");
  return value;
}
export class HubSpotReadClient {
  constructor(private readonly request: typeof fetch = fetch) {}
  private async get(path: string, body?: {inputs:{id:string}[];properties:string[];propertiesWithHistory:string[]}): Promise<unknown> {
    const token=process.env.HUBSPOT_ACCESS_TOKEN;
    if(!token) throw new Error("HUBSPOT_ACCESS_TOKEN unavailable");
    for(let attempt=0; attempt<3; attempt++) {
      let response: Response;
      try { response=await this.request(`https://api.hubapi.com${path}`, {method:body ? "POST" : "GET", body:body ? JSON.stringify(body):undefined, redirect:"error", headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(20000)}); }
      catch { throw new Error("HubSpot read failed: network or timeout"); }
      if ((response.status===429 || response.status>=500) && attempt<2) { await new Promise(r=>setTimeout(r,Math.min(5000,Math.max(1000,Number(response.headers.get("retry-after"))*1000 || 1000)))); continue; }
      if(!response.ok) throw new Error(`HubSpot read HTTP ${response.status}${response.status===403 ? ": verify contact/schema read scopes" : ""}`);
      return response.json();
    }
    throw new Error("HubSpot read retries exhausted");
  }
  async batchContacts(ids: string[], names: string[]) {
    if(!ids.length || ids.length>100 || ids.some(id=>!/^\d+$/.test(id))) throw new Error("Invalid contact read batch");
    // This fixed POST endpoint only reads existing records; no mutation endpoint is exposed.
    const result=z.object({status:z.string(),results:z.array(z.object({id:z.string(),archived:z.boolean(),updatedAt:z.string(),properties:z.record(z.string(),z.string().nullable())})).default([])}).parse(await this.get("/crm/v3/objects/contacts/batch/read",{inputs:ids.map(id=>({id})),properties:names,propertiesWithHistory:[]}));
    if(result.status!=="COMPLETE") throw new Error("HubSpot batch read not complete");
    if(result.results.some(r=>!ids.includes(r.id)) || new Set(result.results.map(r=>r.id)).size!==result.results.length) throw new Error("Unexpected or duplicate batch identities");
    return result.results;
  }
  async schema() { return makeRegistry(await this.get("/crm/v3/properties/contacts")); }
  async contact(id: string, names: string[]) {
    if(!/^\d+$/.test(id)) throw new Error("Invalid contact ID");
    return z.object({id:z.string(), archived:z.boolean(), updatedAt:z.string(), properties:z.record(z.string(),z.string().nullable())}).parse(await this.get(`/crm/v3/objects/contacts/${id}?${new URLSearchParams({properties:names.join(","),archived:"false"})}`));
  }
}
