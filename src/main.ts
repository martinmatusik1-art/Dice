/* -------------------------------------------------------------
   3D Dice Simulation PWA - Main Application Entrypoint
   ------------------------------------------------------------- */

import { App as CapacitorApp } from '@capacitor/app';
import * as THREE from 'three';
import { ads } from './ads';
import { audio } from './audio';
import { billing } from './billing';
import { graphics } from './graphics';
import { detonationMode } from './modes/detonation';
import { slingshotMode } from './modes/slingshot';
import { standardMode } from './modes/standard';
import { gamemode } from './modes/gamemode';
import { physics } from './physics';
import './style.css';

export let isAppLocked = false;

interface RollHistoryItem {
  time: string;
  diceValues: number[];
  sum: number;
}

class App {
  private clock = new THREE.Clock();
  private currentMode: 'standard' | 'slingshot' | 'detonation' | 'gamemode' = 'standard';
  private resultPanel: HTMLElement | null = null;
  private resultValue: HTMLElement | null = null;
  private isRolling = false;
  private settleTimeout: number | null = null;
  private username: string = 'Guest';
  private isLocked = false;
  private rollHistory: RollHistoryItem[] = [];

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

    // Load roll history from localStorage
    try {
      const savedHistory = localStorage.getItem('dice_app_roll_history');
      if (savedHistory) {
        this.rollHistory = JSON.parse(savedHistory);
      }
    } catch (e) {
      console.warn('Failed to parse roll history:', e);
      this.rollHistory = [];
    }


    // 1. Initialize core engines
    audio.enabled = true; // default on
    graphics.init(canvas);
    physics.init();
    physics.updateBoundaries(window.innerWidth / window.innerHeight);
    
    // Hook up physics ceiling collision for screen cracks
    physics.onCeilingHit = (x: number, z: number) => {
      if (this.currentMode === 'detonation' && detonationMode.lastIntensity >= 0.95) {
        this.spawnCrack(x, z);
      }
    };
    
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
    audio.currentSurface = activeBg;
    // Set active class on background button
    const activeBgBtn = document.querySelector(`.bg-btn[data-bg="${activeBg}"]`);
    if (activeBgBtn) {
      document.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
      activeBgBtn.classList.add('active');
    }

    // Load saved dice type
    const savedDiceType = localStorage.getItem('dice_app_dice_type') || 'd6';
    graphics.currentDiceType = savedDiceType;
    const diceTypeSelect = document.getElementById('dice-type-select') as HTMLSelectElement;
    if (diceTypeSelect) {
      diceTypeSelect.value = savedDiceType;
    }

    // Update settings menu previews
    this.updateSettingsMenuPreviews();

    // 3. Initialize herné módy
    const triggerRollState = () => {
      if (this.isRolling) return;
      this.resultPanel?.classList.add('hidden');
      if (this.settleTimeout) {
        clearTimeout(this.settleTimeout);
        this.settleTimeout = null;
      }

      // Randomize dice face values if not standard D6!
      if (graphics.currentDiceType !== 'd6') {
        graphics.generateAllDiceFaceValues(graphics.diceMeshes.length);
        graphics.setDiceCount(graphics.diceMeshes.length, graphics.currentThemeKey);
      }

      // Increment throws
      let rollCount = parseInt(localStorage.getItem('dice_app_roll_count') || '0', 10);
      rollCount++;
      this.isRolling = true;
      localStorage.setItem('dice_app_roll_count', rollCount.toString());
      if (rollCountDisplay) rollCountDisplay.innerText = rollCount.toString();
      this.updateSettingsMenuPreviews();
    };

