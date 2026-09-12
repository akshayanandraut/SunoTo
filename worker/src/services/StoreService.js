export class StoreService {
  constructor({ url, serviceKey, fetcher = fetch }) {
    this.url = url;
    this.serviceKey = serviceKey;
    this.fetcher = (...args) => fetcher(...args);
  }
  headers() {
    return { apikey: this.serviceKey, authorization: `Bearer ${this.serviceKey}`, "content-type": "application/json" };
  }
  async catalog() {
    const response = await this.fetcher(`${this.url}/rest/v1/store_items?select=id,sku,name,description,icon,price_credits&active=is.true&order=id.asc`, { headers: this.headers() });
    if (!response.ok) throw new Error("store_catalog_lookup_failed");
    return response.json();
  }
  async inventory(userId) {
    const response = await this.fetcher(`${this.url}/rest/v1/store_purchases?select=item_id,purchased_at&user_id=eq.${encodeURIComponent(userId)}&order=purchased_at.asc`, { headers: this.headers() });
    if (!response.ok) throw new Error("store_inventory_lookup_failed");
    return response.json();
  }
  async purchase(userId, itemId, idempotencyKey) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/purchase_store_item`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_item_id: itemId, target_idempotency_key: idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "store_purchase_failed");
    return Array.isArray(data) ? data[0] : data;
  }
  async equip(userId, itemId) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/equip_store_item`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ target_user_id: userId, target_item_id: itemId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "store_equip_failed");
    return Array.isArray(data) ? data[0] : data;
  }
}
