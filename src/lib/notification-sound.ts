"use client";
let audio:AudioContext|undefined;
export async function playNotificationSound(){
 try{
   if(navigator.userActivation&&!navigator.userActivation.hasBeenActive)return false;
   audio??=new AudioContext();
   if(audio.state==="suspended")await audio.resume();
   if(audio.state!=="running")return false;
   const tone=audio.createOscillator(),gain=audio.createGain();
   tone.connect(gain);gain.connect(audio.destination);
   tone.frequency.value=660;gain.gain.setValueAtTime(0.04,audio.currentTime);
   gain.gain.exponentialRampToValueAtTime(0.001,audio.currentTime+0.18);
   tone.start();tone.stop(audio.currentTime+0.2);
   tone.onended=()=>{tone.disconnect();gain.disconnect();};
   return true;
 }catch{/* Browser audio permission is optional; the feed remains available. */return false;}
}
