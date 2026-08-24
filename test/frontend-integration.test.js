import { it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

it("wires the visible frontend to signed matchmaking instead of a preview match",async()=>{const [app,views]=await Promise.all([readFile(new URL("../web/js/app.js",import.meta.url),"utf8"),readFile(new URL("../web/js/views.js",import.meta.url),"utf8")]);assert.match(app,/issueAnonymousSession/);assert.match(app,/startMatchSearch/);assert.match(app,/RealtimeChatClient/);assert.match(app,/MESSAGE_ACCEPTED/);assert.match(app,/SESSION_ENDED/);assert.doesNotMatch(app,/demo-match|demo-peer/);assert.doesNotMatch(views,/id="demo-match"/);assert.match(views,/state\.match\?\.virtual/);});
it("wires chat safety, consent and next-match controls to protocol events",async()=>{const app=await readFile(new URL("../web/js/app.js",import.meta.url),"utf8");for(const marker of ["NEXT_REQUEST","LIKE","REPORT","BLOCK","CONTACT_UNLOCK_REQUEST","CONTACT_UNLOCK_ACCEPT","CONTACT_UNLOCK_DECLINE","MATCH_COOLDOWN"])assert.match(app,new RegExp(marker));assert.match(app,/report-reason/);assert.match(app,/state\.accountSession/);});
