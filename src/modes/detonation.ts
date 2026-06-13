/* -------------------------------------------------------------
   Detonation Mode - Explosion physics, TNT models, camera shake
   ------------------------------------------------------------- */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { physics } from '../physics';
import { graphics } from '../graphics';
import { audio } from '../audio';

class DetonationMode {
  private active = false;
  private isBlownUp = false;
  private tntGroup: THREE.Group | null = null;
  private detonatorPanel: HTMLElement | null = null;
  private detonateBtn: HTMLButtonElement | null = null;
  private onRollCallback: (() => void) | null = null;

  public init(onRoll: () => void) {
    this.onRollCallback = onRoll;
    this.detonatorPanel = document.getElementById('detonation-control');
    this.detonateBtn = document.getElementById('detonate-btn') as HTMLButtonElement;

    this.detonateBtn?.addEventListener('click', () => {
      this.explode();
    });
  }

  public activate() {
    this.active = true;
    this.isBlownUp = false;
    this.detonatorPanel?.classList.remove('hidden');

    this.buildTNTModels();
    this.resetDiceForTNT();
  }

  public deactivate() {
    this.active = false;
    this.detonatorPanel?.classList.add('hidden');
    
    // Ensure body is returned to dynamic when exiting this mode
    physics.diceBody.type = CANNON.Body.DYNAMIC;
    physics.diceBody.updateMassProperties();

    this.removeTNTModels();
  }

  public resetDiceForTNT() {
    this.isBlownUp = false;
    
    // Freeze the dice body in place visually on top of the TNT platform
    physics.diceBody.type = CANNON.Body.STATIC;
    physics.diceBody.updateMassProperties();
    
    physics.diceBody.position.set(0, 2.0, 0);
    physics.diceBody.velocity.set(0, 0, 0);
    physics.diceBody.angularVelocity.set(0, 0, 0);
    physics.diceBody.quaternion.set(0, 0, 0, 1);
  }

  // Build a beautiful procedural 3D TNT Platform in Three.js
  private buildTNTModels() {
    this.removeTNTModels(); // clean up just in case

    this.tntGroup = new THREE.Group();

    // 1. Launch Platform Disc (Steel metal look)
    const platformGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.15, 24);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x55555d,
      roughness: 0.2,
      metalness: 0.9
    });
    const platformMesh = new THREE.Mesh(platformGeo, platformMat);
    platformMesh.position.y = 0.9; // top of platform
    platformMesh.castShadow = true;
    platformMesh.receiveShadow = true;
    this.tntGroup.add(platformMesh);

    // 2. Dynamite Bundle (3 Red cylinders at bottom)
    const dynGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.4, 16);
    const dynMat = new THREE.MeshStandardMaterial({
      color: 0xd32f2f, // bright warning red
      roughness: 0.6,
      metalness: 0.1
    });

    const positions = [
      new THREE.Vector3(-0.25, 0.8, -0.15),
      new THREE.Vector3(0.25, 0.8, -0.15),
      new THREE.Vector3(0.0, 0.8, 0.28)
    ];

    positions.forEach(pos => {
      const stick = new THREE.Mesh(dynGeo, dynMat);
      stick.position.copy(pos);
      stick.castShadow = true;
      stick.receiveShadow = true;
      this.tntGroup!.add(stick);
    });

    // 3. Yellow bounding tape around dynamite sticks
    const tapeGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.2, 16);
    const tapeMat = new THREE.MeshStandardMaterial({
      color: 0xf4b400,
      roughness: 0.8,
      metalness: 0.0
    });
    const tapeMesh = new THREE.Mesh(tapeGeo, tapeMat);
    tapeMesh.position.y = 0.8;
    this.tntGroup!.add(tapeMesh);

    graphics.scene.add(this.tntGroup!);
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
  public explode() {
    if (!this.active) return;
    
    // If it is already rolling, don't allow double trigger
    if (this.isBlownUp && !physics.isSleeping()) {
      return;
    }

    // If it's already rolled and stopped elsewhere, reset it back to launchpad first
    if (physics.isSleeping() && Math.abs(physics.diceBody.position.y - 2.0) > 0.5) {
      this.resetDiceForTNT();
    }

    this.isBlownUp = true;

    // Unfreeze the physical body to make it dynamic
    physics.diceBody.type = CANNON.Body.DYNAMIC;
    physics.diceBody.updateMassProperties();
    
    // 1. Play explosion sound
    audio.playExplosion();

    // 2. Camera Shake (heavy)
    graphics.triggerCameraShake(0.65, 0.55);

    // 3. Spawn particle fireball and smoke at origin
    graphics.spawnExplosionParticles(new THREE.Vector3(0, 0.9, 0));

    // 4. Apply explosion upward blast force to physical body
    physics.diceBody.position.y = 2.2; // lift up slightly to clear contacts
    
    const blastForceY = 18.0 + Math.random() * 8.0; // strong vertical push
    const lateralScatterX = (Math.random() - 0.5) * 6.0;
    const lateralScatterZ = (Math.random() - 0.5) * 6.0;
    
    physics.diceBody.velocity.set(lateralScatterX, blastForceY, lateralScatterZ);

    // Apply high chaotic spin (angular momentum)
    const spinForceX = (Math.random() - 0.5) * 45;
    const spinForceY = (Math.random() - 0.5) * 45;
    const spinForceZ = (Math.random() - 0.5) * 45;
    physics.diceBody.angularVelocity.set(spinForceX, spinForceY, spinForceZ);

    // Trigger main roll loop callbacks
    if (this.onRollCallback) {
      this.onRollCallback();
    }
  }
}

export const detonationMode = new DetonationMode();
