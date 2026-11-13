import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { z } from "zod";
import { makeRegistry,classification,mappings } from "../src/lib/server/integrations/hubspot-schema";
const directory="data/generated/hubspot";
const registry=makeRegistry(JSON.parse(readFileSync(`${directory}/live-schema.json`,"utf8")));
const csv=z.array(z.record(z.string(),z.string())).parse(JSON.parse(readFileSync(`${directory}/csv-inventory.json`,"utf8")));
const byName=new Map(csv.map(p=>[p["Internal name"],p]));
const added=registry.properties.filter(p=>!byName.has(p.name)).map(p=>p.name);
const absent=csv.filter(p=>!registry.properties.some(r=>r.name===p["Internal name"])).map(p=>p["Internal name"]);
const changed=registry.properties.flatMap(p=>{
 const c=byName.get(p.name); if(!c)return [];
 const comparisons:Record<string,[unknown,unknown]>={label:[c.Name,p.label],type:[c.Type,p.type],description:[c.Description,p.description],group:[c["Group name"],p.groupName],calculated:[c.Calculated==="true",p.calculated],readOnlyValue:[c["Read only value"]==="true",p.modificationMetadata.readOnlyValue],readOnlyDefinition:[c["Read only definition"]==="true",p.modificationMetadata.readOnlyDefinition],hubspotDefined:[c["HubSpot defined"]==="true",p.hubspotDefined]};
 const fields=Object.entries(comparisons).filter(([,v])=>v[0]!==v[1]).map(([key])=>key);
 // CSV's human-formatted option text is preserved, not guessed into IDs.
 const options=p.options.map(o=>`${o.label} (${o.value})`).join("; ");
 if(c.Options.replace(/ \[READ-ONLY\]/g,"")!==options) fields.push("options (review raw CSV vs authoritative live options)");
 return fields.length?[{name:p.name,fields}]:[];
});
writeFileSync(`${directory}/contact-registry.json`,JSON.stringify({...registry,csvInventory:csv,comparison:{added,absent,changed}},null,2),{mode:0o600});
mkdirSync("docs/integrations",{recursive:true});
const table=registry.properties.map(p=>`| ${p.name} | ${p.label.replaceAll("|","/")} | ${p.type}/${p.fieldType} | ${p.groupName} | ${classification(p)} | ${mappings[p.name] ?? "Unmapped; read only"} |`).join("\n");
writeFileSync("docs/integrations/hubspot-property-matrix.md",`# HubSpot property registry\n\nObserved ${registry.fetchedAt}. CSV: ${csv.length}. Live: ${registry.properties.length}. Added: ${added.length}. Absent: ${absent.length}. Changed definitions: ${changed.length}.\n\nLive API definitions are authoritative. Complete definitions, exact options, flags, constraints and original CSV metadata: data/generated/hubspot/contact-registry.json. No renamed property is inferred from similar labels. CSV has no fieldType column; do not infer multiselect semantics from display text.\n\nAll fields remain read-only in this phase. Reviewable means eligible for a human-reviewed proposal, not write authorization. Restricted includes financial self-reports; protected includes identity, consent, calculated and system-managed fields.\n\n| Internal name | Label | Type / field | Group | Classification | CTX mapping proposal |\n|---|---|---|---|---|---|\n${table}\n\n## Changed definitions\n${changed.map(c=>`- ${c.name}: ${c.fields.join(", ")}`).join("\n")}\n\n## Added since export\n${added.join(", ")}\n\n## Proposed permissions — pending Dylan review\nKeep HUBSPOT_WRITES_ENABLED=false. Read contact objects and Contact property definitions only. Do not grant create, delete, deals, company or settings operations.\n\nExisting operational candidates: ctx_status, ctx_last_contact, ctx_booking_link_sent. Do not expand the gateway allowlist automatically. Confirm the current exact enum values and datetime format from the live registry before activating.\n\nPotential future proposal-only fields: investment_interest, company, jobtitle, city, country, linkedin. Require source evidence, identity verification, current schema, base revision, operator approval and an explicit overwrite decision. Sensitive financial and qualification fields require separate review; self-report is never verified eligibility.\n\nNo CTX-to-HubSpot execution route was added. Existing gateway email/reply logging creates notes rather than authentic email engagements; this remains a separate release gate.\n`);
console.log({csv:csv.length,live:registry.properties.length,added:added.length,absent:absent.length,changed:changed.length});
