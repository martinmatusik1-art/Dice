/* -------------------------------------------------------------
   Standard Rolling Mode - Swipe & Shake interactions
   ------------------------------------------------------------- */

import { physics } from '../physics';
import { audio } from '../audio';

class StandardMode {
  private active = false;
  private shakeThreshold = 15;
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

    // 1. Position dice above table
    physics.diceBody.position.set(
      (Math.random() - 0.5) * 2, // slightly random X offset
      6.0,                       // high start position
      (Math.random() - 0.5) * 2  // slightly random Z offset
    );

    // 2. Calculate satisfying random throw velocities
    const forceX = (Math.random() - 0.5) * 8;
    const forceY = -3 - Math.random() * 5; // pushed downwards
    const forceZ = (Math.random() - 0.5) * 8;

    physics.diceBody.velocity.set(forceX, forceY, forceZ);

    // 3. Apply high rotation spin (angular momentum)
    const spinX = (Math.random() - 0.5) * 25;
    const spinY = (Math.random() - 0.5) * 25;
    const spinZ = (Math.random() - 0.5) * 25;

    physics.diceBody.angularVelocity.set(spinX, spinY, spinZ);

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
        const diffTime = curTime - this.lastUpdate;
        this.lastUpdate = curTime;

        const x = acc.x;
        const y = acc.y;
        const z = acc.z;

        if (this.lastX !== null && this.lastY !== null && this.lastZ !== null) {
          const speed = Math.abs(x + y + z - this.lastX - this.lastY - this.lastZ) / diffTime * 10000;
          
          if (speed > this.shakeThreshold) {
            // Phone shaken - roll!
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
