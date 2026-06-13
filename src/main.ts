/* -------------------------------------------------------------
   3D Dice Simulation PWA - Main Application Entrypoint
   ------------------------------------------------------------- */

import './style.css';
import * as THREE from 'three';
import { graphics } from './graphics';
import { physics } from './physics';
import { audio } from './audio';
import { ads } from './ads';
import { billing } from './billing';
import { standardMode } from './modes/standard';
import { slingshotMode } from './modes/slingshot';
import { detonationMode } from './modes/detonation';

export let isAppLocked = false;

class App {
  private clock = new THREE.Clock();
  private currentMode: 'standard' | 'slingshot' | 'detonation' = 'standard';
  private resultPanel: HTMLElement | null = null;
  private resultValue: HTMLElement | null = null;
  private isRolling = false;
  private settleTimeout: number | null = null;
  private isLocked = false;

  public init() {
    this.resultPanel = document.getElementById('roll-result-container');
    this.resultValue = document.getElementById('roll-result-value');

    const canvas = document.getElementById('three-canvas') as HTMLCanvasElement;
    if (!canvas) {
      console.error("Canvas element not found!");
      return;
    }

    // Initialize stats and user info
    const rollCountDisplay = document.getElementById('roll-count-display');
    const userNameDisplay = document.getElementById('user-name-display');
    const userProfileBtn = document.getElementById('user-profile-btn');

    let rollCount = parseInt(localStorage.getItem('dice_app_roll_count') || '0', 10);
    if (rollCountDisplay) rollCountDisplay.innerText = rollCount.toString();

    let username = localStorage.getItem('dice_app_username') || 'Hosť';
    if (userNameDisplay) userNameDisplay.innerText = username;

    userProfileBtn?.addEventListener('click', () => {
      audio.playClick();
      const newName = prompt("Zadajte svoje meno:", username);
      if (newName && newName.trim() !== '') {
        username = newName.trim().substring(0, 15);
        localStorage.setItem('dice_app_username', username);
        if (userNameDisplay) userNameDisplay.innerText = username;
      }
    });

    // 1. Initialize core engines
    audio.enabled = true; // default on
    graphics.init(canvas);
    physics.init();
    physics.updateBoundaries(window.innerWidth / window.innerHeight);
    
    // 2. Initialize monetization modules
    ads.init();
    billing.init();

    // 3. Initialize herné módy
    const triggerRollState = () => {
      this.isRolling = true;
      this.resultPanel?.classList.add('hidden');
      if (this.settleTimeout) {
        clearTimeout(this.settleTimeout);
        this.settleTimeout = null;
      }

      // Increment throws
      rollCount++;
      localStorage.setItem('dice_app_roll_count', rollCount.toString());
      if (rollCountDisplay) rollCountDisplay.innerText = rollCount.toString();
    };

    standardMode.init(triggerRollState);
    slingshotMode.init(triggerRollState);
    detonationMode.init(triggerRollState);

    // Default mode is standard
    standardMode.activate();

    // 4. Setup general UI listener and buttons
    this.setupUI();

    // 5. Start animation loop
    this.clock.getDelta(); // reset clock
    this.tick();
  }

  private setupUI() {
    // Mode switcher buttons
    const modeButtons = document.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        audio.playClick();
        const mode = btn.getAttribute('data-mode') as any;
        if (mode) {
          this.switchMode(mode);
          
          // Toggle active UI class
          modeButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });

    // Main Canvas click/touch (Standard mode rolls, or others reset)
    const canvas3d = document.getElementById('three-canvas');
    canvas3d?.addEventListener('pointerdown', (e) => {
      // Prevent throw if clicking menu overlay buttons
      if ((e.target as HTMLElement).tagName !== 'CANVAS') return;
      
      this.handleCanvasInteraction();
    });

    // Lock button event listener
    const lockBtn = document.getElementById('lock-btn');
    lockBtn?.addEventListener('click', () => {
      audio.playClick();
      this.isLocked = !this.isLocked;
      isAppLocked = this.isLocked; // sync global export
      
      const icon = lockBtn.querySelector('i');
      if (icon) {
        icon.className = this.isLocked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
      }
      
      if (this.isLocked) {
        lockBtn.classList.add('locked');
      } else {
        lockBtn.classList.remove('locked');
      }
    });

    // Settings panel toggle
    const settingsBtn = document.getElementById('settings-btn');
    const settingsSidebar = document.getElementById('settings-sidebar');
    const closeSettingsBtn = document.getElementById('close-settings-btn');

    settingsBtn?.addEventListener('click', () => {
      audio.playClick();
      settingsSidebar?.classList.toggle('active');
    });

    closeSettingsBtn?.addEventListener('click', () => {
      audio.playClick();
      settingsSidebar?.classList.remove('active');
    });

    // Sound toggle buttons (Header and checkboxes)
    const headerSoundBtn = document.getElementById('sound-toggle-btn');
    const colSoundCheckbox = document.getElementById('collision-sound-checkbox') as HTMLInputElement;
    const effSoundCheckbox = document.getElementById('effects-sound-checkbox') as HTMLInputElement;

    const toggleSoundState = (enabled: boolean) => {
      audio.enabled = enabled;
      if (headerSoundBtn) {
        const icon = headerSoundBtn.querySelector('i');
        if (icon) {
          icon.className = enabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
        }
      }
      if (colSoundCheckbox) colSoundCheckbox.checked = enabled;
    };

