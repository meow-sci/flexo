import { useEffect, useRef } from 'react'
import { EditorScene } from './EditorScene'
import { loadDockingPortCalibration } from './debugCalibration'

/**
 * Mounts the three.js {@link EditorScene} (Viewport + store-driven SubPart sync)
 * into a full-size div for its lifetime. Disposes cleanly on unmount (handles
 * React StrictMode's double-invoke in dev).
 */
export function ViewportCanvas() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new EditorScene(host)

    if (new URLSearchParams(window.location.search).get('debug') === 'dockingport') {
      void loadDockingPortCalibration(scene.viewport.scene)
    }

    return () => scene.dispose()
  }, [])

  // `tabIndex={-1}` + focus-on-pointerdown makes the viewport the focus owner
  // whenever the user interacts with the 3D scene (selecting, orbiting). That keeps
  // global editor hotkeys that overlap react-aria's keyboard nav — the arrow-key
  // nudges especially — from being swallowed by a still-focused toolbar/menu/list.
  return (
    <div
      ref={hostRef}
      tabIndex={-1}
      onPointerDown={() => hostRef.current?.focus()}
      className="absolute inset-0 outline-none"
    />
  )
}
