import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RADIO_LICENSES,validRadioLicenseId } from "../worker/src/policies/radioLicensePolicy.js";

describe("radio license policy", () => {
  it("only offers commercially-safe licenses", () => {
    const ids = RADIO_LICENSES.map(license => license.id);
    assert.deepEqual(ids, ["cc0", "cc-by", "pixabay", "ccmixter", "fma-cc-by", "fma-cc0"]);
  });
  it("never offers a non-commercial or unlabeled option", () => {
    for (const license of RADIO_LICENSES) {
      assert.ok(!license.id.includes("nc"), `${license.id} looks like a non-commercial license and must not be offered`);
    }
  });
  it("validRadioLicenseId rejects anything outside the fixed list, including CC-BY-NC", () => {
    assert.equal(validRadioLicenseId("cc-by"), true);
    assert.equal(validRadioLicenseId("cc-by-nc"), false);
    assert.equal(validRadioLicenseId(""), false);
    assert.equal(validRadioLicenseId(undefined), false);
  });
});

describe("radio track licensing migration", () => {
  it("adds license/attribution_text columns with a fixed-list check constraint", async () => {
    const sql = await readFile(new URL("../supabase/migrations/202609140001_radio_track_licensing.sql", import.meta.url), "utf8");
    assert.match(sql, /add column if not exists license text/i);
    assert.match(sql, /add column if not exists attribution_text text/i);
    assert.match(sql, /license in \('cc0','cc-by','pixabay','ccmixter','fma-cc-by','fma-cc0'\)/);
    assert.doesNotMatch(sql, /'cc-by-nc'/i);
  });
  it("requires both license and attribution on the admin-curated insert path, not on the public path", async () => {
    const sql = await readFile(new URL("../supabase/migrations/202609140001_radio_track_licensing.sql", import.meta.url), "utf8");
    assert.match(sql, /invalid_track_license/);
    assert.match(sql, /invalid_track_attribution/);
    assert.match(sql, /admin_submit_radio_track\(target_room_public_id uuid,target_title text,target_artist_name text,target_storage_key text,target_artwork_key text,target_duration_seconds integer,target_license text,target_attribution_text text\)/);
  });
  it("threads license/attribution through to what listeners actually see (next_radio_track, list_radio_queue)", async () => {
    const sql = await readFile(new URL("../supabase/migrations/202609140001_radio_track_licensing.sql", import.meta.url), "utf8");
    assert.match(sql, /returns table\(id uuid,title text,artist_name text,storage_key text,artwork_key text,duration_seconds integer,curated_only boolean,listener_message text,license text,attribution_text text\)/);
    assert.match(sql, /returns table\(id uuid,title text,artist_name text,artwork_key text,duration_seconds integer,status text,listener_message text,license text,attribution_text text\)/);
  });
});
