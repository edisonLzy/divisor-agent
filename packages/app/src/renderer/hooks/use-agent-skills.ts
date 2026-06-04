import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import type { DiscoveredSkill } from "@shared/skills-ipc";
import { useEffect, useState } from "react";

export function useAgentSkills() {
  const { invoke } = useElectronIPC();
  const [skills, setSkills] = useState<DiscoveredSkill[]>([]);

  useEffect(() => {
    let isCancelled = false;

    void invoke("listSkills")
      .then((nextSkills) => {
        if (!isCancelled) {
          setSkills(nextSkills);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load skills", error);
      });

    return () => {
      isCancelled = true;
    };
  }, [invoke]);

  return skills;
}
