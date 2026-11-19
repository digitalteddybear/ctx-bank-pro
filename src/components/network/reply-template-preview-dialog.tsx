"use client";

import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { useMediaQuery } from "@astryxdesign/core/hooks";

/** Render beside the parent dialog so Escape dismisses only this preview. */
export function ReplyTemplatePreviewDialog({isOpen,onOpenChange,template,onChange,html,error,scope}:{
  isOpen:boolean;onOpenChange:(open:boolean)=>void;template:string;onChange:(value:string)=>void;
  html:string;error:string;scope:"campaign"|"demo";
}) {
  const narrow=useMediaQuery('(max-width: 640px)');
  return <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width="var(--reply-preview-width)" maxHeight="var(--reply-preview-max-height)">
    <DialogHeader title="Reply template preview" onOpenChange={onOpenChange}/>
    <VStack padding={4} gap={4} height="var(--reply-preview-height)" isScrollable>
      <Grid columns={narrow?1:2} gap={4} height={narrow?'auto':'100%'}>
        <VStack gap={2} style={{minWidth:0}}>
          <TextArea label="HTML template" rows={narrow?8:18} maxLength={20000} value={template} onChange={onChange}/>
          <Text type="supporting">Preview updates as you edit. Use {'{{message}}'} for the reply.</Text>
          {error&&<Text role="alert">{error}</Text>}
        </VStack>
        <iframe title={`Expanded ${scope} email preview`} sandbox="" srcDoc={html} style={{width:'100%',minWidth:0,height:narrow?'var(--reply-preview-pane-height)':'100%',minHeight:'var(--reply-preview-pane-height)',border:'var(--reply-preview-border)',borderRadius:'var(--radius)',background:'var(--reply-preview-paper)'}}/>
      </Grid>
    </VStack>
  </Dialog>;
}
