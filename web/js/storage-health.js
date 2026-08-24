export async function checkStoragePersistence(storage = localStorage) {
  const key = "random-chat.storage-check";
  try {
    storage.setItem(key, "ok");
    const localWorks = storage.getItem(key) === "ok";
    storage.removeItem(key);
    return { limited: !localWorks };
  } catch { return { limited: true }; }
}
