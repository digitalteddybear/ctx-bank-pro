import { outreachStore } from "../outreach/store-instance";
import { HubSpotContextStore } from "./hubspot-context";
let context: HubSpotContextStore | undefined;
export function hubspotContext() { return context ??= new HubSpotContextStore(outreachStore()); }
