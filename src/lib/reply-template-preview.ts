"use client";
import { useEffect, useState } from "react";

/** Preview uses the same server renderer as SMTP; cancelled edits cannot overwrite newer previews. */
export function useReplyTemplatePreview(template: string) {
  const [preview, setPreview] = useState({html:"",error:""});
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch("/api/agents/campaign", {
        method:"POST", headers:{"content-type":"application/json"}, signal:controller.signal,
        body:JSON.stringify({action:"preview-reply-template",template}),
      }).then(async response => {
        const result: unknown = await response.json();
        if (!response.ok || !result || typeof result!=="object" || !("html" in result) || typeof result.html!=="string") {
          throw new Error("Use {{message}} in a valid reply template.");
        }
        if(!controller.signal.aborted)setPreview({html:result.html,error:""});
      }).catch(error => {
        if(!controller.signal.aborted)setPreview(previous=>({...previous,error:error instanceof Error?error.message:"Preview unavailable."}));
      });
    }, 300);
    return () => {clearTimeout(timer);controller.abort();};
  }, [template]);
  return preview;
}