    headerSoundBtn?.addEventListener('click', () => {
      audio.playClick();
      toggleSoundState(!audio.enabled);
    });

    colSoundCheckbox?.addEventListener('change', () => {
      audio.playClick();
      toggleSoundState(colSoundCheckbox.checked);
    });

    effSoundCheckbox?.addEventListener('change', () => {
      audio.playClick();
      audio.effectsEnabled = effSoundCheckbox.checked;
    });

    // Dice Theme Selector
    const colorButtons = document.querySelectorAll('.color-btn');
    
    colorButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        audio.playClick();
        const themeKey = btn.getAttribute('data-theme') || 'classic';
        const isPremium = ads.getIsPremium();

        if (themeKey !== 'classic' && !isPremium) {
          // Locked - open play billing
          document.getElementById('billing-modal')?.classList.remove('hidden');
          return;
        }

        // Apply theme
        graphics.updateDiceTheme(themeKey);
        
        // UI toggle active
        colorButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Handle Window Resize
    window.addEventListener('resize', () => {
      graphics.resize();
      physics.updateBoundaries(window.innerWidth / window.innerHeight);
    });
  }

  private switchMode(mode: 'standard' | 'slingshot' | 'detonation') {
    if (this.currentMode === mode) return;

    // Deactivate previous mode
    if (this.currentMode === 'standard') standardMode.deactivate();
    else if (this.currentMode === 'slingshot') slingshotMode.deactivate();
    else if (this.currentMode === 'detonation') detonationMode.deactivate();

    this.currentMode = mode;
    this.isRolling = false;
    this.resultPanel?.classList.add('hidden');

    // Update instruction text
    const instruction = document.getElementById('instruction-text');
    if (instruction) {
      if (mode === 'standard') instruction.innerText = "Klikni na obrazovku alebo zatras mobilom pre hod";
      else if (mode === 'slingshot') instruction.innerText = "Potiahni kocku smerom dozadu a vystreľ ju";
      else if (mode === 'detonation') instruction.innerText = "Klikni na detonátor na odpálenie kocky";
    }

    // Activate new mode
    if (mode === 'standard') {
      physics.resetToCenter();
      standardMode.activate();
    } else if (mode === 'slingshot') {
      slingshotMode.activate();
    } else if (mode === 'detonation') {
      detonationMode.activate();
    }
  }

  private handleCanvasInteraction() {
    if (this.isLocked) {
      audio.playLockedBuzzer();
      this.showLockedNotification();
      return;
    }

    if (physics.isSleeping()) {
      if (this.currentMode === 'standard') {
        standardMode.throwDice();
      } else if (this.currentMode === 'slingshot') {
        slingshotMode.resetDiceToSlingshot();
        this.resultPanel?.classList.add('hidden');
      } else if (this.currentMode === 'detonation') {
        detonationMode.resetDiceForTNT();
        this.resultPanel?.classList.add('hidden');
      }
    }
  }

  private showLockedNotification() {
    // Prevent toast spamming
    if (document.getElementById('lock-toast')) return;

    const toast = document.createElement('div');
    toast.id = 'lock-toast';
    toast.style.position = 'fixed';
    toast.style.top = '140px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%) translateY(-15px)';
    toast.style.background = 'rgba(231, 76, 60, 0.95)';
    toast.style.color = '#fff';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '24px';
    toast.style.fontWeight = '600';
    toast.style.fontSize = '0.85rem';
    toast.style.boxShadow = '0 6px 20px rgba(231, 76, 60, 0.4)';
    toast.style.zIndex = '1000';
    toast.style.opacity = '0';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '8px';
    toast.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    toast.innerHTML = `<i class="fa-solid fa-lock"></i> <span>Hádzanie kockou je uzamknuté!</span>`;

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-15px)';
      setTimeout(() => toast.remove(), 300);
    }, 1800);
  }

  // Application Loop Tick (renders visual frame, runs physics steps)
  private tick = () => {
    requestAnimationFrame(this.tick);

    const dt = Math.min(this.clock.getDelta(), 0.1); // cap dt at 100ms to prevent glitches

    // 1. Step physics
    physics.step(dt);

    // 2. Synchronize ThreeJS Graphics with CannonJS Physics
    if (graphics.diceMesh) {
      graphics.diceMesh.position.copy(physics.diceBody.position as any);
      graphics.diceMesh.quaternion.copy(physics.diceBody.quaternion as any);
    }

    // 3. Update active particles and screen shakes
    graphics.updateParticlesAndEffects(dt);

    // 4. Check if the dice has stopped rolling to reveal the result
    if (this.isRolling && physics.isSleeping()) {
      this.isRolling = false;
      
      // Delay result display slightly for dramatic pacing
      this.settleTimeout = window.setTimeout(() => {
        const value = physics.getUpwardFace();
        this.showResult(value);
      }, 500);
    }

    // 5. Render Scene
    graphics.renderer.render(graphics.scene, graphics.camera);
  };

  private showResult(value: number) {
    if (this.resultValue && this.resultPanel) {
      this.resultValue.innerText = value.toString();
      this.resultPanel.classList.remove('hidden');
      
      // Gentle bump animation to draw attention
      this.resultPanel.style.transform = 'translateX(-50%) scale(1.1)';
      setTimeout(() => {
        if (this.resultPanel) this.resultPanel.style.transform = 'translateX(-50%) scale(1)';
      }, 150);
    }
  }
}

// Instantiate and start app
const app = new App();
window.addEventListener('DOMContentLoaded', () => {
  app.init();
});
