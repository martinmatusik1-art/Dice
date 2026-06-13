/* -------------------------------------------------------------
   Detonation Mode - Explosion physics, TNT models, camera shake
   ------------------------------------------------------------- */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { physics } from '../physics';
import { graphics } from '../graphics';
import { audio } from '../audio';
import { isAppLocked, triggerLockFeedback } from '../main';

class DetonationMode {
  private active = false;
  private isBlownUp = false;
  private tntGroup: THREE.Group | null = null;
  private detonatorPanel: HTMLElement | null = null;
  private plungerHandle: HTMLElement | null = null;
  private onRollCallback: (() => void) | null = null;

  private isDragging = false;
  private startY = 0;
  private currentDragY = 0;
  private maxDragY = 80; // Travel distance of the plunger in pixels

  public init(onRoll: () => void) {
    this.onRollCallback = onRoll;
    this.detonatorPanel = document.getElementById('detonation-control');
    this.plungerHandle = document.getElementById('plunger-handle');

    this.plungerHandle?.addEventListener('pointerdown', this.onStartDrag);
  }

  public activate() {
    this.active = true;
    this.isBlownUp = false;
    this.detonatorPanel?.classList.remove('hidden');

    this.buildTNTModels();
    this.resetDiceForTNT();

    // Reset plunger visuals
    if (this.plungerHandle) {
      this.plungerHandle.style.transition = 'none';
      this.plungerHandle.style.transform = 'translateX(-50%) translateY(0px)';
      this.plungerHandle.style.cursor = 'grab';
    }
  }

  public deactivate() {
    this.active = false;
    this.isDragging = false;
    this.detonatorPanel?.classList.add('hidden');
    
    // Ensure all bodies are returned to dynamic when exiting this mode
    physics.diceBodies.forEach(body => {
      body.type = CANNON.Body.DYNAMIC;
      body.updateMassProperties();
    });

    this.removeTNTModels();

    window.removeEventListener('pointermove', this.onDrag);
    window.removeEventListener('pointerup', this.onEndDrag);
    window.removeEventListener('pointercancel', this.onEndDrag);
  }

  public resetDiceForTNT() {
    this.isBlownUp = false;
    
    // Freeze all dice bodies in place vertically on the floor
    const scale = 0.4;
    
    physics.diceBodies.forEach((body, i) => {
      body.type = CANNON.Body.STATIC;
      body.updateMassProperties();
      
      // Stack them vertically: bottom starts directly on the floor, each next is 2.1 * scale units higher
      body.position.set(0, scale + i * (2.1 * scale), 0);
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.quaternion.set(0, 0, 0, 1);
    });
  }

  // Pointer drag event handlers for the plunger
  private onStartDrag = (e: PointerEvent) => {
    if (!this.active) return;

    // 1. Check if application is locked
    if (isAppLocked) {
      triggerLockFeedback();
      return;
    }

    // 2. If it is already rolling, don't allow drag
    if (this.isBlownUp && !physics.isSleeping()) {
      return;
    }

    this.isDragging = true;
    this.startY = e.clientY;
    this.currentDragY = 0;

    if (this.plungerHandle) {
      this.plungerHandle.style.cursor = 'grabbing';
      this.plungerHandle.style.transition = 'none';
    }

    window.addEventListener('pointermove', this.onDrag);
    window.addEventListener('pointerup', this.onEndDrag);
    window.addEventListener('pointercancel', this.onEndDrag);
  };

  private onDrag = (e: PointerEvent) => {
    if (!this.isDragging) return;

    const deltaY = e.clientY - this.startY;
    // Dragging down corresponds to positive Y offset
    this.currentDragY = Math.max(0, Math.min(this.maxDragY, deltaY));

    if (this.plungerHandle) {
      this.plungerHandle.style.transform = `translateX(-50%) translateY(${this.currentDragY}px)`;
    }
  };

