import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertProductCommunicationAllowed,COMMUNICATION_CHANNELS } from "../worker/src/policies/communicationsPolicy.js";

const fixtures=JSON.parse(await readFile(new URL("./fixtures/communications/rejected-product-events.json",import.meta.url),"utf8"));

test("SunoTo notifications stay globally disabled even for the known but disabled support template",()=>{
  assert.deepEqual(COMMUNICATION_CHANNELS.email.templateAliases,[]);
  assert.deepEqual(COMMUNICATION_CHANNELS.sms.templateAliases,[]);
  assert.equal(COMMUNICATION_CHANNELS.email.enabled,false);
  assert.equal(COMMUNICATION_CHANNELS.sms.enabled,false);
});

test("every unapproved channel/template fixture is rejected without provider access",()=>{
  for(const fixture of fixtures){
    assert.throws(()=>assertProductCommunicationAllowed(fixture),new RegExp(fixture.reason));
  }
});

test("WhatsApp remains disabled",()=>{
  assert.equal(COMMUNICATION_CHANNELS.whatsapp.enabled,false);
  assert.deepEqual(COMMUNICATION_CHANNELS.whatsapp.templateAliases,[]);
});
