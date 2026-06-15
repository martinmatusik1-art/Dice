/* -------------------------------------------------------------
   Cannon.js Physics Simulation Engine
   ------------------------------------------------------------- */

import * as CANNON from 'cannon-es';
import { audio } from './audio';

class PhysicsEngine {
  public world!: CANNON.World;
  public diceBodies: CANNON.Body[] = []; // Active physical dice bodies
  
  // Backwards compatibility getter for single-die references
  public get diceBody(): CANNON.Body {
    return this.diceBodies[0];
  }
  
  private diceMaterial = new CANNON.Material('dice');
  private floorMaterial = new CANNON.Material('floor');
  private wallMaterial = new CANNON.Material('wall');

  // Storing walls as properties to update them dynamically
  private wallLeftBody!: CANNON.Body;
  private wallRightBody!: CANNON.Body;
  private wallFrontBody!: CANNON.Body;
  private wallBackBody!: CANNON.Body;
  private wallTopBody!: CANNON.Body;
  public onCeilingHit: ((x: number, z: number) => void) | null = null;

  public init() {
    // 1. World configuration
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.81 * 2, 0); // Double gravity for faster, satisfying rolling
    
    // Use split impulse solver for cleaner contact physics
    this.world.defaultContactMaterial.contactEquationStiffness = 1e7;
    this.world.defaultContactMaterial.contactEquationRelaxation = 4;

