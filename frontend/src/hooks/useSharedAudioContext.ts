import { useState, useCallback } from "react";

let sharedAudioContext: AudioContext | null = null;

export function useSharedAudioContext() {
  const [isReady, setIsReady] = useState(false);

  const unlockAudioContext = useCallback(async () => {
    try {
      if (!sharedAudioContext || sharedAudioContext.state === "closed") {
        sharedAudioContext = new (
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext
        )();
        console.log(
          "🔊 Created shared AudioContext, state:",
          sharedAudioContext.state,
        );
      }

      if (sharedAudioContext.state === "suspended") {
        console.log("⏸️ Shared audio context suspended, resuming...");
        await sharedAudioContext.resume();
        console.log(
          "✅ Shared audio context resumed, new state:",
          sharedAudioContext.state,
        );
      }

      const buffer = sharedAudioContext.createBuffer(1, 1, 22050);
      const source = sharedAudioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(sharedAudioContext.destination);
      source.start(0);

      setIsReady(true);
      console.log("✅ Shared AudioContext unlocked and ready for playback");
    } catch (error) {
      console.error("❌ Failed to unlock shared AudioContext:", error);
      throw error;
    }
  }, []);

  const getAudioContext = useCallback(() => {
    return sharedAudioContext;
  }, []);

  const isContextReady = useCallback(() => {
    return (
      sharedAudioContext !== null &&
      sharedAudioContext.state === "running" &&
      isReady
    );
  }, [isReady]);

  return {
    unlockAudioContext,
    getAudioContext,
    isReady: isContextReady(),
  };
}
