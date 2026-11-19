"use client";
import {useRef} from "react";
import {useBackendRefresh} from "@/lib/backend-sync";
import {notificationSnapshotSchema,notificationsQuiet} from "@/lib/notification-contract";
import {playNotificationSound} from "@/lib/notification-sound";

/** Shares CTX's poll. Browser notices supplement, rather than acknowledge, the durable feed. */
export function OperatorNotificationListener(){
 const busy=useRef(false);
 useBackendRefresh(async()=>{
   if(busy.current)return;busy.current=true;
   try{
     const response=await fetch("/api/notifications",{cache:"no-store"});if(!response.ok)return;
     const snapshot=notificationSnapshotSchema.parse(await response.json()),p=snapshot.preferences;
     if(!snapshot.revision||(!p.desktop&&!p.sound)||notificationsQuiet(p))return;
     const deliver=async()=>{
       let seen:string[]=[];
       try{const raw:unknown=JSON.parse(localStorage.getItem("ctx-notification-seen")??"[]");if(Array.isArray(raw))seen=raw.filter((value):value is string=>typeof value==="string");}catch{/* New browser. */}
       const pending=snapshot.items.filter(item=>!item.read&&item.at>=snapshot.updatedAt&&!seen.includes(item.id));
       if(!pending.length)return;
       let delivered=false;
       if(p.desktop&&"Notification"in window&&Notification.permission==="granted"){
         try{
           const title=pending.length===1?pending[0].title:pending.length+" new CTX notifications";
           const notification=new Notification(title,{body:"Open CTX Notifications to review.",tag:"ctx-activity"});
           notification.onclick=()=>{window.focus();window.location.assign("/?view=ai-settings&section=Notifications");notification.close();};
           delivered=true;
         }catch{/* Desktop notifications are not supported in every browser. */}
       }
       if(p.sound&&document.visibilityState==="visible"){delivered=(await playNotificationSound())||delivered;}
       if(delivered){try{localStorage.setItem("ctx-notification-seen",JSON.stringify([...seen,...pending.map(item=>item.id)].slice(-1000)));}catch{/* Feed remains durable even if browser storage is unavailable. */}}
     };
     if(navigator.locks)await navigator.locks.request("ctx-operator-notifications",deliver);
     else if(document.visibilityState==="visible")await deliver();
   }catch{/* Settings and the durable feed expose errors; avoid disrupting dashboard polling. */}
   finally{busy.current=false;}
 });
 return null;
}
