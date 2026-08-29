const DB_NAME = "random-chat-local";
const VERSION = 2;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("conversations")) db.createObjectStore("conversations", { keyPath: "id" });
      if (!db.objectStoreNames.contains("favourites")) db.createObjectStore("favourites", { keyPath: "peerId" });
      if (!db.objectStoreNames.contains("radioSubmissions")) db.createObjectStore("radioSubmissions", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(storeName, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export const localHistory = {
  listConversations: async () => (await transact("conversations", "readonly", store => store.getAll())).sort((a,b) => b.endedAt.localeCompare(a.endedAt)),
  saveConversation: conversation => transact("conversations", "readwrite", store => store.put(conversation)),
  clearConversation: id => transact("conversations", "readwrite", store => store.delete(id)),
  clearAllConversations: () => transact("conversations", "readwrite", store => store.clear()),
  listFavourites: () => transact("favourites", "readonly", store => store.getAll()),
  saveFavourite: favourite => transact("favourites", "readwrite", store => store.put(favourite)),
  clearFavourites: () => transact("favourites", "readwrite", store => store.clear()),
  listRadioSubmissions: async () => (await transact("radioSubmissions", "readonly", store => store.getAll())).sort((a,b) => b.savedAt.localeCompare(a.savedAt)),
  saveRadioSubmission: submission => transact("radioSubmissions", "readwrite", store => store.put(submission)),
  clearRadioSubmission: id => transact("radioSubmissions", "readwrite", store => store.delete(id))
};
