export class ChatTabLease {
  constructor({ storage = localStorage, channelFactory = name => new BroadcastChannel(name), now = Date.now } = {}) {
    this.storage = storage; this.now = now; this.tabId = crypto.randomUUID();
    this.key = "random-chat.active-tab.v1"; this.channel = channelFactory("random-chat-tabs");
    this.onMoved = () => {};
    this.channel.onmessage = event => { if (event.data?.type === "CHAT_CLAIMED" && event.data.tabId !== this.tabId) this.onMoved(); };
  }
  claim() { const lease={tabId:this.tabId,claimedAt:this.now()}; this.storage.setItem(this.key,JSON.stringify(lease)); this.channel.postMessage({type:"CHAT_CLAIMED",...lease}); return lease; }
  release() { try { const lease=JSON.parse(this.storage.getItem(this.key)); if(lease?.tabId===this.tabId)this.storage.removeItem(this.key); } catch {} }
  close() { this.release(); this.channel.close(); }
}
