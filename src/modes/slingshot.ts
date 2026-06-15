/* -------------------------------------------------------------
   Slingshot Mode - Drag, stretch and release physics
   ------------------------------------------------------------- */

import * as THREE from 'three';
import { physics } from '../physics';
import { graphics } from '../graphics';
import { audio } from '../audio';
import { isAppLocked, triggerLockFeedback } from '../main';

class SlingshotMode {
  private active = false;
  private isDragging = false;
  
  private overlayContainer: HTMLElement | null = null;
  private canvas2d: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;

  private startPos3D = new THREE.Vector3(0, 1.1, 4.0); // launch pad
  private dragStart2D = new THREE.Vector2();
  private dragCurrent2D = new THREE.Vector2();
  
  private maxDragLength = 180; // pixels
  private onRollCallback: (() => void) | null = null;

  public init(onRoll: () => void) {
    this.onRollCallback = onRoll;
    this.overlayContainer = document.getElementById('slingshot-overlay');
    this.setupCanvas();
  }

  private setupCanvas() {
    if (!this.overlayContainer) return;
    
    // Create 2D canvas overlay dynamically
    this.canvas2d = document.createElement('canvas');
    this.canvas2d.style.position = 'absolute';
    this.canvas2d.style.top = '0';
    this.canvas2d.style.left = '0';
    this.canvas2d.style.width = '100%';
    this.canvas2d.style.height = '100%';
    this.canvas2d.style.pointerEvents = 'none'; // click passes through
    this.canvas2d.width = window.innerWidth;
    this.canvas2d.height = window.innerHeight;
    
    this.overlayContainer.appendChild(this.canvas2d);
    this.ctx2d = this.canvas2d.getContext('2d');

    window.addEventListener('resize', () => {
      if (this.canvas2d) {
        this.canvas2d.width = window.innerWidth;
        this.canvas2d.height = window.innerHeight;
      }
    });
  }

  public activate() {
    this.active = true;
    this.overlayContainer?.classList.remove('hidden');
    
    // Position dice at slingshot launcher position
    this.resetDiceToSlingshot();
    this.clearBand();
    
    // Enable event listeners on three-canvas
    const canvas3d = document.getElementById('three-canvas');
    if (canvas3d) {
      canvas3d.addEventListener('mousedown', this.onStartDrag);
      canvas3d.addEventListener('touchstart', this.onStartDrag, { passive: true });
    }
  }

  public deactivate() {
    this.active = false;
    this.isDragging = false;
    this.overlayContainer?.classList.add('hidden');
    audio.stopSlingshotStretch();
    this.clearBand();

    const canvas3d = document.getElementById('three-canvas');
    if (canvas3d) {
      canvas3d.removeEventListener('mousedown', this.onStartDrag);
      canvas3d.removeEventListener('touchstart', this.onStartDrag);
      window.removeEventListener('mousemove', this.onDrag);
      window.removeEventListener('touchmove', this.onDrag);
      window.removeEventListener('mouseup', this.onEndDrag);
      window.removeEventListener('touchend', this.onEndDrag);
    }
  }

  public resetDiceToSlingshot() {
    const scale = 0.4;
    const spacing = 1.5 * scale;
    const height = scale + 0.1;

    this.startPos3D.y = height;
    // Compute world position that projects to screen center
    const ndc = new THREE.Vector3(0, 0, 0.5);
    ndc.unproject(graphics.camera);
    this.startPos3D.x = ndc.x;
    this.startPos3D.z = ndc.z;

    physics.diceBodies.forEach((body, i) => {
      // Position in a small cluster/grid around startPos3D
      const offsetX = i === 0 ? 0 : ((i - 1) % 3 - 1) * spacing;
      const offsetZ = i === 0 ? 0 : (Math.floor((i - 1) / 3) + 1) * spacing;
      body.position.set(
        this.startPos3D.x + offsetX,
        this.startPos3D.y,
        this.startPos3D.z + offsetZ
      );
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.quaternion.set(0, 0, 0, 1);
    });
  }

