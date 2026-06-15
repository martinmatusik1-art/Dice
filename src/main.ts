/* -------------------------------------------------------------
   3D Dice Simulation PWA - Main Application Entrypoint
   ------------------------------------------------------------- */

import * as THREE from 'three';
import { ads } from './ads';
import { audio } from './audio';
import { billing } from './billing';
import { graphics } from './graphics';
import { detonationMode } from './modes/detonation';
import { slingshotMode } from './modes/slingshot';
import { standardMode } from './modes/standard';
import { physics } from './physics';
import './style.css';

export let isAppLocked = false;

class App {
  private clock = new THREE.Clock();
  private currentMode: 'standard' | 'slingshot' | 'detonation' = 'standard';
  private resultPanel: HTMLElement | null = null;
  private resultValue: HTMLElement | null = null;
  private isRolling = false;
  private settleTimeout: number | null = null;
  private username: string = 'Guest';
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

    const rollCount = parseInt(localStorage.getItem('dice_app_roll_count') || '0', 10);
    if (rollCountDisplay) rollCountDisplay.innerText = rollCount.toString();

    this.username = localStorage.getItem('dice_app_username') || 'Guest';
    if (userNameDisplay) userNameDisplay.innerText = this.username;


    // 1. Initialize core engines
    audio.enabled = true; // default on
    graphics.init(canvas);
    physics.init();
    physics.updateBoundaries(window.innerWidth / window.innerHeight);
    
    // 2. Initialize monetization modules
    ads.init();
    billing.init();

    // Load saved themes
    const isPremium = ads.getIsPremium();
    
    const savedTheme = localStorage.getItem('dice_app_theme') || 'classic';
    const activeTheme = (savedTheme === 'classic' || isPremium) ? savedTheme : 'classic';
    graphics.currentThemeKey = activeTheme;
    // Set active class on color button
    const activeColorBtn = document.querySelector(`.color-btn[data-theme="${activeTheme}"]`);
    if (activeColorBtn) {
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      activeColorBtn.classList.add('active');
    }

    const savedBg = localStorage.getItem('dice_app_bg_theme') || 'classic';
    const activeBg = (savedBg === 'classic' || isPremium) ? savedBg : 'classic';
    // Set initial background in graphics
    graphics.updateBackgroundTheme(activeBg);
    // Set active class on background button
    const activeBgBtn = document.querySelector(`.bg-btn[data-bg="${activeBg}"]`);
    if (activeBgBtn) {
      document.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
      activeBgBtn.classList.add('active');
    }

