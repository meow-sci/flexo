/** Module-level handle so commands (frame, cancel-drag) can reach the live scene. */
import type { StaticScene } from './StaticScene';

let liveScene: StaticScene | null = null;

export function getScene(): StaticScene | null {
  return liveScene;
}

export function setLiveScene(scene: StaticScene | null): void {
  liveScene = scene;
}