  // Convert 3D position in tray to 2D screen coordinate
  private getDiceScreenPos2D(): THREE.Vector2 {
    const temp = this.startPos3D.clone();
    temp.project(graphics.camera);

    return new THREE.Vector2(
      (temp.x * 0.5 + 0.5) * window.innerWidth,
      (-(temp.y * 0.5) + 0.5) * window.innerHeight
    );
  }

  private onStartDrag = (e: MouseEvent | TouchEvent) => {
    if (!this.active) return;
    
    // Check if the application is locked
    if (isAppLocked) {
      triggerLockFeedback();
      return;
    }
    
    // Check if dice is sleeping (ready to be fired)
    if (!physics.isSleeping()) return;

    this.isDragging = true;
    
    // Start drag from dice screen coordinate
    const diceScreenPos = this.getDiceScreenPos2D();
    this.dragStart2D.copy(diceScreenPos);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    this.dragCurrent2D.set(clientX, clientY);

    // Setup global move and end listeners
    window.addEventListener('mousemove', this.onDrag);
    window.addEventListener('touchmove', this.onDrag, { passive: true });
    window.addEventListener('mouseup', this.onEndDrag);
    window.addEventListener('touchend', this.onEndDrag);
  };

  private onDrag = (e: MouseEvent | TouchEvent) => {
    if (!this.isDragging) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    this.dragCurrent2D.set(clientX, clientY);

    // Calculate drag distance
    const dragVec = this.dragCurrent2D.clone().sub(this.dragStart2D);
    const dist = dragVec.length();

    // Play procedural stretching rubber sound
    audio.playSlingshotStretch(dist, this.maxDragLength);

    // Draw the rubber band
    this.drawBand(dist);
    
    // Slightly offset the visual dice meshes in 3D to simulate pulling back together
    const pullDir3D = new THREE.Vector3(-dragVec.x, 0, dragVec.y).normalize();
    const pullDist3D = Math.min(dist / this.maxDragLength, 1.0) * 1.2;

    const scale = 0.4;
    const spacing = 1.5 * scale;

    graphics.diceMeshes.forEach((mesh, i) => {
      const offsetX = i === 0 ? 0 : ((i - 1) % 3 - 1) * spacing;
      const offsetZ = i === 0 ? 0 : (Math.floor((i - 1) / 3) + 1) * spacing;
      
      const basePos = this.startPos3D.clone().add(new THREE.Vector3(offsetX, 0, offsetZ));
      mesh.position.copy(basePos).addScaledVector(pullDir3D, pullDist3D);
      
      // Rotate dice slightly according to pull
      mesh.rotation.z = (dragVec.x / this.maxDragLength) * 0.5;
      mesh.rotation.x = (dragVec.y / this.maxDragLength) * 0.5;
    });
  };

