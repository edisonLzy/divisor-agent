import { copyTextToClipboard } from "@renderer/lib/clipboard";
import axios from "axios";
import { toast } from "sonner";

const DEFAULT_SERVER_URL = "http://localhost:3000";

function getServerUrl(): string {
  const configuredUrl = import.meta.env?.VITE_SERVER_URL;
  if (typeof configuredUrl === "string" && configuredUrl.trim().length > 0) {
    return configuredUrl;
  }
  return DEFAULT_SERVER_URL;
}

/**
 * API 统一响应格式
 */
interface ApiResponse<T> {
  code: number;
  data: T;
  message?: string;
  timestamp: string;
}

export const request = axios.create({ baseURL: getServerUrl() });

function copyMessage(message: string) {
  return () => {
    void copyTextToClipboard(message).catch((error) => {
      toast.error(error instanceof Error ? error.message : "复制失败");
    });
  };
}

// ── Response Interceptor ─────────────────────────────────────────────────────

request.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse<unknown>;

    if (body.code === 0) {
      // 成功: 将 data 提取出来, 调用者直接拿到业务数据
      response.data = body.data;
      return response;
    }

    // 业务错误
    const message = body.message ?? `请求失败 (code: ${body.code})`;
    toast.error(message, {
      action: {
        label: "复制",
        onClick: copyMessage(message),
      },
    });
    return Promise.reject(new Error(message));
  },
  (error) => {
    // 网络错误 / HTTP 错误
    const message = error.response?.data?.message ?? error.message ?? "网络请求失败，请检查连接";

    toast.error(message, {
      action: {
        label: "复制",
        onClick: copyMessage(message),
      },
    });
    return Promise.reject(error);
  },
);
