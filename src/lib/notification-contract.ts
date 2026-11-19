import {z} from "zod";
export const notificationPreferencesSchema=z.object({
 mentions:z.boolean(),comments:z.boolean(),weeklyDigest:z.boolean(),desktop:z.boolean(),sound:z.boolean(),
 quietHours:z.enum(["off","22-08","custom"]),quietStart:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("22:00"),
 quietEnd:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("08:00"),
 timeZone:z.string().max(100).refine(value=>{try{new Intl.DateTimeFormat("en",{timeZone:value});return true;}catch{return false;}}).default("Europe/London")
}).strict();
export type NotificationPreferences=z.infer<typeof notificationPreferencesSchema>;
export const DEFAULT_NOTIFICATION_PREFERENCES:NotificationPreferences={mentions:false,comments:false,weeklyDigest:false,desktop:false,sound:false,quietHours:"off",quietStart:"22:00",quietEnd:"08:00",timeZone:"Europe/London"};
export function notificationsQuiet(p:NotificationPreferences,now=new Date()){
 if(p.quietHours==="off")return false;
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:p.timeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
 const minutes=Number(parts.find(v=>v.type==="hour")?.value)*60+Number(parts.find(v=>v.type==="minute")?.value);
 const toMinutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3));
 const start=toMinutes(p.quietHours==="22-08"?"22:00":p.quietStart),end=toMinutes(p.quietHours==="22-08"?"08:00":p.quietEnd);
 return start===end||start>end?(minutes>=start||minutes<end):(minutes>=start&&minutes<end);
}
export const notificationItemSchema=z.object({id:z.string(),kind:z.enum(["reply","review"]),title:z.string(),at:z.number(),read:z.boolean()});
export const notificationSnapshotSchema=z.object({
 preferences:notificationPreferencesSchema,revision:z.number().int().nonnegative(),updatedAt:z.number(),
 items:z.array(notificationItemSchema),emailReady:z.boolean(),emailRecipient:z.string(),deliveryIssues:z.number()
});
export const reviewSourceSchema=z.object({id:z.string(),title:z.string(),url:z.string().url(),text:z.string(),hash:z.string(),fixture:z.boolean(),changed:z.boolean(),approvedBy:z.string().optional()});