  private onEndDrag = () => {
    if (!this.isDragging) return;
    this.isDragging = false;

    // Remove global listeners
    window.removeEventListener('mousemove', this.onDrag);
    window.removeEventListener('touchmove', this.onDrag);
    window.removeEventListener('mouseup', this.onEndDrag);
    window.removeEventListener('touchend', this.onEndDrag);

    // Stop stretch sound, play snap release
    audio.playSlingshotRelease();

    const dragVec = this.dragCurrent2D.clone().sub(this.dragStart2D);
    let dist = dragVec.length();
    
    this.clearBand();

    // Reset mesh positions back to their starting offset alignment before applying physics force
    const scale = 0.4;
    const spacing = 1.5 * scale;

    graphics.diceMeshes.forEach((mesh, i) => {
      const offsetX = i === 0 ? 0 : ((i - 1) % 3 - 1) * spacing;
      const offsetZ = i === 0 ? 0 : (Math.floor((i - 1) / 3) + 1) * spacing;
      mesh.position.copy(this.startPos3D).add(new THREE.Vector3(offsetX, 0, offsetZ));
    });

    if (dist < 15) {
      // Too short drag - cancel
      this.resetDiceToSlingshot();
      return;
    }

    // Cap drag length
    if (dist > this.maxDragLength) dist = this.maxDragLength;
    const intensity = dist / this.maxDragLength;

    // Calculate release velocity vector (opposite to drag vector)
    const angle = Math.atan2(-dragVec.y, -dragVec.x);
    const speed = 12 + intensity * 26; // dynamic speed

    physics.diceBodies.forEach((body) => {
      // Release velocity in same general direction with slight scattering spread
      const scatterAngle = angle + (Math.random() - 0.5) * 0.15;
      const finalSpeed = speed * (0.9 + Math.random() * 0.2); // minor speed variations

      const velX = Math.cos(scatterAngle) * finalSpeed;
      const velZ = Math.sin(scatterAngle) * finalSpeed;
      const velY = 4 + intensity * 8 + (Math.random() - 0.5) * 2.0;

      body.velocity.set(velX, velY, velZ);
      
      // Apply random spin
      const spinX = (Math.random() - 0.5) * 35;
      const spinY = (Math.random() - 0.5) * 35;
      const spinZ = (Math.random() - 0.5) * 35;
      body.angularVelocity.set(spinX, spinY, spinZ);
    });

    if (this.onRollCallback) {
      this.onRollCallback();
    }
  };

  private drawBand(dragDistance: number) {
    if (!this.ctx2d || !this.canvas2d) return;
    
    const ctx = this.ctx2d;
    ctx.clearRect(0, 0, this.canvas2d.width, this.canvas2d.height);

    const start = this.dragStart2D;
    const end = this.dragCurrent2D;

    // Limit visual band length in drawing
    let drawEnd = end.clone();
    if (dragDistance > this.maxDragLength) {
      const dir = end.clone().sub(start).normalize();
      drawEnd = start.clone().addScaledVector(dir, this.maxDragLength);
    }

    // Left and Right anchors of the slingshot (simulated)
    const anchorOffset = 50; // px
    const leftAnchor = new THREE.Vector2(start.x - anchorOffset, start.y - 10);
    const rightAnchor = new THREE.Vector2(start.x + anchorOffset, start.y - 10);

    // Draw elastic bands
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 4;

    const thickness = Math.max(14 - (dragDistance / this.maxDragLength) * 8, 4);

    // Band Color (Warm Rubber Orange/Gold)
    ctx.strokeStyle = '#fb8500';
    ctx.lineWidth = thickness;

    // 1. Left anchor to projectile
    ctx.beginPath();
    ctx.moveTo(leftAnchor.x, leftAnchor.y);
    ctx.lineTo(drawEnd.x, drawEnd.y);
    ctx.stroke();

    // 2. Right anchor to projectile
    ctx.beginPath();
    ctx.moveTo(rightAnchor.x, rightAnchor.y);
    ctx.lineTo(drawEnd.x, drawEnd.y);
    ctx.stroke();

    // Draw drag projectile capsule (cup)
    ctx.fillStyle = '#d35400';
    ctx.beginPath();
    ctx.arc(drawEnd.x, drawEnd.y, thickness * 1.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw guide/aim line (dashed arrow in forward direction)
    const forwardDir = start.clone().sub(drawEnd).normalize();
    const guideLength = Math.min(dragDistance, this.maxDragLength) * 1.2;
    const guideEnd = start.clone().addScaledVector(forwardDir, guideLength);

    ctx.shadowBlur = 0; // turn off shadow
    ctx.strokeStyle = 'rgba(255, 183, 3, 0.6)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(guideEnd.x, guideEnd.y);
    ctx.stroke();
    ctx.setLineDash([]); // reset
  }

  private clearBand() {
    if (this.ctx2d && this.canvas2d) {
      this.ctx2d.clearRect(0, 0, this.canvas2d.width, this.canvas2d.height);
    }
  }
}

export const slingshotMode = new SlingshotMode();
