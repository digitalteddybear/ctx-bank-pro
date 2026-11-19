"use client";
import { useEffect, useState } from "react";

/** Preview uses the same server renderer as SMTP; cancelled edits cannot overwrite newer previews. */
export function useReplyTemplatePreview(template: string, enabled = true, message?: string) {
  const [preview, setPreview] = useState<{template:string;message?:string;html:string;error:string}|null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch("/api/agents/campaign", {
        method:"POST", headers:{"content-type":"application/json"}, signal:controller.signal,
        body:JSON.stringify({action:"preview-reply-template",template,message}),
      }).then(async response => {
        const result: unknown = await response.json();
        if (!response.ok || !result || typeof result!=="object" || !("html" in result) || typeof result.html!=="string") {
          throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Preview unavailable. Try again.");
        }
        if(!controller.signal.aborted)setPreview({template,message,html:result.html,error:"warning" in result && typeof result.warning === "string" ? result.warning : ""});
      }).catch(error => {
        if(!controller.signal.aborted)setPreview({template,message,html:"",error:error instanceof Error?error.message:"Preview unavailable."});
      });
    }, 300);
    return () => {clearTimeout(timer);controller.abort();};
  }, [template, enabled, message]);
  return enabled && preview?.template===template && preview.message===message ? preview : {html:"",error:""};
}