    this.createContactMaterials();
    this.createTrayPhysics();
    this.setDiceCount(1);
  }

  private createContactMaterials() {
    // Dice - Floor contact behavior (bouncy)
    const diceFloorContact = new CANNON.ContactMaterial(this.diceMaterial, this.floorMaterial, {
      friction: 0.25,
      restitution: 0.42, // nice bounce
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3
    });
    this.world.addContactMaterial(diceFloorContact);

    // Dice - Wall contact behavior (less bouncy, more friction)
    const diceWallContact = new CANNON.ContactMaterial(this.diceMaterial, this.wallMaterial, {
      friction: 0.15,
      restitution: 0.35,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3
    });
    this.world.addContactMaterial(diceWallContact);
  }

  private createTrayPhysics() {
    // Floor Box (corresponds to Three.js floor 10x0.2x12, physics floor matches)
    const floorShape = new CANNON.Box(new CANNON.Vec3(5, 0.1, 6));
    const floorBody = new CANNON.Body({
      mass: 0,
      shape: floorShape,
      material: this.floorMaterial
    });
    floorBody.position.set(0, -0.1, 0);
    this.world.addBody(floorBody);

    // Border Walls (with large half-extents of 20 to prevent corner leaks on wide aspect ratios)
    const wallHeight = 40;

    // Left wall
    const wallLeftShape = new CANNON.Box(new CANNON.Vec3(0.2, wallHeight, 20));
    this.wallLeftBody = new CANNON.Body({ mass: 0, shape: wallLeftShape, material: this.wallMaterial });
    this.wallLeftBody.position.set(-5.2, wallHeight, 0);
    this.world.addBody(this.wallLeftBody);

    // Right wall
    const wallRightShape = new CANNON.Box(new CANNON.Vec3(0.2, wallHeight, 20));
    this.wallRightBody = new CANNON.Body({ mass: 0, shape: wallRightShape, material: this.wallMaterial });
    this.wallRightBody.position.set(5.2, wallHeight, 0);
    this.world.addBody(this.wallRightBody);

    // Front wall
    const wallFrontShape = new CANNON.Box(new CANNON.Vec3(20, wallHeight, 0.2));
    this.wallFrontBody = new CANNON.Body({ mass: 0, shape: wallFrontShape, material: this.wallMaterial });
    this.wallFrontBody.position.set(0, wallHeight, -6.2);
    this.world.addBody(this.wallFrontBody);

    // Back wall
    const wallBackShape = new CANNON.Box(new CANNON.Vec3(20, wallHeight, 0.2));
    this.wallBackBody = new CANNON.Body({ mass: 0, shape: wallBackShape, material: this.wallMaterial });
    this.wallBackBody.position.set(0, wallHeight, 6.2);
    this.world.addBody(this.wallBackBody);

    // Top Wall (Ceiling / Screen)
    const wallTopShape = new CANNON.Box(new CANNON.Vec3(20, 0.2, 20));
    this.wallTopBody = new CANNON.Body({ mass: 0, shape: wallTopShape, material: this.wallMaterial });
    this.wallTopBody.position.set(0, 11, 0); // Tesne pod kamerou
    this.wallTopBody.addEventListener('collide', (event: any) => {
      const relativeVelocity = event.contact.getImpactVelocityAlongNormal();
      if (Math.abs(relativeVelocity) > 2.0 && this.onCeilingHit) {
        this.onCeilingHit(event.body.position.x, event.body.position.z);
      }
    });
    this.world.addBody(this.wallTopBody);
  }

  // Update physical walls based on screen aspect ratio so the dice never leaves the viewport
  public updateBoundaries(aspect: number) {
    const fovRad = (45 * Math.PI) / 180;
    
    // Calculate visible space at camera distance (Y = 15)
    // We adjust Y slightly if graphics.ts has mobile zoom (which zoom Y to 15 + delta)
    const cameraY = aspect < 0.7 ? 15 + (0.7 - aspect) * 8 : 15;
    
    const visibleHalfHeight = Math.tan(fovRad / 2) * cameraY;
    const visibleHalfWidth = visibleHalfHeight * aspect;

    // Constrain dice center so it doesn't cross the screen edge
    // Dice size is 2x2x2, so its boundary radius is ~1.0
    const marginX = 1.05;
    const marginZ = 1.05;

    // Safety minimum boundaries
    const limitX = Math.max(visibleHalfWidth - marginX, 1.4);
    const limitZ = Math.max(visibleHalfHeight - marginZ, 1.4);

    this.wallLeftBody.position.x = -limitX - 0.2;
    this.wallRightBody.position.x = limitX + 0.2;
    this.wallFrontBody.position.z = -limitZ - 0.2;
    this.wallBackBody.position.z = limitZ + 0.2;
  }

  // Set active count of physical dice bodies in the simulation
  public setDiceCount(count: number) {
    // 1. Clear existing bodies from world
    this.diceBodies.forEach(body => {
      this.world.removeBody(body);
    });
    this.diceBodies = [];

    // 2. Spawn specified count (scale down as count increases)
    const scale = 0.4;
    const diceShape = new CANNON.Box(new CANNON.Vec3(scale, scale, scale));

    for (let i = 0; i < count; i++) {
      const body = new CANNON.Body({
        mass: 1.2, // standard dice weight
        shape: diceShape,
        material: this.diceMaterial
      });

      // Grid position offsets to avoid overlaps on load (scaled spacing)
      const spacing = 2.2 * scale;
      const offsetX = ((i % 3) - 1) * spacing;
      const offsetZ = (Math.floor(i / 3) - 0.5) * spacing;
      body.position.set(offsetX, scale + 0.1, offsetZ);

      body.linearDamping = 0.15;
      body.angularDamping = 0.15;

      // Collision sound trigger
      body.addEventListener('collide', (event: any) => {
        const relativeVelocity = event.contact.getImpactVelocityAlongNormal();
        audio.playThud(relativeVelocity);
      });

      this.world.addBody(body);
      this.diceBodies.push(body);
    }
  }

  public step(dt: number) {
    this.world.step(dt);
    
    // Safety check: if dice somehow glitches through the floor or escapes, reset it to center
    const scale = 0.4;
    const spacing = 2.2 * scale;
    
    this.diceBodies.forEach((body, i) => {
      if (body.position.y < -5.0) {
        const offsetX = ((i % 3) - 1) * spacing;
        const offsetZ = (Math.floor(i / 3) - 0.5) * spacing;
        body.position.set(offsetX, scale + 0.1, offsetZ);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        body.quaternion.set(0, 0, 0, 1);
      }
    });
  }

  // Check if all active dice have fully stopped rolling
  public isSleeping(): boolean {
    const velThreshold = 0.08;
    const angThreshold = 0.08;

    return this.diceBodies.every(body => {
      const linVel = body.velocity.length();
      const angVel = body.angularVelocity.length();
      return linVel < velThreshold && angVel < angThreshold;
    });
  }

  // Get upward face for standard single-die backwards compatibility
  public getUpwardFace(): number {
    return this.diceBodies.length > 0 ? this.getUpwardFaceForBody(this.diceBodies[0]) : 1;
  }

  // Get array of upward faces for all active dice
  public getUpwardFaces(): number[] {
    return this.diceBodies.map(body => this.getUpwardFaceForBody(body));
  }

  // Detect which face of a specific dice body is pointing upwards in world space
  private getUpwardFaceForBody(body: CANNON.Body): number {
    const localNormals = [
      { face: 1, vector: new CANNON.Vec3(1, 0, 0) },   // +X
      { face: 6, vector: new CANNON.Vec3(-1, 0, 0) },  // -X
      { face: 2, vector: new CANNON.Vec3(0, 1, 0) },   // +Y
      { face: 5, vector: new CANNON.Vec3(0, -1, 0) },  // -Y
      { face: 3, vector: new CANNON.Vec3(0, 0, 1) },   // +Z
      { face: 4, vector: new CANNON.Vec3(0, 0, -1) }   // -Z
    ];

    let maxDot = -Infinity;
    let upwardFace = 1;

    for (const normalInfo of localNormals) {
      const worldNormal = new CANNON.Vec3();
      // Multiply rotation quaternion of physical body by local normal to get world normal
      body.quaternion.vmult(normalInfo.vector, worldNormal);

      // Dot product with world UP vector (0, 1, 0)
      const dot = worldNormal.dot(new CANNON.Vec3(0, 1, 0));
      
      if (dot > maxDot) {
        maxDot = dot;
        upwardFace = normalInfo.face;
      }
    }

    return upwardFace;
  }

  // Reset all active physics dice to a stable layout on the table floor
  public resetToCenter() {
    const scale = 0.4;
    const spacing = 2.2 * scale;
    
    this.diceBodies.forEach((body, i) => {
      const offsetX = ((i % 3) - 1) * spacing;
      const offsetZ = (Math.floor(i / 3) - 0.5) * spacing;
      body.position.set(offsetX, scale + 0.1, offsetZ);
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.quaternion.set(0, 0, 0, 1);
    });
  }
}

export const physics = new PhysicsEngine();
