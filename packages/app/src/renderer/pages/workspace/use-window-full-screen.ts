import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { useCallback, useEffect, useState } from "react";

export function useWindowFullScreen() {
  const { invoke } = useElectronIPC();
  const [isWindowFullScreen, setIsWindowFullScreen] = useState(false);

  const syncWindowFullScreen = useCallback(async () => {
    try {
      setIsWindowFullScreen(await invoke("isWindowFullScreen"));
    } catch (error) {
      console.error("Failed to read window fullscreen state", error);
    }
  }, [invoke]);

  useEffect(() => {
    void syncWindowFullScreen();

    window.addEventListener("resize", syncWindowFullScreen);
    window.addEventListener("focus", syncWindowFullScreen);
    return () => {
      window.removeEventListener("resize", syncWindowFullScreen);
      window.removeEventListener("focus", syncWindowFullScreen);
    };
  }, [syncWindowFullScreen]);

  return isWindowFullScreen;
}
