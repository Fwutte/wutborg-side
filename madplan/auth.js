(() => {
  "use strict";

  const API = "/api/auth";
  const DB_NAME = "madplan-device-auth";
  const STORE_NAME = "device";
  const STORE_KEY = "current";
  const encoder = new TextEncoder();

  let currentStatus = null;

  class AuthError extends Error {
    constructor(message, status = 0, code = "") {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  const request = async (path, options = {}) => {
    const headers = { accept: "application/json", ...(options.headers || {}) };
    const settings = {
      ...options,
      credentials: "same-origin",
      headers,
    };

    if (options.body !== undefined && typeof options.body !== "string") {
      settings.headers["content-type"] = "application/json";
      settings.body = JSON.stringify(options.body);
    }

    const response = await fetch(API + path, settings);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new AuthError(
        payload.error || "Godkendelsen mislykkedes",
        response.status,
        payload.code || ""
      );
    }
    return payload;
  };

  const openDatabase = () =>
    new Promise((resolve, reject) => {
      const operation = indexedDB.open(DB_NAME, 1);
      operation.onupgradeneeded = () => {
        if (!operation.result.objectStoreNames.contains(STORE_NAME)) {
          operation.result.createObjectStore(STORE_NAME);
        }
      };
      operation.onsuccess = () => resolve(operation.result);
      operation.onerror = () => reject(operation.error);
    });

  const databaseOperation = async (mode, operation) => {
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const requestOperation = operation(store);
        requestOperation.onsuccess = () => resolve(requestOperation.result);
        requestOperation.onerror = () => reject(requestOperation.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  };

  const getLocalDevice = () =>
    databaseOperation("readonly", (store) => store.get(STORE_KEY));

  const saveLocalDevice = (device) =>
    databaseOperation("readwrite", (store) => store.put(device, STORE_KEY));

  const forgetLocalDevice = () =>
    databaseOperation("readwrite", (store) => store.delete(STORE_KEY));

  const bytesToBase64Url = (buffer) => {
    let binary = "";
    for (const byte of new Uint8Array(buffer)) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary)
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
  };

  const loginMessage = (deviceId, challengeId, challenge) =>
    `MADPLAN-AUTH-V1\n${deviceId}\n${challengeId}\n${challenge}`;

  const loginWithDevice = async (device) => {
    const challenge = await request("/challenge", {
      method: "POST",
      body: { device_id: device.id },
    });
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      device.privateKey,
      encoder.encode(
        loginMessage(
          device.id,
          challenge.challenge_id,
          challenge.challenge
        )
      )
    );

    return request("/verify", {
      method: "POST",
      body: {
        device_id: device.id,
        challenge_id: challenge.challenge_id,
        signature: bytesToBase64Url(signature),
      },
    });
  };

  const loadStatus = async () => {
    currentStatus = await request("/status");
    return currentStatus;
  };

  const showApp = () => {
    document.getElementById("authGate").hidden = true;
    document.body.classList.remove("auth-pending");
  };

  const showGate = (status, message = "") => {
    const gate = document.getElementById("authGate");
    const text = document.getElementById("authMessage");
    const ip = document.getElementById("authIp");

    if (message) {
      text.textContent = message;
    } else if (!status.configured) {
      text.textContent =
        "Adgangen er ikke færdigkonfigureret. Tilføj hjemmets offentlige IP i MADPLAN_TRUSTED_IPS.";
    } else {
      text.textContent =
        "Denne enhed er ikke godkendt. Forbind den til hjemmets Wi-Fi, genindlæs siden, og registrer den via nøgleknappen.";
    }

    ip.textContent = status.current_ip
      ? `Cloudflare ser denne IP: ${status.current_ip}`
      : "";
    gate.hidden = false;
    document.body.classList.remove("auth-pending");
  };

  const ensureAccess = async () => {
    if (!window.isSecureContext || !window.crypto?.subtle || !window.indexedDB) {
      showGate(
        { configured: true, current_ip: "" },
        "Denne browser understøtter ikke det sikre nøglelager. Åbn siden via HTTPS i en opdateret Safari."
      );
      return false;
    }

    try {
      let status = await loadStatus();
      if (!status.authenticated) {
        const device = await getLocalDevice();
        if (device?.id && device.privateKey) {
          try {
            await loginWithDevice(device);
            status = await loadStatus();
          } catch (error) {
            if (error.status === 404) await forgetLocalDevice();
          }
        }
      }

      if (status.authenticated) {
        showApp();
        return true;
      }

      showGate(status);
      return false;
    } catch (error) {
      showGate(
        { configured: true, current_ip: "" },
        error.message || "Godkendelsesserveren kunne ikke kontaktes."
      );
      return false;
    }
  };

  const registerDevice = async (name) => {
    if (!currentStatus?.can_register) {
      throw new AuthError(
        "Enheden kan kun registreres fra hjemmets godkendte IP",
        403
      );
    }

    const oldDevice = await getLocalDevice();
    if (oldDevice?.id) {
      await request(`/devices/${encodeURIComponent(oldDevice.id)}`, {
        method: "DELETE",
      }).catch((error) => {
        if (error.status !== 404) throw error;
      });
      await forgetLocalDevice();
    }

    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"]
    );
    const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const device = {
      id: crypto.randomUUID(),
      name,
      privateKey: keyPair.privateKey,
    };

    await saveLocalDevice(device);
    try {
      await request("/register", {
        method: "POST",
        body: {
          device_id: device.id,
          name,
          public_key: publicKey,
        },
      });
    } catch (error) {
      await forgetLocalDevice();
      throw error;
    }

    await loadStatus();
    return device;
  };

  const listDevices = () => request("/devices");

  const revokeDevice = async (id) => {
    await request(`/devices/${encodeURIComponent(id)}`, { method: "DELETE" });
    const localDevice = await getLocalDevice();
    if (localDevice?.id === id) await forgetLocalDevice();
    await loadStatus();
  };

  document.getElementById("authRetry").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    const allowed = await ensureAccess();
    event.currentTarget.disabled = false;
    if (allowed) location.reload();
  });

  window.madplanAuth = {
    ensureAccess,
    getLocalDevice,
    getStatus: () => currentStatus,
    refreshStatus: loadStatus,
    registerDevice,
    listDevices,
    revokeDevice,
  };
})();
