export class DeviceOwnershipShard{
  constructor(state){this.state=state}
  async fetch(request){const url=new URL(request.url),current=await this.state.storage.get("owner");if(request.method==="POST"&&url.pathname==="/claim"){const body=await request.json();if(typeof body.deviceId!=="string"||body.deviceId.length<8)return Response.json({error:"invalid_device"},{status:400});const owner={deviceId:body.deviceId,leaseId:crypto.randomUUID(),claimedAt:Date.now()};await this.state.storage.put("owner",owner);return Response.json({...owner,previousDeviceId:current?.deviceId&&current.deviceId!==body.deviceId?current.deviceId:null});}if(request.method==="GET"&&url.pathname==="/status")return Response.json(current||{deviceId:null});return Response.json({error:"not_found"},{status:404});}
}