    standardMode.init(triggerRollState);
    slingshotMode.init(triggerRollState);
    detonationMode.init(triggerRollState);
    gamemode.init(triggerRollState);

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
    const handleBackButton = () => {
      const billingModal = document.getElementById('billing-modal');
      const exitModal = document.getElementById('exit-modal');
      const shareModal = document.getElementById('share-modal');
      const historyModal = document.getElementById('history-modal');

      // Check Game Mode states first
      if (this.currentMode === 'gamemode') {
        const playScreen = document.getElementById('game-play-screen');
        if (playScreen && !playScreen.classList.contains('hidden')) {
          audio.playClick();
          (gamemode as any).endGameGracefully();
          return;
        } else {
          audio.playClick();
          this.switchMode('standard');
          const classicBtn = document.querySelector('.mode-btn[data-mode="standard"]');
          if (classicBtn) {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            classicBtn.classList.add('active');
          }
          return;
        }
      }

      // 1. Close settings if open
      if (settingsSidebar?.classList.contains('active')) {
        audio.playClick();
        settingsSidebar.classList.remove('active');
        return;
      }

      // 2. Close billing modal if open
      if (billingModal && !billingModal.classList.contains('hidden')) {
        audio.playClick();
        billingModal.classList.add('hidden');
        return;
      }

      // Close share modal if open
      if (shareModal && !shareModal.classList.contains('hidden')) {
        audio.playClick();
        shareModal.classList.add('hidden');
        return;
      }

      // Close history modal if open
      if (historyModal && !historyModal.classList.contains('hidden')) {
        audio.playClick();
        historyModal.classList.add('hidden');
        return;
      }

      // 3. Close exit modal if it is already open (cancel exit)
      if (exitModal && !exitModal.classList.contains('hidden')) {
        audio.playClick();
        exitModal.classList.add('hidden');
        return;
      }

      // 4. Otherwise, prompt to exit
      if (exitModal) {
        audio.playClick();
        exitModal.classList.remove('hidden');
      }
    };

    // 1. Native Android Hardware Button (Capacitor)
    try {
      CapacitorApp.addListener('backButton', handleBackButton);
    } catch (e) {
      console.warn('Capacitor App plugin not found, back button handling skipped.');
    }

    // 2. Web Browser / PWA Back Button Interception (Vercel)
    history.pushState({ app: 'dice' }, '', window.location.href);
    window.addEventListener('popstate', () => {
      history.pushState({ app: 'dice' }, '', window.location.href);
      handleBackButton();
    });

    // Exit Modal Buttons
    const exitConfirmBtn = document.getElementById('exit-confirm-btn');
    const exitCancelBtn = document.getElementById('exit-cancel-btn');
    const exitCloseBtn = document.getElementById('exit-close-btn');
    const exitModal = document.getElementById('exit-modal');

    const closeExitModal = () => {
      audio.playClick();
      exitModal?.classList.add('hidden');
    };

    exitCancelBtn?.addEventListener('click', closeExitModal);
    exitCloseBtn?.addEventListener('click', closeExitModal);
    
    // Zatvorenie kliknutím na tmavé pozadie
    exitModal?.addEventListener('pointerdown', (e) => {
      if (e.target === exitModal) closeExitModal();
    });

    exitConfirmBtn?.addEventListener('click', () => {
      audio.playClick();
      try {
        CapacitorApp.exitApp();
      } catch (e) {
        console.warn('Exit app not available in this environment.');
      }
      
      // Fallback pre PWA / Webový prehliadač
      try { window.close(); } catch (e) {}
      
      setTimeout(() => {
        window.location.href = 'about:blank';
      }, 150);
    });

    // Share Modal Event Listeners
    const topLogoBtn = document.getElementById('top-logo-btn');
    const shareModal = document.getElementById('share-modal');
    const shareCloseBtn = document.getElementById('share-close-btn');
    const shareLinkInput = document.getElementById('share-link-input') as HTMLInputElement;
    const shareNativeBtn = document.getElementById('share-native-btn');
    const shareCopyBtn = document.getElementById('share-copy-btn');
    const shareCopyBtnText = document.getElementById('share-copy-btn-text');

    const getShareUrl = () => {
      return window.location.origin + window.location.pathname;
    };

    const triggerCopyAction = () => {
      const shareUrl = getShareUrl();
      navigator.clipboard.writeText(shareUrl).then(() => {
        audio.playClick();
        if (shareCopyBtnText) {
          shareCopyBtnText.textContent = 'Copied!';
          setTimeout(() => {
            shareCopyBtnText.textContent = 'Copy';
          }, 2000);
        }
      }).catch(err => {
        console.error('Could not copy link: ', err);
      });
    };

