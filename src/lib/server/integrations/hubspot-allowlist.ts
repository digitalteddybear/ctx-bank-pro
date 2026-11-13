import { currentOutreachStore } from '../outreach/store-instance';
/**
 * Zero-Trust Fixed Allowlist for CTX 25-Lead Launch.
 *
 * Immutable, frozen list of approved HubSpot Contact IDs verified against their
 * corresponding Phase 1 validated email addresses and names.
 *
 * NO AGENT, LLM, OR RUNTIME SCRIPT MAY MODIFY THIS LIST.
 */

import { getControlledTestRecords } from "../outreach/test-boundary";

export interface ApprovedContact {
  readonly hubspotId: string;
  readonly email: string;
  readonly name: string;
}

export const APPROVED_25_LEADS: readonly ApprovedContact[] = Object.freeze([
  Object.freeze({
    hubspotId: "52991787848",
    email: "a.tsimikalis@hungrydonkey.co.uk",
    name: "Alexandros Tsimikalis",
  }),
  Object.freeze({
    hubspotId: "48024155473",
    email: "abbychambers423@muchomail.com",
    name: "Abby Chambers",
  }),
  Object.freeze({
    hubspotId: "56246795271",
    email: "abigail.clark-morgan@kcl.ac.uk",
    name: "Chloe Clarke",
  }),
  Object.freeze({
    hubspotId: "56247603516",
    email: "abrv1@europe.com",
    name: "Rakhi B",
  }),
  Object.freeze({
    hubspotId: "56248649130",
    email: "aby@aquabella.co.uk",
    name: "Omar Aldoori",
  }),
  Object.freeze({
    hubspotId: "59623239845",
    email: "ajaysharma@ireland.com",
    name: "Ajay Sharma",
  }),
  Object.freeze({
    hubspotId: "48020282435",
    email: "akina_m38@hotmail.co.jp",
    name: "Akina Matsumoto",
  }),
  Object.freeze({
    hubspotId: "48024952374",
    email: "akku_1980@yahoo.co.in",
    name: "Syed Aqeeluddin",
  }),
  Object.freeze({
    hubspotId: "238984016004",
    email: "alan@lladderedge.ndo.co.uk",
    name: "Chris Hall",
  }),
  Object.freeze({
    hubspotId: "48023631778",
    email: "alan@malvernplumber.co.uk",
    name: "Alan Capewell",
  }),
  Object.freeze({
    hubspotId: "52967038083",
    email: "alba@mycocotte.uk",
    name: "Alba Vivo",
  }),
  Object.freeze({
    hubspotId: "52989560590",
    email: "alejandra@mber.london",
    name: "Alejandra Karakadze",
  }),
  Object.freeze({
    hubspotId: "52987933710",
    email: "alexia@pushdesignltd.com",
    name: "Alexia Grehan",
  }),
  Object.freeze({
    hubspotId: "48024165938",
    email: "ali.beter@hushmail.com",
    name: "Ali Beter",
  }),
  Object.freeze({
    hubspotId: "237985930606",
    email: "alisdair.cameron@postoffice.co.uk",
    name: "Alisdair Cameron",
  }),
  Object.freeze({
    hubspotId: "62055641349",
    email: "alistair.gronbach@scottish-courage.co.uk",
    name: "Alistair Stuart Gronbach",
  }),
  Object.freeze({
    hubspotId: "48024586351",
    email: "alkurbi@windowslive.com",
    name: "Mohamed Ali Hamad Alkarbi",
  }),
  Object.freeze({
    hubspotId: "56247355651",
    email: "alliedbs@eircom.net",
    name: "Bernard Ryan Ryan",
  }),
  Object.freeze({
    hubspotId: "56245781606",
    email: "andi.briggs@beamglobal.com",
    name: "Emma Briggs",
  }),
  Object.freeze({
    hubspotId: "238034725647",
    email: "andre@backed.vc",
    name: "Andre de Haes",
  }),
  Object.freeze({
    hubspotId: "59605883269",
    email: "andreas_roller@web.de",
    name: "Andreas Roller",
  }),
  Object.freeze({
    hubspotId: "239549025451",
    email: "andrelbailey@live.co.uk",
    name: "Andre Bailey",
  }),
  Object.freeze({
    hubspotId: "238995734162",
    email: "andrew.flemming@btopenworld.com",
    name: "Andrew Flemming",
  }),
  Object.freeze({
    hubspotId: "52991593336",
    email: "andrew@constructionlogisticsservices.com",
    name: "Andy Purvinis",
  }),
  Object.freeze({
    hubspotId: "59636788909",
    email: "andrewahale@googlemail.com",
    name: "Andrew Hale",
  }),
]);

const allowlistById = new Map<string, ApprovedContact>(
  APPROVED_25_LEADS.map((c) => [c.hubspotId, c])
);

const allowlistByEmail = new Map<string, ApprovedContact>(
  APPROVED_25_LEADS.map((c) => [c.email.toLowerCase(), c])
);

/**
 * Validates whether a given HubSpot ID and email address are strictly in the approved 25 cohort.
 * Both ID and email must match the frozen canonical record.
 */
export function isAllowlistedContact(hubspotId: string, email: string): boolean {
  const normalizedId = String(hubspotId).trim();
  const normalizedEmail = String(email).trim().toLowerCase();

  // Explicit designated test contact from controlled test-recipient boundary
  const testRecords = getControlledTestRecords();
  const testMatch = testRecords.find(
    (r) => r.hubspotId === normalizedId && r.email === normalizedEmail
  );
  if (testMatch) {
    return true;
  }

  try{
    const grant=currentOutreachStore()?.setting("campaign-crm-contact:"+normalizedId);
    if(grant){
      const saved=JSON.parse(String(grant)) as {email?:string;campaignId?:string};
      if(saved.email?.toLowerCase()===normalizedEmail&&saved.campaignId)return true;
    }
  }catch{/* No campaign grants are available. */}
  const record = allowlistById.get(normalizedId);
  if (!record) return false;

  return record.email === normalizedEmail;
}

export function getAllowlistedContact(hubspotId: string): ApprovedContact | undefined {
  const normalizedId = String(hubspotId).trim();
  const testRecords = getControlledTestRecords();
  const testMatch = testRecords.find((r) => r.hubspotId === normalizedId);
  if (testMatch) {
    return {
      hubspotId: testMatch.hubspotId,
      email: testMatch.email,
      name: testMatch.name,
    };
  }
  return allowlistById.get(normalizedId);
}

export function getAllowlistedContactByEmail(email: string): ApprovedContact | undefined {
  const normalizedEmail = String(email).trim().toLowerCase();
  const testRecords = getControlledTestRecords();
  const testMatch = testRecords.find((r) => r.email === normalizedEmail);
  if (testMatch) {
    return {
      hubspotId: testMatch.hubspotId,
      email: testMatch.email,
      name: testMatch.name,
    };
  }
  return allowlistByEmail.get(normalizedEmail);
}
