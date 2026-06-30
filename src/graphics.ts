/* -------------------------------------------------------------
   Three.js Rendering Engine with Custom Procedural Die Mesh
   ------------------------------------------------------------- */

import * as THREE from 'three';

export interface DiceTheme {
  dice: string;
  pips: string;
  roughness: number;
  metalness: number;
  emissive?: string;
  label: string;
}

export const DICE_THEMES: Record<string, DiceTheme> = {
  classic: { dice: '#ffffff', pips: '#d32f2f', roughness: 0.1, metalness: 0.0, label: "Classic White" },
  onyx: { dice: '#151518', pips: '#e5c158', roughness: 0.15, metalness: 0.85, label: "Onyx Black" },
  neon: { dice: '#0a0b10', pips: '#00f0ff', emissive: '#002b3d', roughness: 0.25, metalness: 0.2, label: "Neon Cyan" },
  emerald: { dice: '#023812', pips: '#ffd700', roughness: 0.12, metalness: 0.4, label: "Emerald Green" },
  monochrome: { dice: '#ffffff', pips: '#111111', roughness: 0.1, metalness: 0.0, label: "Classic Black & White" },
  sapphire: { dice: '#d62828', pips: '#ffffff', roughness: 0.08, metalness: 0.1, label: "Ruby Red" }
};

class GraphicsEngine {
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public renderer!: THREE.WebGLRenderer;
  
  public diceMeshes: THREE.Mesh[] = [];
  public get diceMesh(): THREE.Mesh | null {
    return this.diceMeshes[0] || null;
  }
  public set diceMesh(mesh: THREE.Mesh | null) {
    if (mesh) this.diceMeshes[0] = mesh;
    else this.diceMeshes = [];
  }
  private diceMaterials: THREE.MeshStandardMaterial[][] = [];
  private diceGeometry: THREE.BufferGeometry | null = null;
  public currentThemeKey: string = 'classic';
  
  private trayFloor!: THREE.Mesh;
  private particles: Array<{
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
  }> = [];

  public init(canvas: HTMLCanvasElement) {
    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = null; // transparent to see CSS gradient background

    // 2. Camera setup
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    const targetY = aspect < 0.7 ? 15 + (0.7 - aspect) * 8 : 15;
    this.camera.position.set(0, targetY, 0); // Looking straight down
    this.camera.lookAt(0, 0, 0);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 4. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambientLight);

    // Main Directional Light (Shadow Caster)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(5, 12, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 25;
    dirLight.shadow.camera.left = -6;
    dirLight.shadow.camera.right = 6;
    dirLight.shadow.camera.top = 6;
    dirLight.shadow.camera.bottom = -6;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // Spotlight for dramatic effect in center
    const spotLight = new THREE.SpotLight(0xffb703, 0.5, 20, Math.PI / 4, 0.5, 1);
    spotLight.position.set(0, 10, 0);
    spotLight.target.position.set(0, 0, 0);
    this.scene.add(spotLight);

