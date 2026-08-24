import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFriendlyHandle, getAnonymousIdentity } from "../web/js/anonymous-identity.js";
import { loadPreferences, savePreferences } from "../web/js/preferences.js";
import { ChatTabLease } from "../web/js/tabs.js";

function memoryStorage() {
  const values=new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}

describe("anonymous local identity",()=>{
  it("creates a friendly stable handle",()=>{const storage=memoryStorage();const cryptoApi={randomUUID:(()=>{let id=0;return()=>`uuid-${++id}`})()};const first=getAnonymousIdentity(storage,cryptoApi);const second=getAnonymousIdentity(storage,cryptoApi);assert.equal(first.id,second.id);assert.equal(first.handle,second.handle);assert.match(first.handle,/^[A-Za-z]+\d{3}$/);});
  it("generates predictable valid handles with injected randomness",()=>assert.equal(createFriendlyHandle(()=>0),"QuietRiver100"));
});

describe("remembered preferences",()=>{
  it("round trips only the local onboarding fields",()=>{const storage=memoryStorage();savePreferences({age:"24",gender:"Other",name:"A",languages:["English"],interests:["Music"]},storage);assert.deepEqual(loadPreferences(storage),{age:24,gender:"Other",name:"A",languages:["English"],interests:["Music"]});});
});

describe("same-browser tab lease",()=>{
  it("records and releases ownership",()=>{const storage=memoryStorage();const channel={postMessage(){},close(){}};const lease=new ChatTabLease({storage,channelFactory:()=>channel,now:()=>42});lease.claim();assert.equal(JSON.parse(storage.getItem("random-chat.active-tab.v1")).claimedAt,42);lease.release();assert.equal(storage.getItem("random-chat.active-tab.v1"),null);});
});