    topLogoBtn?.addEventListener('click', () => {
      audio.playClick();
      const shareUrl = getShareUrl();
      
      if (shareLinkInput) {
        shareLinkInput.value = shareUrl;
      }
      
      // Update QR Code Image
      const qrImg = document.getElementById('share-qr-code') as HTMLImageElement;
      if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=0b0c10&data=${encodeURIComponent(shareUrl)}`;
      }

      // Encode URLs and messages for fallbacks
      const shareText = encodeURIComponent("Play with this realistic 3D Dice app with multiple modes!");
      const urlEncoded = encodeURIComponent(shareUrl);

      const whatsappBtn = document.getElementById('share-whatsapp-btn') as HTMLAnchorElement;
      if (whatsappBtn) {
        whatsappBtn.href = `https://api.whatsapp.com/send?text=${shareText}%20${urlEncoded}`;
      }

      const viberBtn = document.getElementById('share-viber-btn') as HTMLAnchorElement;
      if (viberBtn) {
        viberBtn.href = `viber://forward?text=${shareText}%20${urlEncoded}`;
      }

      const messengerBtn = document.getElementById('share-messenger-btn') as HTMLAnchorElement;
      if (messengerBtn) {
        messengerBtn.href = `https://www.facebook.com/sharer/sharer.php?u=${urlEncoded}`;
      }

      shareModal?.classList.remove('hidden');
    });

    shareCloseBtn?.addEventListener('click', () => {
      audio.playClick();
      shareModal?.classList.add('hidden');
    });

    shareModal?.addEventListener('pointerdown', (e) => {
      if (e.target === shareModal) {
        audio.playClick();
        shareModal.classList.add('hidden');
      }
    });

    shareNativeBtn?.addEventListener('click', async () => {
      audio.playClick();
      const shareUrl = getShareUrl();
      
      if (navigator.share) {
        try {
          await navigator.share({
            title: '3D Dice',
            text: 'Play with this realistic 3D Dice app with multiple modes!',
            url: shareUrl
          });
          console.log('App shared successfully');
        } catch (err) {
          console.log('Error sharing:', err);
        }
      } else {
        // Fallback to copy clipboard if native share not supported
        triggerCopyAction();
      }
    });
    shareCopyBtn?.addEventListener('click', triggerCopyAction);

    // History Modal Event Listeners
    const rollStatsBtn = document.getElementById('roll-stats-btn');
    const historyModal = document.getElementById('history-modal');
    const historyCloseBtn = document.getElementById('history-close-btn');
    const historyClearBtn = document.getElementById('history-clear-btn');
    const historyList = document.getElementById('history-list');

    const renderHistory = () => {
      if (!historyList) return;
      historyList.innerHTML = '';

      if (this.rollHistory.length === 0) {
        historyList.innerHTML = '<div class="no-history">No rolls recorded yet.</div>';
        return;
      }

      this.rollHistory.forEach((item) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'history-item';

        const leftEl = document.createElement('div');
        leftEl.className = 'history-left';

        const timeEl = document.createElement('span');
        timeEl.className = 'history-time';
        timeEl.innerText = item.time;

        const valuesEl = document.createElement('span');
        valuesEl.className = 'history-values';
        if (item.diceValues.length === 1) {
          valuesEl.innerText = `Dice: ${item.diceValues[0]}`;
        } else {
          valuesEl.innerText = `${item.diceValues.join(' + ')}`;
        }

        leftEl.appendChild(timeEl);
        leftEl.appendChild(valuesEl);

        const rightEl = document.createElement('div');
        rightEl.className = 'history-right';

        const sumEl = document.createElement('span');
        sumEl.className = 'history-sum';
        sumEl.innerText = item.sum.toString();

        rightEl.appendChild(sumEl);

        itemEl.appendChild(leftEl);
        itemEl.appendChild(rightEl);

        historyList.appendChild(itemEl);
      });
    };

    rollStatsBtn?.addEventListener('click', () => {
      audio.playClick();
      renderHistory();
      historyModal?.classList.remove('hidden');
    });

    historyCloseBtn?.addEventListener('click', () => {
      audio.playClick();
      historyModal?.classList.add('hidden');
    });

    historyModal?.addEventListener('pointerdown', (e) => {
      if (e.target === historyModal) {
        audio.playClick();
        historyModal.classList.add('hidden');
      }
    });

    historyClearBtn?.addEventListener('click', () => {
      audio.playClick();
      this.rollHistory = [];
      localStorage.removeItem('dice_app_roll_history');
      renderHistory();
    });

    const userProfileBtn = document.getElementById('user-profile-btn');
    const usernameInput = document.getElementById('username-input') as HTMLInputElement;
    const usernameSaveBtn = document.getElementById('username-save-btn');

    userProfileBtn?.addEventListener('click', () => {
      audio.playClick();
      document.getElementById('modal-setting-username')?.classList.remove('hidden');
    });

    if (usernameInput) usernameInput.value = this.username;

    usernameSaveBtn?.addEventListener('click', () => {
      audio.playClick();
      this.username = usernameInput.value.trim().substring(0, 15) || 'Guest';
      localStorage.setItem('dice_app_username', this.username);
      if (userNameDisplay) userNameDisplay.innerText = this.username;
      usernameInput.value = this.username; // Update input in case it was trimmed
      this.updateSettingsMenuPreviews();
    });

    // Reset Roll Counter
    const resetRollsBtn = document.getElementById('reset-rolls-btn');
    const rollCountDisplayUI = document.getElementById('roll-count-display');
    
    resetRollsBtn?.addEventListener('click', () => {
      audio.playClick();
      localStorage.setItem('dice_app_roll_count', '0');
      if (rollCountDisplayUI) rollCountDisplayUI.innerText = '0';
      this.updateSettingsMenuPreviews();
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
      
      if (settingsSidebar?.classList.contains('active')) {
        audio.playClick();
        settingsSidebar.classList.remove('active');
        return;
      }

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
      this.updateSettingsMenuPreviews();
      settingsSidebar?.classList.toggle('active');
    });

    closeSettingsBtn?.addEventListener('click', () => {
      audio.playClick();
      settingsSidebar?.classList.remove('active');
    });

    // Bind settings menu items to open corresponding modals
    const openModal = (id: string) => {
      audio.playClick();
      document.getElementById(id)?.classList.remove('hidden');
    };

    const closeModal = (id: string) => {
      audio.playClick();
      document.getElementById(id)?.classList.add('hidden');
    };

    document.getElementById('menu-item-username')?.addEventListener('click', () => openModal('modal-setting-username'));
    document.getElementById('menu-item-dice-config')?.addEventListener('click', () => openModal('modal-setting-dice-config'));
    document.getElementById('menu-item-theme')?.addEventListener('click', () => openModal('modal-setting-theme'));
    document.getElementById('menu-item-background')?.addEventListener('click', () => openModal('modal-setting-background'));
    document.getElementById('menu-item-feedback')?.addEventListener('click', () => openModal('modal-setting-feedback'));
    document.getElementById('menu-item-stats')?.addEventListener('click', () => openModal('modal-setting-stats'));

    // Bind close buttons in modals
    document.querySelectorAll('.modal-close-btn, .close-modal-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-modal');
        if (modalId) {
          closeModal(modalId);
        }
      });
    });

    // Close on overlay pointerdown click outside modal-content
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('pointerdown', (e) => {
        if (e.target === overlay) {
          audio.playClick();
          overlay.classList.add('hidden');
        }
      });
    });

    // Close Game Mode Setup Button (X)
    const closeGameSetupBtn = document.getElementById('close-game-setup-btn');
    closeGameSetupBtn?.addEventListener('click', () => {
      audio.playClick();
      this.switchMode('standard');
      const classicBtn = document.querySelector('.mode-btn[data-mode="standard"]');
      if (classicBtn) {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        classicBtn.classList.add('active');
      }
    });

    // Zatvorenie nastavení pri kliknutí mimo (na iné prvky ako plátno a samotné menu)
    document.addEventListener('pointerdown', (e) => {
      if (settingsSidebar?.classList.contains('active')) {
        const target = e.target as Node;
        if (!settingsSidebar.contains(target) && 
            !settingsBtn?.contains(target) && 
            !userProfileBtn?.contains(target) &&
            (target as HTMLElement).tagName !== 'CANVAS') {
          audio.playClick();
          settingsSidebar.classList.remove('active');
        }
      }
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
      this.updateSettingsMenuPreviews();
    });

    // Dice Type Selector
    const diceTypeSelectElement = document.getElementById('dice-type-select') as HTMLSelectElement;
    diceTypeSelectElement?.addEventListener('change', () => {
      audio.playClick();
      const selectedType = diceTypeSelectElement.value;
      localStorage.setItem('dice_app_dice_type', selectedType);
      graphics.currentDiceType = selectedType;
      
      // Regenerate faces and update graphics
      graphics.generateAllDiceFaceValues(graphics.diceMeshes.length);
      graphics.setDiceCount(graphics.diceMeshes.length, graphics.currentThemeKey);
      this.updateSettingsMenuPreviews();
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
        this.updateSettingsMenuPreviews();
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
        audio.currentSurface = bgKey;
        
        // UI toggle active
        bgButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.updateSettingsMenuPreviews();
      });
    });

    // Haptic Feedback Toggle
    const hapticsToggle = document.getElementById('haptics-toggle') as HTMLInputElement;
    const savedHaptics = localStorage.getItem('dice_app_haptics');
    if (savedHaptics !== null) {
      audio.hapticsEnabled = savedHaptics === 'true';
      if (hapticsToggle) hapticsToggle.checked = audio.hapticsEnabled;
    }
    hapticsToggle?.addEventListener('change', (e) => {
      audio.playClick();
      audio.hapticsEnabled = (e.target as HTMLInputElement).checked;
      localStorage.setItem('dice_app_haptics', audio.hapticsEnabled.toString());
      this.updateSettingsMenuPreviews();
    });

    // Handle Window Resize
    window.addEventListener('resize', () => {
      graphics.resize();
      physics.updateBoundaries(window.innerWidth / window.innerHeight);
    });
  }

  private switchMode(mode: 'standard' | 'slingshot' | 'detonation' | 'gamemode') {
    if (this.currentMode === mode) return;

    // Deactivate previous mode
    if (this.currentMode === 'standard') standardMode.deactivate();
    else if (this.currentMode === 'slingshot') slingshotMode.deactivate();
    else if (this.currentMode === 'detonation') detonationMode.deactivate();
    else if (this.currentMode === 'gamemode') gamemode.deactivate();

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
    } else if (mode === 'gamemode') {
      gamemode.activate();
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
      } else if (this.currentMode === 'gamemode') {
        // Handled automatically or ignored
      }
    }
  }

  private spawnCrack(x: number, z: number) {
    const container = document.getElementById('crack-container');
    if (!container) return;

    // Konverzia 3D súradnice do 2D
    const pos = new THREE.Vector3(x, 11, z);
    pos.project(graphics.camera);

    const screenX = (pos.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (pos.y * -0.5 + 0.5) * window.innerHeight;

    const crack = document.createElement('div');
    crack.className = 'glass-crack';
    crack.style.left = `${screenX}px`;
    crack.style.top = `${screenY}px`;
    
    const rot = Math.random() * 360;
    const scale = 0.7 + Math.random() * 0.6;
    crack.style.transform = `translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`;
    
    crack.innerHTML = `
      <svg viewBox="0 0 200 200" width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <style>
          .crack-line { stroke: rgba(255, 255, 255, 0.85); stroke-width: 2.5; fill: none; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 3px rgba(255,255,255,0.6)); }
          .crack-sub { stroke: rgba(255, 255, 255, 0.4); stroke-width: 1; fill: none; stroke-linecap: round; stroke-linejoin: round; }
        </style>
        <circle cx="100" cy="100" r="3" fill="rgba(255, 255, 255, 0.9)" />
        <path class="crack-line" d="M100 100 L70 40 L50 20 M100 100 L140 30 L170 10 M100 100 L160 90 L190 85 M100 100 L150 160 L170 190 M100 100 L90 170 L70 195 M100 100 L30 140 L10 160 M100 100 L20 80 L5 60"/>
        <path class="crack-sub" d="M70 40 L110 50 L140 30 M140 30 L130 70 L160 90 M160 90 L120 120 L150 160 M150 160 L100 140 L90 170 M90 170 L70 130 L30 140 M30 140 L60 90 L20 80 M20 80 L60 60 L70 40"/>
        <path class="crack-sub" d="M85 70 L115 70 L125 90 L115 115 L85 115 L75 90 Z"/>
      </svg>
    `;
    
    container.appendChild(crack);
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
    // Map physical faces to actual face values based on the current dice type
    const actualFaces = graphics.getActualFaceValues(faces);

    if (this.currentMode === 'gamemode') {
      gamemode.handleDiceSettled(actualFaces);
      return;
    }
    if (this.resultValue && this.resultPanel) {
      const sum = actualFaces.reduce((a, b) => a + b, 0);
      if (actualFaces.length === 1) {
        this.resultValue.innerText = actualFaces[0].toString();
      } else {
        this.resultValue.innerText = `${actualFaces.join(' + ')} = ${sum}`;
      }
      this.resultPanel.classList.remove('hidden');
      
      // Gentle bump animation to draw attention
      this.resultPanel.style.transform = 'translateX(-50%) scale(1.1)';
      setTimeout(() => {
        if (this.resultPanel) this.resultPanel.style.transform = 'translateX(-50%) scale(1)';
      }, 150);

      // Save to Roll History
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      const newItem: RollHistoryItem = {
        time: timeStr,
        diceValues: [...actualFaces],
        sum: sum
      };

      this.rollHistory.unshift(newItem);
      if (this.rollHistory.length > 10) {
        this.rollHistory = this.rollHistory.slice(0, 10);
      }
      localStorage.setItem('dice_app_roll_history', JSON.stringify(this.rollHistory));
    }
  }

  private updateSettingsMenuPreviews() {
    // 1. Username
    const menuUsernameDesc = document.getElementById('menu-username-desc');
    if (menuUsernameDesc) {
      menuUsernameDesc.innerText = this.username;
    }

    // 2. Dice Config
    const menuDiceDesc = document.getElementById('menu-dice-desc');
    if (menuDiceDesc) {
      const diceCount = localStorage.getItem('dice_app_dice_count') || '1';
      const diceType = (localStorage.getItem('dice_app_dice_type') || 'd6').toUpperCase();
      menuDiceDesc.innerText = `${diceType} / ${diceCount} ks`;
    }

    // 3. Dice Theme
    const menuThemeDesc = document.getElementById('menu-theme-desc');
    if (menuThemeDesc) {
      const activeTheme = localStorage.getItem('dice_app_theme') || 'classic';
      const themeLabelMap: Record<string, string> = {
        classic: 'Classic White',
        onyx: 'Onyx Black',
        neon: 'Neon Cyan',
        emerald: 'Emerald Green',
        monochrome: 'Monochrome',
        sapphire: 'Ruby Red'
      };
      menuThemeDesc.innerText = themeLabelMap[activeTheme] || 'Classic White';
    }

    // 4. Background
    const menuBgDesc = document.getElementById('menu-bg-desc');
    if (menuBgDesc) {
      const activeBg = localStorage.getItem('dice_app_bg_theme') || 'classic';
      const bgLabelMap: Record<string, string> = {
        classic: 'Midnight Blue',
        concrete: 'Concrete',
        mahogany: 'Dark Mahogany',
        wood: 'Wood Texture',
        mramor: 'Marble Texture',
        corten: 'Corten Metal'
      };
      menuBgDesc.innerText = bgLabelMap[activeBg] || 'Midnight Blue';
    }

    // 5. Haptics
    const menuHapticsDesc = document.getElementById('menu-haptics-desc');
    if (menuHapticsDesc) {
      menuHapticsDesc.innerText = audio.hapticsEnabled ? 'Zapnuté' : 'Vypnuté';
    }

    // 6. Stats
    const menuStatsDesc = document.getElementById('menu-stats-desc');
    const statsTotalRolls = document.getElementById('stats-total-rolls');
    const totalRolls = localStorage.getItem('dice_app_roll_count') || '0';
    if (menuStatsDesc) {
      menuStatsDesc.innerText = `Celkovo hodené: ${totalRolls}-krát`;
    }
    if (statsTotalRolls) {
      statsTotalRolls.innerText = `${totalRolls}-krát`;
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
