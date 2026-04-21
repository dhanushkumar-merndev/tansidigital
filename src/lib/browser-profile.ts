export type BrowserProfile = {
  clientId: string;
  name: string;
};

const DB_NAME = "crm-browser-access";
const STORE_NAME = "profiles";
const DB_VERSION = 1;
const BROWSER_ID_KEY = "browser_access_id";
const BROWSER_NAME_KEY = "name_digital";

function canUseIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function generateClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Unable to open browser profile storage."));
    };
  });
}

async function readValue(key: string): Promise<string> {
  const database = await openDatabase();
  if (!database) {
    return "";
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(typeof request.result === "string" ? request.result : "");
    };

    request.onerror = () => {
      reject(request.error ?? new Error(`Unable to read "${key}" from browser storage.`));
    };

    transaction.oncomplete = () => {
      database.close();
    };

    transaction.onerror = () => {
      database.close();
    };
  });
}

async function writeValues(entries: Array<[string, string]>) {
  const database = await openDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    entries.forEach(([key, value]) => {
      store.put(value, key);
    });

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };

    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Unable to save browser profile."));
    };
  });
}

export async function getBrowserProfile(): Promise<BrowserProfile> {
  const [savedClientId, savedName] = await Promise.all([
    readValue(BROWSER_ID_KEY),
    readValue(BROWSER_NAME_KEY),
  ]);

  const clientId = savedClientId || generateClientId();

  if (!savedClientId) {
    await writeValues([[BROWSER_ID_KEY, clientId]]);
  }

  return {
    clientId,
    name: savedName.trim(),
  };
}

export async function saveBrowserProfile(profile: BrowserProfile) {
  await writeValues([
    [BROWSER_ID_KEY, profile.clientId.trim()],
    [BROWSER_NAME_KEY, profile.name.trim()],
  ]);
}