  private onEndDrag = () => {
    if (!this.isDragging) return;
    this.isDragging = false;

    window.removeEventListener('pointermove', this.onDrag);
    window.removeEventListener('pointerup', this.onEndDrag);
    window.removeEventListener('pointercancel', this.onEndDrag);

    if (this.plungerHandle) {
      this.plungerHandle.style.cursor = 'grab';
    }

    const intensity = this.currentDragY / this.maxDragY;

    if (intensity > 0.15) {
      // SLAM DOWN: visually push plunger to bottom instantly
      if (this.plungerHandle) {
        this.plungerHandle.style.transition = 'transform 0.08s cubic-bezier(0.2, 0.8, 0.2, 1)';
        this.plungerHandle.style.transform = `translateX(-50%) translateY(${this.maxDragY}px)`;
      }

      this.explode(intensity);

      // Smoothly return handle back to top after 1.5s
      setTimeout(() => {
        if (this.active && this.plungerHandle) {
          this.plungerHandle.style.transition = 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)';
          this.plungerHandle.style.transform = 'translateX(-50%) translateY(0px)';
        }
      }, 1500);
    } else {
      // Snap back up
      if (this.plungerHandle) {
        this.plungerHandle.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
        this.plungerHandle.style.transform = 'translateX(-50%) translateY(0px)';
      }
    }
  };

  // Build a beautiful procedural 3D TNT Platform in Three.js (Removed per user request)
  private buildTNTModels() {
    this.removeTNTModels();
  }

  private removeTNTModels() {
    if (this.tntGroup) {
      graphics.scene.remove(this.tntGroup);
      
      this.tntGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });

      this.tntGroup = null;
    }
  }

  // Explode dynamite stick
  public explode(intensity: number = 1.0) {
    if (!this.active) return;

    // If it's already rolled and stopped elsewhere, reset it back to launchpad first
    const scale = 0.4;
    const startY = scale;
    if (physics.isSleeping() && Math.abs(physics.diceBody.position.y - startY) > 0.5) {
      this.resetDiceForTNT();
    }

    this.isBlownUp = true;

    // 1. Play explosion sound
    audio.playExplosion(intensity);

    // 2. Camera Shake (scaled)
    graphics.triggerCameraShake(0.25 + intensity * 0.45, 0.25 + intensity * 0.35);

    // 3. Spawn particle fireball and smoke at origin (directly on the floor)
    graphics.spawnExplosionParticles(new THREE.Vector3(0, 0.1, 0), intensity);

    // 4. Apply explosion upward blast force to physical bodies
    physics.diceBodies.forEach((body, i) => {
      body.type = CANNON.Body.DYNAMIC;
      body.updateMassProperties();

      // Lift slightly relative to size to prevent floor clipping
      body.position.y += 0.1 * scale;

      // Blast force propagates vertically, losing slight velocity on higher stacked dice
      const heightFactor = 1.0 - (i * 0.12);
      const blastForceY = (8.0 + intensity * 18.0) * heightFactor + Math.random() * 4.0;
      
      const lateralScatterX = (Math.random() - 0.5) * 8.0 * intensity;
      const lateralScatterZ = (Math.random() - 0.5) * 8.0 * intensity;
      body.velocity.set(lateralScatterX, blastForceY, lateralScatterZ);

      // Apply chaotic spin (angular momentum) proportional to intensity
      const spinIntensity = 20.0 + intensity * 25.0;
      const spinForceX = (Math.random() - 0.5) * spinIntensity;
      const spinForceY = (Math.random() - 0.5) * spinIntensity;
      const spinForceZ = (Math.random() - 0.5) * spinIntensity;
      body.angularVelocity.set(spinForceX, spinForceY, spinForceZ);
    });

    // Trigger main roll loop callbacks
    if (this.onRollCallback) {
      this.onRollCallback();
    }
  }
}

export const detonationMode = new DetonationMode();