    this.createTray();
    this.createDice(this.currentThemeKey);
  }

  // Create rolling tray (floor and borders)
  private createTray() {
    // Floor (Dark leather/metallic board)
    const floorGeo = new THREE.BoxGeometry(10, 0.2, 12);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x11131a,
      roughness: 0.6,
      metalness: 0.25,
      bumpScale: 0.05
    });
    this.trayFloor = new THREE.Mesh(floorGeo, floorMat);
    this.trayFloor.position.y = -0.1;
    this.trayFloor.receiveShadow = true;
    this.scene.add(this.trayFloor);

    // Subtle Grid/Lines on the Floor
    const gridHelper = new THREE.GridHelper(10, 10, 0x2c3e50, 0x1a252f);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);
  }

  // Generate perfect Rounded Cube Geometry with correct UVs
  private createRoundedBoxGeometry(width: number, height: number, depth: number, radius: number, segments: number): THREE.BufferGeometry {
    const geometry = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
    const positionAttribute = geometry.attributes.position;
    const temp = new THREE.Vector3();

    const wHalf = width / 2;
    const hHalf = height / 2;
    const dHalf = depth / 2;

    for (let i = 0; i < positionAttribute.count; i++) {
      temp.fromBufferAttribute(positionAttribute, i);

      const rx = Math.sign(temp.x) * Math.max(0, Math.abs(temp.x) - (wHalf - radius));
      const ry = Math.sign(temp.y) * Math.max(0, Math.abs(temp.y) - (hHalf - radius));
      const rz = Math.sign(temp.z) * Math.max(0, Math.abs(temp.z) - (dHalf - radius));

      const flatX = temp.x - rx;
      const flatY = temp.y - ry;
      const flatZ = temp.z - rz;

      const displacement = new THREE.Vector3(rx, ry, rz);
      if (displacement.length() > 0) {
        displacement.normalize().multiplyScalar(radius);
        temp.set(flatX + displacement.x, flatY + displacement.y, flatZ + displacement.z);
        positionAttribute.setXYZ(i, temp.x, temp.y, temp.z);
      }
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  // Generates canvas texture representing the pips on a face
  private createDiceFaceTexture(value: number, theme: DiceTheme): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Background
    ctx.fillStyle = theme.dice;
    ctx.fillRect(0, 0, 256, 256);

    // Bevel borders
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 242, 242);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, 228, 228);

    // Pip styling
    ctx.fillStyle = theme.pips;
    
    if (theme.emissive) {
      ctx.shadowColor = theme.pips;
      ctx.shadowBlur = 18;
    } else {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;
    }

    const r = 23; // pip radius
    const drawPip = (x: number, y: number) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const center = 128;
    const low = 68;
    const high = 188;

    switch (value) {
      case 1:
        drawPip(center, center);
        break;
      case 2:
        drawPip(low, low);
        drawPip(high, high);
        break;
      case 3:
        drawPip(low, low);
        drawPip(center, center);
        drawPip(high, high);
        break;
      case 4:
        drawPip(low, low);
        drawPip(high, low);
        drawPip(low, high);
        drawPip(high, high);
        break;
      case 5:
        drawPip(low, low);
        drawPip(high, low);
        drawPip(center, center);
        drawPip(low, high);
        drawPip(high, high);
        break;
      case 6:
        drawPip(low, low);
        drawPip(high, low);
        drawPip(low, center);
        drawPip(high, center);
        drawPip(low, high);
        drawPip(high, high);
        break;
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  // Set active count of visual 3D dice in the scene
  public setDiceCount(count: number, themeKey: string) {
    // 1. Clean up existing meshes
    this.diceMeshes.forEach(mesh => {
      this.scene.remove(mesh);
    });
    this.diceMeshes = [];

    // Clean up materials
    this.diceMaterials.forEach(mats => {
      mats.forEach(mat => mat.dispose());
    });
    this.diceMaterials = [];

    this.currentThemeKey = themeKey;
    const theme = DICE_THEMES[themeKey] || DICE_THEMES.classic;
    
    // Ensure geometry is loaded
    if (!this.diceGeometry) {
      this.diceGeometry = this.createRoundedBoxGeometry(2.0, 2.0, 2.0, 0.35, 12);
    }

    const faces = [1, 6, 2, 5, 3, 4];
    const scale = 0.4;

    for (let i = 0; i < count; i++) {
      // Generate materials for this specific die
      const materials = faces.map(val => {
        const texture = this.createDiceFaceTexture(val, theme);
        
        const matParams: THREE.MeshStandardMaterialParameters = {
          map: texture,
          roughness: theme.roughness,
          metalness: theme.metalness
        };

        if (theme.emissive) {
          matParams.emissive = new THREE.Color(theme.emissive);
          matParams.emissiveIntensity = 1.0;
        }

        return new THREE.MeshStandardMaterial(matParams);
      });

      this.diceMaterials.push(materials);

      const mesh = new THREE.Mesh(this.diceGeometry, materials);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      // Scale visual mesh
      mesh.scale.setScalar(scale);
      
      // Default layout offset to match physics initial layout
      const spacing = 2.2 * scale;
      const offsetX = ((i % 3) - 1) * spacing;
      const offsetZ = (Math.floor(i / 3) - 0.5) * spacing;
      mesh.position.set(offsetX, scale + 0.1, offsetZ);
      
      this.scene.add(mesh);
      this.diceMeshes.push(mesh);
    }
  }

  // Backwards-compatibility wrappers
  public createDice(themeKey: string) {
    this.setDiceCount(this.diceMeshes.length || 1, themeKey);
  }

  public updateDiceTheme(themeKey: string) {
    this.setDiceCount(this.diceMeshes.length, themeKey);
  }

  // Spawn smoke and fire particle systems for detonation mode
  public spawnExplosionParticles(position: THREE.Vector3, intensity = 1.0) {
    const particleCount = Math.floor((15 + Math.random() * 15) * intensity + 10);
    const colors = [0xff4e00, 0xff9100, 0xf9d423, 0x333333]; // Fire colors and gray smoke
    
    for (let i = 0; i < particleCount; i++) {
      const size = (0.05 + Math.random() * 0.15) * (0.5 + intensity * 0.8);
      const geo = new THREE.DodecahedronGeometry(size);
      
      const isSmoke = Math.random() > 0.6;
      const color = isSmoke ? 0x444444 : colors[Math.floor(Math.random() * 3)];
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        metalness: 0.1,
        transparent: true,
        opacity: isSmoke ? 0.6 : 0.9
      });

      if (!isSmoke) {
        mat.emissive = new THREE.Color(color);
        mat.emissiveIntensity = 1.0 + intensity * 1.0;
      }

      const pMesh = new THREE.Mesh(geo, mat);
      
      // Position slightly offset from explosion point
      pMesh.position.copy(position);
      pMesh.position.x += (Math.random() - 0.5) * 0.8 * intensity;
      pMesh.position.y += (Math.random() - 0.5) * 0.4 * intensity;
      pMesh.position.z += (Math.random() - 0.5) * 0.8 * intensity;

      // Random expanding velocity
      const angle = Math.random() * Math.PI * 2;
      const speed = (1 + Math.random() * 5) * (0.5 + intensity * 1.2);
      const verticalSpeed = (2 + Math.random() * 4) * (0.5 + intensity * 1.5);
      
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        verticalSpeed,
        Math.sin(angle) * speed
      );

      const life = (0.3 + Math.random() * 0.4) * (0.7 + intensity * 0.5);
      this.scene.add(pMesh);

      this.particles.push({
        mesh: pMesh,
        velocity,
        life,
        maxLife: life
      });
    }
  }

  // Dynamic Camera Shake Effect
  private shakeTime = 0;
  private shakeIntensity = 0;

  public triggerCameraShake(intensity: number, duration: number) {
    this.shakeIntensity = intensity;
    this.shakeTime = duration;
  }

  public updateParticlesAndEffects(dt: number) {
    // 1. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      } else {
        // Move particle
        p.mesh.position.addScaledVector(p.velocity, dt);
        // Apply gravity to particles
        p.velocity.y -= 9.81 * dt;
        
        // Scale down and fade out
        const ratio = p.life / p.maxLife;
        p.mesh.scale.setScalar(ratio);
        
        const mat = p.mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = ratio;
        if (mat.emissiveIntensity > 0) {
          mat.emissiveIntensity = ratio * 1.5;
        }
      }
    }

    // 2. Camera Shake logic
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const currentShake = this.shakeIntensity * (this.shakeTime / 0.5); // fade shake out
      this.camera.position.x = (Math.random() - 0.5) * currentShake;
      this.camera.position.z = (Math.random() - 0.5) * currentShake;
      
      if (this.shakeTime <= 0) {
        const aspect = window.innerWidth / window.innerHeight;
        const targetY = aspect < 0.7 ? 15 + (0.7 - aspect) * 8 : 15;
        this.camera.position.set(0, targetY, 0); // reset camera position
      }
    }
  }

  public resize() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = aspect;
    
    const targetY = aspect < 0.7 ? 15 + (0.7 - aspect) * 8 : 15;
    this.camera.position.y = targetY;
    
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public updateBackgroundTheme(themeKey: string) {
    const themes: Record<string, { css: string, floor: number, roughness: number, metalness: number, isImage?: boolean }> = {
      classic: { css: 'radial-gradient(circle at center, #1b2030 0%, #080a10 100%)', floor: 0x11131a, roughness: 0.6, metalness: 0.25 },
      concrete: { css: 'radial-gradient(circle at center, #787c80 0%, #303336 100%)', floor: 0x4a4d50, roughness: 0.9, metalness: 0.1 },
      mahogany: { css: 'linear-gradient(45deg, #3f110c 0%, #170402 100%)', floor: 0x260703, roughness: 0.2, metalness: 0.1 },
      wood: { css: "url('/wood.jpg') center/cover no-repeat", floor: 0xffffff, roughness: 0.8, metalness: 0.05, isImage: true },
      mramor: { css: "url('/mramor.jpg') center/cover no-repeat", floor: 0xffffff, roughness: 0.15, metalness: 0.1, isImage: true },
      corten: { css: "url('/corten.jpg') center/cover no-repeat", floor: 0xffffff, roughness: 0.75, metalness: 0.6, isImage: true }
    };

    const theme = themes[themeKey] || themes.classic;

    const container = document.getElementById('app-container');
    if (container) {
      container.style.background = theme.css;
    }

    if (this.trayFloor && this.trayFloor.material) {
      const mat = this.trayFloor.material as THREE.MeshStandardMaterial;
      mat.color.setHex(theme.floor);
      mat.roughness = theme.roughness;
      mat.metalness = theme.metalness;

      if (theme.isImage) {
        const loader = new THREE.TextureLoader();
        loader.load(`/${themeKey}.jpg`, (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          // Scale texture to repeat nicely on the tray geometry
          texture.repeat.set(1.5, 1.8);
          
          if (mat.map) {
            mat.map.dispose();
          }
          mat.map = texture;
          mat.needsUpdate = true;
        });
      } else {
        if (mat.map) {
          mat.map.dispose();
          mat.map = null;
          mat.needsUpdate = true;
        }
      }
    }
  }
}

export const graphics = new GraphicsEngine();