    // 3. Initialize herné módy
    const triggerRollState = () => {
      if (this.isRolling) return;
      this.resultPanel?.classList.add('hidden');
      if (this.settleTimeout) {
        clearTimeout(this.settleTimeout);
        this.settleTimeout = null;
      }

      // Increment throws
      let rollCount = parseInt(localStorage.getItem('dice_app_roll_count') || '0', 10);
      rollCount++;
      this.isRolling = true;
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
    // Common UI elements
    const settingsSidebar = document.getElementById('settings-sidebar');
    const userNameDisplay = document.getElementById('user-name-display');

    // User Profile Management (Open settings sidebar)
    const userProfileBtn = document.getElementById('user-profile-btn');
    const usernameInput = document.getElementById('username-input') as HTMLInputElement;
    const usernameSaveBtn = document.getElementById('username-save-btn');

    userProfileBtn?.addEventListener('click', () => {
      audio.playClick();
      settingsSidebar?.classList.add('active');
    });

    if (usernameInput) usernameInput.value = this.username;

    usernameSaveBtn?.addEventListener('click', () => {
      audio.playClick();
      this.username = usernameInput.value.trim().substring(0, 15) || 'Guest';
      localStorage.setItem('dice_app_username', this.username);
      if (userNameDisplay) userNameDisplay.innerText = this.username;
      usernameInput.value = this.username; // Update input in case it was trimmed
    });

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
    const closeSettingsBtn = document.getElementById('close-settings-btn');

    settingsBtn?.addEventListener('click', () => {
      audio.playClick();
      settingsSidebar?.classList.toggle('active');
    });

    closeSettingsBtn?.addEventListener('click', () => {
      audio.playClick();
      settingsSidebar?.classList.remove('active');
    });

    // Dice Count Slider
    const diceCountSlider = document.getElementById('dice-count-slider') as HTMLInputElement;
    const diceCountDisplayVal = document.getElementById('dice-count-display-val');

    // Load saved count
    let diceCount = parseInt(localStorage.getItem('dice_app_dice_count') || '1', 10);
    if (isNaN(diceCount) || diceCount < 1 || diceCount > 6) {
      diceCount = 1;
    }

    if (diceCountSlider) {
      diceCountSlider.value = diceCount.toString();
    }
    if (diceCountDisplayVal) {
      diceCountDisplayVal.innerText = diceCount.toString();
    }

    // Set initial count
    physics.setDiceCount(diceCount);
    graphics.setDiceCount(diceCount, graphics.currentThemeKey);

    diceCountSlider?.addEventListener('input', () => {
      let count = parseInt(diceCountSlider.value, 10);
      if (isNaN(count) || count < 1 || count > 6) count = 1;

      if (diceCountDisplayVal) {
        diceCountDisplayVal.innerText = count.toString();
      }

      localStorage.setItem('dice_app_dice_count', count.toString());

      // Update engines
      physics.setDiceCount(count);
      graphics.setDiceCount(count, graphics.currentThemeKey);

      // Reset the current mode's dice positions
      if (this.currentMode === 'slingshot') {
        slingshotMode.resetDiceToSlingshot();
      } else if (this.currentMode === 'detonation') {
        detonationMode.resetDiceForTNT();
      } else {
        physics.resetToCenter();
      }

      audio.playClick();
    });

    // Sound toggle buttons (Header sound toggle only, checkboxes removed)
    const headerSoundBtn = document.getElementById('sound-toggle-btn');
 
    const toggleSoundState = (enabled: boolean) => {
      audio.enabled = enabled;
      if (headerSoundBtn) {
        const icon = headerSoundBtn.querySelector('i');
        if (icon) {
          icon.className = enabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
        }
      }
    };
 
    headerSoundBtn?.addEventListener('click', () => {
      audio.playClick();
      toggleSoundState(!audio.enabled);
    });
 
    // Dice Theme Selector
    const colorButtons = document.querySelectorAll('.color-btn');
    
    colorButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        audio.playClick();
        const themeKey = btn.getAttribute('data-theme') || 'classic';
        const isPrem = ads.getIsPremium();
 
        if (themeKey !== 'classic' && !isPrem) {
          // Locked - open play billing
          document.getElementById('billing-modal')?.classList.remove('hidden');
          return;
        }
 
        // Save and apply theme
        localStorage.setItem('dice_app_theme', themeKey);
        graphics.updateDiceTheme(themeKey);
        
        // UI toggle active
        colorButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Table Background Selector
    const bgButtons = document.querySelectorAll('.bg-btn');
    
    bgButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        audio.playClick();
        const bgKey = btn.getAttribute('data-bg') || 'classic';
        const isPrem = ads.getIsPremium();
 
        if (bgKey !== 'classic' && !isPrem) {
          // Locked - open play billing
          document.getElementById('billing-modal')?.classList.remove('hidden');
          return;
        }
 
        // Save and apply theme
        localStorage.setItem('dice_app_bg_theme', bgKey);
        graphics.updateBackgroundTheme(bgKey);
        
        // UI toggle active
        bgButtons.forEach(b => b.classList.remove('active'));
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
      triggerLockFeedback();
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

  // Application Loop Tick (renders visual frame, runs physics steps)
  private tick = () => {
    requestAnimationFrame(this.tick);

    const dt = Math.min(this.clock.getDelta(), 0.1); // cap dt at 100ms to prevent glitches

    // 1. Step physics
    physics.step(dt);

    // 2. Synchronize ThreeJS Graphics with CannonJS Physics
    const minLen = Math.min(graphics.diceMeshes.length, physics.diceBodies.length);
    for (let i = 0; i < minLen; i++) {
      graphics.diceMeshes[i].position.copy(physics.diceBodies[i].position as any);
      graphics.diceMeshes[i].quaternion.copy(physics.diceBodies[i].quaternion as any);
    }

    // 3. Update active particles and screen shakes
    graphics.updateParticlesAndEffects(dt);

    // 4. Check if the dice has stopped rolling to reveal the result
    if (this.isRolling && physics.isSleeping()) {
      this.isRolling = false;
      
      // Delay result display slightly for dramatic pacing
      this.settleTimeout = window.setTimeout(() => {
        const values = physics.getUpwardFaces();
        this.showResults(values);
      }, 500);
    }

    // 5. Render Scene
    graphics.renderer.render(graphics.scene, graphics.camera);
  };

  private showResults(faces: number[]) {
    if (this.resultValue && this.resultPanel) {
      if (faces.length === 1) {
        this.resultValue.innerText = faces[0].toString();
      } else {
        const sum = faces.reduce((a, b) => a + b, 0);
        this.resultValue.innerText = `${faces.join(' + ')} = ${sum}`;
      }
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

export function triggerLockFeedback() {
  if (document.getElementById('lock-toast')) return;
  audio.playLockedBuzzer();

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
