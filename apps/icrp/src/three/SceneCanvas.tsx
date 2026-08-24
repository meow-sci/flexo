import { useEffect, useRef } from 'react';
import { StaticScene } from './StaticScene';
import { getScene, setLiveScene } from './sceneHandle';

/**
 * Mounts the {@link StaticScene} into a full-size div for its lifetime
 * (StrictMode-safe: dispose on cleanup).
 */
export function SceneCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new StaticScene(host);
    setLiveScene(scene);
    return () => {
      if (getScene() === scene) setLiveScene(null);
      scene.dispose();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      tabIndex={-1}
      onPointerDown={() => hostRef.current?.focus()}
      className="absolute inset-0 outline-none"
    />
  );
}
