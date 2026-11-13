import type { KnowledgeNode } from "@/lib/graph/types";

export type OpeningMessageFields = Record<"name" | "first_name" | "last_name" | "email" | "sender" | "sender_email" | "firm" | "role" | "macro_interest" | "tailored_hook" | "standard_company_and_privacy_footer" | "booking_link", string>;

function capture(text: string, labels: string): string {
  const pattern=new RegExp(`(?:^|\\n)(?:${labels}):\\s*([^\\n]+)`,"i");
  return text.match(pattern)?.[1]?.trim()??"";
}

export function openingMessageFieldsFromText(name:string,evidence:string,options:{senderName?:string;senderEmail?:string;standardFooter?:string;contactProperties?:Record<string,string|null|undefined>}={}):OpeningMessageFields {
  const crm=options.contactProperties??{};
  const property=(...keys:string[])=>keys.map(key=>crm[key]?.trim()).find(Boolean)??"";
  const primaryCompany=evidence.match(/"primary_company"\s*:\s*"([^"]+)"/i)?.[1]?.trim()??"";
  const resolvedName=capture(evidence,"Resolved Name|Raw Full Name");
  const displayName=resolvedName||name;
  const firstName=property("firstname","first_name")||capture(evidence,"First name|Firstname|Raw First Name")||displayName.trim().split(/\s+/)[0]||"";
  const lastName=property("lastname","last_name")||capture(evidence,"Last name|Lastname|Raw Last Name")||displayName.trim().split(/\s+/).slice(1).join(" ");
  return {
    name:resolvedName||name,
    first_name:firstName,
    last_name:lastName,
    email:property("email")||capture(evidence,"Raw Email|Contact Email"),
    sender:options.senderName?.trim()||process.env.CTX_SENDER_NAME?.trim()||"Dylan",
    sender_email:options.senderEmail?.trim()||process.env.GMAIL_USER?.trim()||"",
    firm:property("company")||primaryCompany||capture(evidence,"Firm|Company|Organisation|Organization|Primary Company"),
    role:property("jobtitle","job_title")||capture(evidence,"Role|Job title|Position"),
    macro_interest:property("investment_interest")||capture(evidence,"Macro(?:economic)? interest|Sector interest|Stated interest"),
    tailored_hook:capture(evidence,"Tailored hook"),
    standard_company_and_privacy_footer:options.standardFooter?.trim()||"",
    booking_link:"",
  };
}

export function openingMessageFields(node: KnowledgeNode): OpeningMessageFields {
  return openingMessageFieldsFromText(node.label,node.sources.map(source=>source.excerpt??"").join("\n"),{contactProperties:node.crmContext?.properties});
}

export function interpolateOpeningMessage(template:string, fields:OpeningMessageFields):{text:string;missing:string[]} {
  const missing=new Set<string>();
  const text=template.replace(/\{\{\s*([a-z_ -]+)\s*\}\}/gi,(token,rawKey:string)=>{
    const key=rawKey.trim().toLowerCase().replace(/[ -]+/g,"_");
    const aliases:Record<string,keyof OpeningMessageFields>={firstname:"first_name",lastname:"last_name",contact_email:"email",sender_name:"sender",company:"firm",company_name:"firm",jobtitle:"role",job_title:"role",privacy_footer:"standard_company_and_privacy_footer",standard_footer:"standard_company_and_privacy_footer"};
    const fieldKey=aliases[key]??key as keyof OpeningMessageFields;
    if(!(fieldKey in fields)){missing.add(token);return token;}
    const value=fields[fieldKey];
    // Legacy templates may still contain this token. Resolve it to empty so
    // initial messages never expose booking links.
    if(key==="booking_link")return "";
    if(!value.trim()){missing.add(token);return token;}
    return value;
  });
  return {text,missing:[...missing]};
}
