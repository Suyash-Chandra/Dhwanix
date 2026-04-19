export function getDeviceId(): string {
  // Check if we are running on the server (SSR). If so, we can't access localStorage.
  if (typeof window === "undefined") {
    return "server-side-request";
  }

  const STORAGE_KEY = "dhwanix_device_id";
  let deviceId = localStorage.getItem(STORAGE_KEY);

  if (!deviceId) {
    // Generate a random UUID-like string
    deviceId = crypto.randomUUID 
      ? crypto.randomUUID() 
      : 'device-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      
    localStorage.setItem(STORAGE_KEY, deviceId);
  }

  return deviceId;
}
