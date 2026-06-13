/* -------------------------------------------------------------
   Standard Rolling Mode - Swipe & Shake interactions
   ------------------------------------------------------------- */

import { physics } from '../physics';
import { audio } from '../audio';
import { isAppLocked, triggerLockFeedback } from '../main';

class StandardMode {
  private active = false;
  private lastX: number | null = null;
  private lastY: number | null = null;
  private lastZ: number | null = null;
  private lastUpdate = 0;
  private isRolling = false;
  private onRollCallback: (() => void) | null = null;

  public init(onRoll: () => void) {
    this.onRollCallback = onRoll;
    this.setupShakeListener();
  }

  public activate() {
    this.active = true;
    this.isRolling = false;
  }

  public deactivate() {
    this.active = false;
  }

  // Triggers a dynamic standard throw
  public throwDice() {
    if (this.isRolling) return;
    
    this.isRolling = true;
    audio.playClick();

    const count = physics.diceBodies.length;
    const scale = 1.0 - (count - 1) * 0.08;
    const spacing = 2.0 * scale;

    physics.diceBodies.forEach((body, i) => {
      // Position each dice above the table, in a small grid offset to prevent initial clipping
      const offsetX = ((i % 3) - 1) * spacing;
      const offsetZ = (Math.floor(i / 3) - 0.5) * spacing;

      body.position.set(
        offsetX + (Math.random() - 0.5) * 0.4 * scale,
        6.0 + (Math.random() - 0.5) * 0.5,
        offsetZ + (Math.random() - 0.5) * 0.4 * scale
      );

      // Random downward and scattering velocities
      const forceX = (Math.random() - 0.5) * 8;
      const forceY = -4 - Math.random() * 6; // push downwards
      const forceZ = (Math.random() - 0.5) * 8;
      body.velocity.set(forceX, forceY, forceZ);

      // Apply chaotic spin
      const spinX = (Math.random() - 0.5) * 30;
      const spinY = (Math.random() - 0.5) * 30;
      const spinZ = (Math.random() - 0.5) * 30;
      body.angularVelocity.set(spinX, spinY, spinZ);
    });

    // 4. Trigger callback to update main UI loop
    if (this.onRollCallback) {
      this.onRollCallback();
    }

    // Set rolling state
    setTimeout(() => {
      this.isRolling = false;
    }, 1000);
  }

  // Shaking accelerometer listener
  private setupShakeListener() {
    // Attempt request permission for iOS on click
    window.addEventListener('click', () => {
      const DeviceMotion = (window as any).DeviceMotionEvent;
      if (DeviceMotion && typeof DeviceMotion.requestPermission === 'function') {
        DeviceMotion.requestPermission()
          .then((permissionState: string) => {
            if (permissionState === 'granted') {
              this.startListening();
            }
          })
          .catch(console.error);
      } else {
        this.startListening();
      }
    }, { once: true });
  }

  private startListening() {
    window.addEventListener('devicemotion', (event) => {
      if (!this.active || this.isRolling) return;

      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      const curTime = Date.now();
      if ((curTime - this.lastUpdate) > 100) {
        this.lastUpdate = curTime;

        const x = acc.x;
        const y = acc.y;
        const z = acc.z;

        if (this.lastX !== null && this.lastY !== null && this.lastZ !== null) {
          const deltaX = Math.abs(x - this.lastX);
          const deltaY = Math.abs(y - this.lastY);
          const deltaZ = Math.abs(z - this.lastZ);
          
          // 12.0 m/s^2 represents a distinct physical shake gesture, ignoring minor sensor noise
          const shakeLimit = 12.0;
          
          if (deltaX > shakeLimit || deltaY > shakeLimit || deltaZ > shakeLimit) {
            if (isAppLocked) {
              triggerLockFeedback();
              return;
            }
            this.throwDice();
          }
        }

        this.lastX = x;
        this.lastY = y;
        this.lastZ = z;
      }
    });
  }
}

export const standardMode = new StandardMode();
