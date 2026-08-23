declare global {
  interface ScreenOrientation {
    lock(orientation: OrientationLockType): Promise<void>;
  }
}

export {};
