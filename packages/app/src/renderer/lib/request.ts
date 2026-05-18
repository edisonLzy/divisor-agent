import axios from "axios";

const DEFAULT_SERVER_URL = "http://localhost:3000";

function getServerUrl(): string {
  const configuredUrl = import.meta.env?.VITE_SERVER_URL;
  if (typeof configuredUrl === "string" && configuredUrl.trim().length > 0) {
    return configuredUrl;
  }
  return DEFAULT_SERVER_URL;
}

export const request = axios.create({ baseURL: getServerUrl() });
