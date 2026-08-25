import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { verifyReleaseCheckout } from "../scripts/git-release.mjs";

describe("release checkout verification",()=>{
  const revision="a".repeat(40);

  function runner({head=revision,status="",exitCode=0}={}){
    return (_command,args)=>{
      if(exitCode)return {status:exitCode,stdout:""};
      return {status:0,stdout:args.includes("rev-parse")?`${head}\n`:status};
    };
  }

  it("accepts only the claimed clean tracked checkout",()=>{
    const calls=[];
    const gitRunner=(command,args,options)=>{
      calls.push({command,args,options});
      return runner()(command,args);
    };
    assert.equal(verifyReleaseCheckout(revision,gitRunner,"C:\\repo"),revision);
    assert.deepEqual(calls[0].args.slice(0,2),["-c","safe.directory=C:\\repo"]);
    assert.deepEqual(calls[1].args.slice(-3),["status","--porcelain","--untracked-files=no"]);
  });

  it("rejects a different HEAD and tracked changes",()=>{
    assert.throws(()=>verifyReleaseCheckout(revision,runner({head:"b".repeat(40)})),/current Git HEAD/);
    assert.throws(()=>verifyReleaseCheckout(revision,runner({status:" M package.json"})),/Tracked files must be clean/);
  });

  it("fails closed when Git cannot inspect the checkout",()=>{
    assert.throws(()=>verifyReleaseCheckout(revision,runner({exitCode:128})),/exit code 128/);
  });
});
