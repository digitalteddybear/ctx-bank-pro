"use client";
import { useState } from "react";
import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
export default function Login(){
  const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const submit=async()=>{setBusy(true);setError("");try{
    const response=await fetch("/api/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});
    const result:unknown=await response.json();
    if(!response.ok)throw new Error(result&&typeof result==="object"&&"error" in result?String(result.error):"Sign-in failed.");
    window.location.assign("/");
  }catch(cause){setError(cause instanceof Error?cause.message:"Sign-in failed.");}finally{setBusy(false);}};
  return <VStack padding={4} gap={4} style={{maxWidth:"28rem",margin:"10vh auto"}}><Card padding={4}><VStack gap={4}>
    <Heading level={1}>CTX</Heading><Text>Sign in</Text>
    <TextInput label="Email" type="email" value={email} onChange={setEmail} size="sm"/>
    <TextInput label="Password" type="password" value={password} onChange={setPassword} size="sm"/>
    {error&&<Text role="alert">{error}</Text>}
    <Button label="Sign in" size="sm" variant="primary" isDisabled={busy} onClick={()=>void submit()}/>
  </VStack></Card></VStack>;
}
