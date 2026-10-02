import assert from "node:assert/strict";
import { createHmac,webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createCentralNotificationHeaders } from "../worker/src/services/centralNotificationSigning.js";

const fixture=JSON.parse(await readFile(new URL("./fixtures/communications/notification-signing.json",import.meta.url),"utf8"));
const statusFixture=JSON.parse(await readFile(new URL("./fixtures/communications/notification-status-signing.json",import.meta.url),"utf8"));

test("notification request signer follows central HMAC-SHA256 canonical bytes",async()=>{
  const headers=await createCentralNotificationHeaders({...fixture,secret:fixture.testSecret,nowMs:fixture.timestampMs,cryptoApi:webcrypto});
  const bytes=`${fixture.timestampMs}\n${fixture.method}\n/api/notifications/v1/requests\n${fixture.rawBody}`;
  const expected=createHmac("sha256",fixture.testSecret).update(bytes,"utf8").digest("hex");
  assert.equal(headers["x-grasany-app-id"],fixture.appId);
  assert.equal(headers["x-grasany-timestamp"],String(fixture.timestampMs));
  assert.equal(headers["x-grasany-signature"],expected);
  assert.match(headers["x-grasany-signature"],/^[a-f0-9]{64}$/);
});

test("notification signer requires provisioned secret and the supported requests path",async()=>{
  await assert.rejects(()=>createCentralNotificationHeaders({...fixture,secret:"",cryptoApi:webcrypto}),/notification_service_credential_unavailable/);
  await assert.rejects(()=>createCentralNotificationHeaders({...fixture,path:"/api/notifications/v1/status?notification_id=x",cryptoApi:webcrypto}),/notification_request_path_not_supported/);
  await assert.rejects(()=>createCentralNotificationHeaders({...fixture,path:"//notifications.invalid/api/notifications/v1/requests",secret:fixture.testSecret,cryptoApi:webcrypto}),/notification_request_path_not_supported/);
  await assert.rejects(()=>createCentralNotificationHeaders({...fixture,path:"/\\api/notifications/v1/requests",secret:fixture.testSecret,cryptoApi:webcrypto}),/notification_request_path_not_supported/);
  await assert.rejects(()=>createCentralNotificationHeaders({...statusFixture,secret:statusFixture.testSecret,nowMs:statusFixture.timestampMs+300_001,cryptoApi:webcrypto}),/notification_timestamp_out_of_window/);
  await assert.rejects(()=>createCentralNotificationHeaders({...statusFixture,path:`${statusFixture.path}&extra=1`,secret:statusFixture.testSecret,nowMs:statusFixture.timestampMs,cryptoApi:webcrypto}),/notification_request_path_not_supported/);
});

test("status request signs the canonical query-free path and an empty body",async()=>{
  const headers=await createCentralNotificationHeaders({...statusFixture,secret:statusFixture.testSecret,nowMs:statusFixture.timestampMs,cryptoApi:webcrypto});
  const bytes=`${statusFixture.timestampMs}\nGET\n/api/notifications/v1/status\n`;
  const expected=createHmac("sha256",statusFixture.testSecret).update(bytes,"utf8").digest("hex");
  assert.equal(headers["x-grasany-app-id"],statusFixture.appId);
  assert.equal(headers["x-grasany-timestamp"],String(statusFixture.timestampMs));
  assert.equal(headers["x-grasany-signature"],expected);
});
