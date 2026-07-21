/* -------------------------------------------------------------
   Game Mode - Interactive arithmetic dice game (Solo & Versus)
   ------------------------------------------------------------- */

import { physics } from '../physics';
import { audio } from '../audio';
import { graphics } from '../graphics';

type Difficulty = 'easy' | 'medium' | 'hard';
type Mode = 'solo' | 'versus';

class GameMode {
  private onRollCallback: (() => void) | null = null;

  // Game configuration
  private mode: Mode = 'solo';
  private difficulty: Difficulty = 'easy';
  private maxRounds = 10; // 0 for endless
  private diceCount = 1;
  private timeLimitMedium = 7; // seconds
  private timeLimitHard = 4; // seconds

  // Active game state
  private currentRound = 0;
  private inGamePlay = false;
  private isRolling = false;
  private optionsRevealed = false;
  private timerInterval: number | null = null;
  private nextRoundTimeout: number | null = null;

  // Solo stats
  private soloScore = 0;
  private soloCorrectAnswers = 0;
  private soloIncorrectAnswers = 0;
  private soloStreak = 0;
  private soloMaxStreak = 0;
  private soloTotalReactionTime = 0; // ms
  private soloRoundStartTime = 0;

  // Versus stats
  private p1Score = 0;
  private p2Score = 0;
  private p1Answered = false;
  private p2Answered = false;
  private p1CorrectCount = 0;
  private p2CorrectCount = 0;
  private p1TotalReactionTime = 0;
  private p2TotalReactionTime = 0;
  private p1AnswerChoice: number | null = null;
  private p2AnswerChoice: number | null = null;
  private p1AnswerTime = 0;
  private p2AnswerTime = 0;
  private versusRoundStartTime = 0;

  // Correct answer for the current round
  private correctSum = 0;
  private currentOptions: number[] = [];

  // DOM Elements
  private overlay: HTMLElement | null = null;
  private setupScreen: HTMLElement | null = null;
  private playScreen: HTMLElement | null = null;
  private statsScreen: HTMLElement | null = null;
  private appContainer: HTMLElement | null = null;

  public init(onRoll: () => void) {
    this.onRollCallback = onRoll;
    this.overlay = document.getElementById('game-mode-overlay');
    this.setupScreen = document.getElementById('game-setup-screen');
    this.playScreen = document.getElementById('game-play-screen');
    this.statsScreen = document.getElementById('game-stats-screen');
    this.appContainer = document.getElementById('app-container');

    this.bindSetupUI();
  }

  public activate() {
    this.overlay?.classList.remove('hidden');
    this.showScreen('setup');
    
    // Sync setup dice count with current app settings
    const savedDice = parseInt(localStorage.getItem('dice_app_dice_count') || '1', 10);
    this.diceCount = savedDice;

    // Sync setup player names
    const savedP1 = localStorage.getItem('dice_app_username') || 'Guest';
    const savedP2 = localStorage.getItem('dice_app_versus_p2_name') || 'Player 2';
    const p1Input = document.getElementById('setup-p1-name-input') as HTMLInputElement;
    const p2Input = document.getElementById('setup-p2-name-input') as HTMLInputElement;
    if (p1Input) p1Input.value = savedP1;
    if (p2Input) p2Input.value = savedP2;

    const namesGroup = document.getElementById('versus-names-group');
    if (namesGroup) {
      if (this.mode === 'versus') {
        namesGroup.classList.remove('hidden');
      } else {
        namesGroup.classList.add('hidden');
      }
    }

    // Make sure normal dice settings slider does not interfere during gamemode
    physics.resetToCenter();
  }

  public deactivate() {
    this.endCurrentTimers();
    this.exitFullscreen();
    this.appContainer?.classList.remove('in-game');
    this.overlay?.classList.add('hidden');
    this.inGamePlay = false;

    // Restore standard count to physics & graphics
    const savedDice = parseInt(localStorage.getItem('dice_app_dice_count') || '1', 10);
    physics.setDiceCount(savedDice);
    graphics.setDiceCount(savedDice, graphics.currentThemeKey);
    physics.resetToCenter();

    // Reset HUD and tray states
    graphics.setTrayOpacity(1.0);
    this.setHudOnFloor(false);
  }

  private showScreen(screen: 'setup' | 'play' | 'stats') {
    this.setupScreen?.classList.add('hidden');
    this.playScreen?.classList.add('hidden');
    this.statsScreen?.classList.add('hidden');

    if (screen === 'setup') {
      this.setupScreen?.classList.remove('hidden');
    } else if (screen === 'play') {
      this.playScreen?.classList.remove('hidden');
    } else if (screen === 'stats') {
      this.statsScreen?.classList.remove('hidden');
    }
  }

  private bindSetupUI() {
    // Mode selectors
    const btnSolo = document.getElementById('btn-mode-solo');
    const btnVersus = document.getElementById('btn-mode-versus');
    
    btnSolo?.addEventListener('click', () => {
      audio.playClick();
      this.mode = 'solo';
      btnSolo.classList.add('active');
      btnVersus?.classList.remove('active');
      document.getElementById('versus-names-group')?.classList.add('hidden');
    });

    btnVersus?.addEventListener('click', () => {
      audio.playClick();
      this.mode = 'versus';
      btnVersus.classList.add('active');
      btnSolo?.classList.remove('active');
      
      const savedP1 = localStorage.getItem('dice_app_username') || 'Guest';
      const savedP2 = localStorage.getItem('dice_app_versus_p2_name') || 'Player 2';
      const p1Input = document.getElementById('setup-p1-name-input') as HTMLInputElement;
      const p2Input = document.getElementById('setup-p2-name-input') as HTMLInputElement;
      if (p1Input) p1Input.value = savedP1;
      if (p2Input) p2Input.value = savedP2;

      document.getElementById('versus-names-group')?.classList.remove('hidden');
    });

    // Difficulty selectors
    const btnEasy = document.getElementById('btn-diff-easy');
    const btnMedium = document.getElementById('btn-diff-medium');
    const btnHard = document.getElementById('btn-diff-hard');

    const selectDifficulty = (diff: Difficulty) => {
      audio.playClick();
      this.difficulty = diff;
      btnEasy?.classList.remove('active');
      btnMedium?.classList.remove('active');
      btnHard?.classList.remove('active');

      if (diff === 'easy') btnEasy?.classList.add('active');
      else if (diff === 'medium') btnMedium?.classList.add('active');
      else if (diff === 'hard') btnHard?.classList.add('active');
    };

    btnEasy?.addEventListener('click', () => selectDifficulty('easy'));
    btnMedium?.addEventListener('click', () => selectDifficulty('medium'));
    btnHard?.addEventListener('click', () => selectDifficulty('hard'));

    // Round selector slider
    const roundsSlider = document.getElementById('rounds-slider') as HTMLInputElement;
    const roundsSliderTitle = document.getElementById('rounds-slider-title');
    
    if (roundsSlider) {
      this.maxRounds = parseInt(roundsSlider.value, 10);
      
      const updateRoundsDisplay = () => {
        const val = roundsSlider.value;
        if (roundsSliderTitle) {
          const num = parseInt(val, 10);
          let suffix = 'kôl';
          if (num === 1) suffix = 'kolo';
          else if (num >= 2 && num <= 4) suffix = 'kolá';
          roundsSliderTitle.innerText = `Vybrané: ${num} ${suffix}`;
        }
      };

      roundsSlider.addEventListener('input', () => {
        updateRoundsDisplay();
        this.maxRounds = parseInt(roundsSlider.value, 10);
      });

      roundsSlider.addEventListener('change', () => {
        audio.playClick();
      });
      
      updateRoundsDisplay();
    }



    // Time Limit Inputs
    const limitMediumInput = document.getElementById('limit-medium-input') as HTMLInputElement;
    const limitHardInput = document.getElementById('limit-hard-input') as HTMLInputElement;

    limitMediumInput?.addEventListener('change', () => {
      let val = parseInt(limitMediumInput.value, 10);
      if (isNaN(val) || val < 1) val = 7;
      this.timeLimitMedium = val;
      limitMediumInput.value = val.toString();
    });

    limitHardInput?.addEventListener('change', () => {
      let val = parseInt(limitHardInput.value, 10);
      if (isNaN(val) || val < 1) val = 4;
      this.timeLimitHard = val;
      limitHardInput.value = val.toString();
    });

    // Start Game Button
    const btnStart = document.getElementById('btn-start-game');
    btnStart?.addEventListener('click', () => {
      audio.playClick();
      this.startGame();
    });

    // Exit Game Buttons (during gameplay)
    document.getElementById('btn-solo-exit')?.addEventListener('click', () => {
      audio.playClick();
      this.endGameGracefully();
    });

    const exitVersusGame = () => {
      audio.playClick();
      this.endGameGracefully();
    };
    document.getElementById('btn-versus-exit')?.addEventListener('click', exitVersusGame);
    document.getElementById('btn-versus-exit-p2')?.addEventListener('click', exitVersusGame);

    // Stats screen buttons
    document.getElementById('btn-stats-restart')?.addEventListener('click', () => {
      audio.playClick();
      this.startGame();
    });

    document.getElementById('btn-stats-share')?.addEventListener('click', () => {
      audio.playClick();
      this.shareGameStats();
    });

    document.getElementById('btn-stats-exit')?.addEventListener('click', () => {
      audio.playClick();
      this.deactivate();
      this.activate(); // return to setup screen
    });
  }



  private startGame() {
    this.inGamePlay = true;
    this.currentRound = 1;

    // Sync setup dice count with current app settings
    const savedDice = parseInt(localStorage.getItem('dice_app_dice_count') || '1', 10);
    this.diceCount = savedDice;

    // Sync and save player names for versus mode
    let p1Name = 'Guest';
    let p2Name = 'Player 2';
    if (this.mode === 'versus') {
      const p1Input = document.getElementById('setup-p1-name-input') as HTMLInputElement;
      const p2Input = document.getElementById('setup-p2-name-input') as HTMLInputElement;
      p1Name = p1Input?.value.trim() || 'Guest';
      p2Name = p2Input?.value.trim() || 'Player 2';
      localStorage.setItem('dice_app_versus_p2_name', p2Name);
    } else {
      p1Name = localStorage.getItem('dice_app_username') || 'Guest';
    }
    
    const p1Display = document.getElementById('p1-name');
    if (p1Display) p1Display.innerText = p1Name;
    const p2Display = document.getElementById('p2-name');
    if (p2Display) p2Display.innerText = p2Name;

    // Reset scores & statistics
    this.soloScore = 0;
    this.soloCorrectAnswers = 0;
    this.soloIncorrectAnswers = 0;
    this.soloStreak = 0;
    this.soloMaxStreak = 0;
    this.soloTotalReactionTime = 0;

    this.p1Score = 0;
    this.p2Score = 0;
    this.p1CorrectCount = 0;
    this.p2CorrectCount = 0;
    this.p1TotalReactionTime = 0;
    this.p2TotalReactionTime = 0;

    // Apply configure limits
    const limitMediumInput = document.getElementById('limit-medium-input') as HTMLInputElement;
    const limitHardInput = document.getElementById('limit-hard-input') as HTMLInputElement;
    if (limitMediumInput) this.timeLimitMedium = parseInt(limitMediumInput.value, 10) || 7;
    if (limitHardInput) this.timeLimitHard = parseInt(limitHardInput.value, 10) || 4;

    // Setup active dice count in physics and graphics engines
    physics.setDiceCount(this.diceCount);
    graphics.setDiceCount(this.diceCount, graphics.currentThemeKey);

    // Apply Fullscreen API
    this.requestFullscreen();

    // Hide normal bars/banners
    this.appContainer?.classList.add('in-game');

    // Toggle Solo/Versus layouts
    const soloLayout = document.getElementById('solo-play-layout');
    const versusLayout = document.getElementById('versus-play-layout');

    if (this.mode === 'solo') {
      soloLayout?.classList.remove('hidden');
      versusLayout?.classList.add('hidden');
    } else {
      soloLayout?.classList.add('hidden');
      versusLayout?.classList.remove('hidden');
    }

    this.showScreen('play');
    this.startRound();
  }

  private startRound() {
    this.optionsRevealed = false;
    this.isRolling = true;
    this.p1Answered = false;
    this.p2Answered = false;
    this.p1AnswerChoice = null;
    this.p2AnswerChoice = null;

    // Restore HUD to top and make tray opaque
    this.setHudOnFloor(false);
    graphics.setTrayOpacity(1.0);

    // Hide options UI initially during rolling
    const soloOptions = document.getElementById('solo-options');
    const p1Options = document.getElementById('p1-options');
    const p2Options = document.getElementById('p2-options');
    if (soloOptions) soloOptions.innerHTML = '';
    if (p1Options) p1Options.innerHTML = '';
    if (p2Options) p2Options.innerHTML = '';

    // Update statuses for versus
    const p1Status = document.getElementById('p1-status');
    const p2Status = document.getElementById('p2-status');
    if (p1Status) {
      p1Status.innerText = 'Kocky sa kotúľajú...';
      p1Status.classList.remove('voted');
    }
    if (p2Status) {
      p2Status.innerText = 'Kocky sa kotúľajú...';
      p2Status.classList.remove('voted');
    }

    // Hide timer containers initially
    this.resetTimerBars();

    // Update HUD counters
    const soloRoundLabel = document.getElementById('solo-round');
    const soloScoreLabel = document.getElementById('solo-score');
    if (soloRoundLabel) {
      soloRoundLabel.innerText = this.maxRounds > 0 
        ? `Kolo: ${this.currentRound} / ${this.maxRounds}` 
        : `Kolo: ${this.currentRound}`;
    }
    if (soloScoreLabel) {
      soloScoreLabel.innerText = `Skóre: ${this.soloScore}`;
    }

    const p1ScoreLabel = document.getElementById('p1-score');
    const p2ScoreLabel = document.getElementById('p2-score');
    if (p1ScoreLabel) p1ScoreLabel.innerText = `Skóre: ${this.p1Score}`;
    if (p2ScoreLabel) p2ScoreLabel.innerText = `Skóre: ${this.p2Score}`;

    // Automatic rolling throw
    this.throwDicePhysics();
  }

  private throwDicePhysics() {
    audio.playClick();
    audio.playRollLoad();
    const scale = 0.4;
    const spacing = 2.0 * scale;

    physics.diceBodies.forEach((body, i) => {
      // Stack position or distribute
      const offsetX = ((i % 3) - 1) * spacing;
      const offsetZ = (Math.floor(i / 3) - 0.5) * spacing;

      body.position.set(
        offsetX + (Math.random() - 0.5) * 0.4 * scale,
        6.0 + (Math.random() - 0.5) * 0.5,
        offsetZ + (Math.random() - 0.5) * 0.4 * scale
      );

      const forceX = (Math.random() - 0.5) * 9;
      const forceY = -5 - Math.random() * 7;
      const forceZ = (Math.random() - 0.5) * 9;
      body.velocity.set(forceX, forceY, forceZ);

      const spinX = (Math.random() - 0.5) * 40;
      const spinY = (Math.random() - 0.5) * 40;
      const spinZ = (Math.random() - 0.5) * 40;
      body.angularVelocity.set(spinX, spinY, spinZ);
    });

    if (this.onRollCallback) {
      this.onRollCallback();
    }
  }

  // Intercepted from main app loop when dice sleeps
  public handleDiceSettled(faces: number[]) {
    if (!this.inGamePlay || !this.isRolling) return;
    this.isRolling = false;

    this.correctSum = faces.reduce((a, b) => a + b, 0);
    this.generateOptions();
    this.revealOptions();

    // Move HUD to floor and make tray semi-transparent
    this.setHudOnFloor(true);
    graphics.setTrayOpacity(0.35);
  }

  private generateOptions() {
    const match = (graphics.currentDiceType || 'd6').match(/^d(\d+)$/i);
    const maxFaceVal = match ? parseInt(match[1], 10) : 6;
    const minSum = this.diceCount;
    const maxSum = this.diceCount * maxFaceVal;
    const incorrects = new Set<number>();
    
    // Realistic close offsets
    const offsets = [-1, 1, -2, 2, -3, 3, -4, 4];
    // Randomize offsets
    offsets.sort(() => Math.random() - 0.5);

    for (const offset of offsets) {
      const val = this.correctSum + offset;
      if (val >= minSum && val <= maxSum && val !== this.correctSum) {
        incorrects.add(val);
        if (incorrects.size === 2) break;
      }
    }

    // Fallback logic
    while (incorrects.size < 2) {
      const randomVal = Math.floor(Math.random() * (maxSum - minSum + 1)) + minSum;
      if (randomVal !== this.correctSum) {
        incorrects.add(randomVal);
      }
    }

    this.currentOptions = [this.correctSum, ...Array.from(incorrects)];
    // Randomly shuffle options order
    this.currentOptions.sort(() => Math.random() - 0.5);
  }

  private revealOptions() {
    this.optionsRevealed = true;
    const showTime = Date.now();
    this.soloRoundStartTime = showTime;
    this.versusRoundStartTime = showTime;

    if (this.mode === 'solo') {
      const optionsContainer = document.getElementById('solo-options');
      if (optionsContainer) {
        optionsContainer.innerHTML = '';
        this.currentOptions.forEach(opt => {
          const btn = document.createElement('button');
          btn.className = 'option-btn';
          btn.innerText = opt.toString();
          btn.addEventListener('pointerdown', () => this.handleSoloAnswer(opt));
          optionsContainer.appendChild(btn);
        });
      }
    } else {
      // Versus: Render options for both players
      this.renderVersusOptions('p1', 'p1-options');
      this.renderVersusOptions('p2', 'p2-options');

      const p1Status = document.getElementById('p1-status');
      const p2Status = document.getElementById('p2-status');
      if (p1Status) p1Status.innerText = 'Vyber odpoveď!';
      if (p2Status) p2Status.innerText = 'Vyber odpoveď!';
    }

    // Start timer countdown if active difficulty
    if (this.difficulty !== 'easy') {
      this.startCountdown();
    }
  }

  private renderVersusOptions(player: 'p1' | 'p2', containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    // Copy options so they are presented in the same order
    this.currentOptions.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerText = opt.toString();
      btn.addEventListener('pointerdown', () => this.handleVersusAnswer(player, opt, btn));
      container.appendChild(btn);
    });
  }

  private startCountdown() {
    const duration = this.difficulty === 'medium' ? this.timeLimitMedium : this.timeLimitHard;
    const totalMs = duration * 1000;
    const tickInterval = 50; // ms
    let elapsedMs = 0;

    const barSolo = document.getElementById('solo-timer-bar');
    const barP1 = document.getElementById('p1-timer-bar');
    const barP2 = document.getElementById('p2-timer-bar');

    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = window.setInterval(() => {
      elapsedMs += tickInterval;
      const progress = Math.max(0, 1 - (elapsedMs / totalMs));
      
      const scaleX = `scaleX(${progress})`;
      if (this.mode === 'solo' && barSolo) {
        barSolo.style.transform = scaleX;
      } else {
        if (barP1) barP1.style.transform = scaleX;
        if (barP2) barP2.style.transform = scaleX;
      }

      if (elapsedMs >= totalMs) {
        clearInterval(this.timerInterval!);
        this.timerInterval = null;
        this.handleTimeExpired();
      }
    }, tickInterval);
  }

  private resetTimerBars() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    const barSolo = document.getElementById('solo-timer-bar');
    const barP1 = document.getElementById('p1-timer-bar');
    const barP2 = document.getElementById('p2-timer-bar');

    if (barSolo) barSolo.style.transform = 'scaleX(1)';
    if (barP1) barP1.style.transform = 'scaleX(1)';
    if (barP2) barP2.style.transform = 'scaleX(1)';
  }

  private endCurrentTimers() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.nextRoundTimeout) {
      clearTimeout(this.nextRoundTimeout);
      this.nextRoundTimeout = null;
    }
  }

  // Action on solo answer clicked
  private handleSoloAnswer(choice: number) {
    if (!this.optionsRevealed) return;
    this.optionsRevealed = false;
    this.endCurrentTimers();

    const reactionTime = Date.now() - this.soloRoundStartTime;

    const isCorrect = choice === this.correctSum;
    
    // Highlight choice
    const buttons = document.querySelectorAll('#solo-options .option-btn') as NodeListOf<HTMLButtonElement>;
    buttons.forEach(b => {
      b.disabled = true;
      const val = parseInt(b.innerText, 10);
      if (val === this.correctSum) {
        b.classList.add('correct');
      } else if (val === choice && !isCorrect) {
        b.classList.add('incorrect');
      }
    });

    if (isCorrect) {
      audio.playSuccess();
      this.soloScore++;
      this.soloCorrectAnswers++;
      this.soloStreak++;
      if (this.soloStreak > this.soloMaxStreak) this.soloMaxStreak = this.soloStreak;
      this.soloTotalReactionTime += reactionTime;
    } else {
      audio.playFailure();
      this.soloIncorrectAnswers++;
      this.soloStreak = 0;
    }

    this.scheduleNextRound();
  }

  // Action on versus player answer clicked
  private handleVersusAnswer(player: 'p1' | 'p2', choice: number, btn: HTMLElement) {
    if (!this.optionsRevealed) return;

    if (player === 'p1' && !this.p1Answered) {
      this.p1Answered = true;
      this.p1AnswerChoice = choice;
      this.p1AnswerTime = Date.now() - this.versusRoundStartTime;

      const p1Status = document.getElementById('p1-status');
      if (p1Status) {
        p1Status.innerText = 'Hlasované!';
        p1Status.classList.add('voted');
      }

      // Disable P1 buttons visually
      const buttons = document.querySelectorAll('#p1-options .option-btn') as NodeListOf<HTMLButtonElement>;
      buttons.forEach(b => b.disabled = true);
      btn.style.opacity = '1';
      btn.style.borderColor = 'var(--secondary-color)';
    } else if (player === 'p2' && !this.p2Answered) {
      this.p2Answered = true;
      this.p2AnswerChoice = choice;
      this.p2AnswerTime = Date.now() - this.versusRoundStartTime;

      const p2Status = document.getElementById('p2-status');
      if (p2Status) {
        p2Status.innerText = 'Hlasované!';
        p2Status.classList.add('voted');
      }

      // Disable P2 buttons visually
      const buttons = document.querySelectorAll('#p2-options .option-btn') as NodeListOf<HTMLButtonElement>;
      buttons.forEach(b => b.disabled = true);
      btn.style.opacity = '1';
      btn.style.borderColor = 'var(--secondary-color)';
    }

    // Both players have voted
    if (this.p1Answered && this.p2Answered) {
      this.optionsRevealed = false;
      this.endCurrentTimers();
      this.revealVersusResults();
    }
  }

  private revealVersusResults() {
    const p1IsCorrect = this.p1AnswerChoice === this.correctSum;
    const p2IsCorrect = this.p2AnswerChoice === this.correctSum;

    // Award points
    if (p1IsCorrect) {
      this.p1Score++;
      this.p1CorrectCount++;
      this.p1TotalReactionTime += this.p1AnswerTime;
    }
    if (p2IsCorrect) {
      this.p2Score++;
      this.p2CorrectCount++;
      this.p2TotalReactionTime += this.p2AnswerTime;
    }

    // Play sounds
    if (p1IsCorrect || p2IsCorrect) {
      audio.playSuccess();
    } else {
      audio.playFailure();
    }

    // Highlight options visually for both players
    this.highlightVersusButtons('p1', this.p1AnswerChoice);
    this.highlightVersusButtons('p2', this.p2AnswerChoice);

    this.scheduleNextRound();
  }

  private highlightVersusButtons(player: 'p1' | 'p2', choice: number | null) {
    const buttons = document.querySelectorAll(`#${player}-options .option-btn`) as NodeListOf<HTMLButtonElement>;
    buttons.forEach(b => {
      b.disabled = true;
      const val = parseInt(b.innerText, 10);
      if (val === this.correctSum) {
        b.classList.add('correct');
      } else if (choice !== null && val === choice && choice !== this.correctSum) {
        b.classList.add('incorrect');
      }
    });

    const status = document.getElementById(`${player}-status`);
    if (status) {
      if (choice === this.correctSum) {
        status.innerText = 'Správne! (+1 b)';
        status.style.color = '#2ecc71';
      } else if (choice === null) {
        status.innerText = 'Čas vypršal!';
        status.style.color = '#e74c3c';
      } else {
        status.innerText = 'Nesprávne!';
        status.style.color = '#e74c3c';
      }
    }
  }

  // Handle countdown timeout
  private handleTimeExpired() {
    this.optionsRevealed = false;

    if (this.mode === 'solo') {
      // Disable buttons and show correct answer
      const buttons = document.querySelectorAll('#solo-options .option-btn') as NodeListOf<HTMLButtonElement>;
      buttons.forEach(b => {
        b.disabled = true;
        const val = parseInt(b.innerText, 10);
        if (val === this.correctSum) b.classList.add('correct');
      });

      audio.playFailure();
      this.soloIncorrectAnswers++;
      this.soloStreak = 0;
    } else {
      // Versus timeout: reveal choices that were made, highlight correct answers
      const p1IsCorrect = this.p1AnswerChoice === this.correctSum;
      const p2IsCorrect = this.p2AnswerChoice === this.correctSum;

      if (this.p1Answered && p1IsCorrect) { this.p1Score++; this.p1CorrectCount++; this.p1TotalReactionTime += this.p1AnswerTime; }
      if (this.p2Answered && p2IsCorrect) { this.p2Score++; this.p2CorrectCount++; this.p2TotalReactionTime += this.p2AnswerTime; }

      if ((this.p1Answered && p1IsCorrect) || (this.p2Answered && p2IsCorrect)) {
        audio.playSuccess();
      } else {
        audio.playFailure();
      }

      this.highlightVersusButtons('p1', this.p1AnswerChoice);
      this.highlightVersusButtons('p2', this.p2AnswerChoice);
    }

    this.scheduleNextRound();
  }

  private scheduleNextRound() {
    this.nextRoundTimeout = window.setTimeout(() => {
      this.nextRoundTimeout = null;

      // Check if game is completed
      if (this.maxRounds > 0 && this.currentRound >= this.maxRounds) {
        this.endGameAndShowStats();
      } else {
        this.currentRound++;
        this.startRound();
      }
    }, 2000);
  }

  private endGameAndShowStats() {
    this.inGamePlay = false;
    this.endCurrentTimers();
    this.exitFullscreen();
    this.appContainer?.classList.remove('in-game');

    // Reset HUD and tray states
    graphics.setTrayOpacity(1.0);
    this.setHudOnFloor(false);

    // Hide normal views, show stats
    this.showScreen('stats');

    const winnerAnnouncement = document.getElementById('stats-winner-announcement');
    const soloStatsBox = document.getElementById('solo-stats-container');
    const versusStatsBox = document.getElementById('versus-stats-container');

    if (this.mode === 'solo') {
      if (winnerAnnouncement) winnerAnnouncement.innerText = '';
      soloStatsBox?.classList.remove('hidden');
      versusStatsBox?.classList.add('hidden');

      // Populate Solo stats
      const correctText = document.getElementById('stat-correct');
      const incorrectText = document.getElementById('stat-incorrect');
      const roundsText = document.getElementById('stat-rounds');
      const pctText = document.getElementById('stat-percentage');
      const streakText = document.getElementById('stat-streak');
      const reactionText = document.getElementById('stat-reaction');

      const totalRounds = this.soloCorrectAnswers + this.soloIncorrectAnswers;
      const successPct = totalRounds > 0 ? Math.round((this.soloCorrectAnswers / totalRounds) * 100) : 0;
      const avgReaction = this.soloCorrectAnswers > 0 
        ? ((this.soloTotalReactionTime / this.soloCorrectAnswers) / 1000).toFixed(2)
        : '0.00';

      if (roundsText) roundsText.innerText = totalRounds.toString();
      if (correctText) correctText.innerText = this.soloCorrectAnswers.toString();
      if (incorrectText) incorrectText.innerText = this.soloIncorrectAnswers.toString();
      if (pctText) pctText.innerText = `${successPct}%`;
      if (streakText) streakText.innerText = this.soloMaxStreak.toString();
      if (reactionText) reactionText.innerText = `${avgReaction}s`;
    } else {
      // Versus stats comparison
      soloStatsBox?.classList.add('hidden');
      versusStatsBox?.classList.remove('hidden');

      // Determine Winner and Update Labels
      const p1Name = localStorage.getItem('dice_app_username') || 'Guest';
      const p2Name = localStorage.getItem('dice_app_versus_p2_name') || 'Player 2';
      
      const vsP1Label = document.getElementById('vs-p1-label');
      const vsP2Label = document.getElementById('vs-p2-label');
      if (vsP1Label) vsP1Label.innerText = p1Name;
      if (vsP2Label) vsP2Label.innerText = p2Name;

      if (winnerAnnouncement) {
        if (this.p1Score > this.p2Score) {
          winnerAnnouncement.innerText = `🏆 ${p1Name} vyhráva!`;
          winnerAnnouncement.style.color = '#2ecc71';
        } else if (this.p2Score > this.p1Score) {
          winnerAnnouncement.innerText = `🏆 ${p2Name} vyhráva!`;
          winnerAnnouncement.style.color = '#2ecc71';
        } else {
          winnerAnnouncement.innerText = '🤝 Remíza!';
          winnerAnnouncement.style.color = '#ffb703';
        }
      }

      // Populate Versus table cells
      const vP1Score = document.getElementById('stat-vs-p1-score');
      const vP1Correct = document.getElementById('stat-vs-p1-correct');
      const vP1Reaction = document.getElementById('stat-vs-p1-reaction');

      const vP2Score = document.getElementById('stat-vs-vs-p2-score') || document.getElementById('stat-vs-p2-score');
      const vP2Correct = document.getElementById('stat-vs-vs-p2-correct') || document.getElementById('stat-vs-p2-correct');
      const vP2Reaction = document.getElementById('stat-vs-vs-p2-reaction') || document.getElementById('stat-vs-p2-reaction');

      const avgReactionP1 = this.p1CorrectCount > 0 
        ? ((this.p1TotalReactionTime / this.p1CorrectCount) / 1000).toFixed(2)
        : '0.00';
      const avgReactionP2 = this.p2CorrectCount > 0 
        ? ((this.p2TotalReactionTime / this.p2CorrectCount) / 1000).toFixed(2)
        : '0.00';

      if (vP1Score) vP1Score.innerText = this.p1Score.toString();
      if (vP1Correct) vP1Correct.innerText = this.p1CorrectCount.toString();
      if (vP1Reaction) vP1Reaction.innerText = `${avgReactionP1}s`;

      if (vP2Score) vP2Score.innerText = this.p2Score.toString();
      if (vP2Correct) vP2Correct.innerText = this.p2CorrectCount.toString();
      if (vP2Reaction) vP2Reaction.innerText = `${avgReactionP2}s`;
    }
  }

  private endGameGracefully() {
    this.inGamePlay = false;
    this.endCurrentTimers();
    this.exitFullscreen();
    this.appContainer?.classList.remove('in-game');
    this.showScreen('setup');

    // Reset physics positions
    physics.resetToCenter();

    // Reset HUD and tray states
    graphics.setTrayOpacity(1.0);
    this.setHudOnFloor(false);
  }

  // Full Screen API Helpers
  private requestFullscreen() {
    const docEl = document.documentElement as any;
    if (docEl.requestFullscreen) {
      docEl.requestFullscreen().catch((err: any) => console.log('Fullscreen error:', err));
    } else if (docEl.webkitRequestFullscreen) {
      docEl.webkitRequestFullscreen();
    } else if (docEl.msRequestFullscreen) {
      docEl.msRequestFullscreen();
    }
  }

  private exitFullscreen() {
    const doc = document as any;
    if (document.fullscreenElement) {
      if (doc.exitFullscreen) {
        doc.exitFullscreen().catch((err: any) => console.log('Exit fullscreen error:', err));
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      } else if (doc.msExitFullscreen) {
        doc.msExitFullscreen();
      }
    }
  }

  private shareGameStats() {
    const shareUrl = window.location.origin + window.location.pathname;
    let shareText = '';

    if (this.mode === 'solo') {
      const totalRounds = this.soloCorrectAnswers + this.soloIncorrectAnswers;
      const successPct = totalRounds > 0 ? Math.round((this.soloCorrectAnswers / totalRounds) * 100) : 0;
      const avgReaction = this.soloCorrectAnswers > 0 
        ? ((this.soloTotalReactionTime / this.soloCorrectAnswers) / 1000).toFixed(2)
        : '0.00';
      
      shareText = `Práve som dosiahol skóre ${this.soloScore} bodov v Solo hernom móde na 3D Dice! 🎲\nPresnosť: ${successPct}%\nPriemerný čas: ${avgReaction}s`;
    } else {
      const p1Name = localStorage.getItem('dice_app_username') || 'Guest';
      const p2Name = localStorage.getItem('dice_app_versus_p2_name') || 'Player 2';
      let winnerText = 'Remíza';
      if (this.p1Score > this.p2Score) {
        winnerText = `Víťaz: ${p1Name}`;
      } else if (this.p2Score > this.p1Score) {
        winnerText = `Víťaz: ${p2Name}`;
      }
      
      shareText = `Zápas ${p1Name} vs ${p2Name} na 3D Dice skončil! 🎲\nSkóre: ${this.p1Score} : ${this.p2Score}\n${winnerText}`;
    }

    const fullMessage = `${shareText}\nHraj tu: ${shareUrl}`;

    if (navigator.share) {
      navigator.share({
        title: '3D Dice - Herné Výsledky',
        text: shareText,
        url: shareUrl
      }).catch(err => {
        console.log('Error sharing:', err);
      });
    } else {
      // Fallback: Copy to clipboard and show toast
      navigator.clipboard.writeText(fullMessage).then(() => {
        this.showShareNotification();
      }).catch(err => {
        console.error('Could not copy link: ', err);
        alert(fullMessage);
      });
    }
  }

  private showShareNotification() {
    // Create temporary beautiful glass toast
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.top = '100px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%) translateY(-20px)';
    toast.style.background = 'linear-gradient(135deg, rgba(26, 188, 156, 0.95) 0%, rgba(22, 160, 133, 0.95) 100%)';
    toast.style.color = '#fff';
    toast.style.padding = '16px 32px';
    toast.style.borderRadius = '30px';
    toast.style.fontWeight = '700';
    toast.style.fontSize = '1rem';
    toast.style.boxShadow = '0 10px 25px rgba(22, 160, 133, 0.3)';
    toast.style.zIndex = '1000';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.style.opacity = '0';
    toast.style.transition = 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    toast.innerHTML = `<i class="fa-solid fa-check"></i> <span>Výsledky skopírované do schránky!</span>`;

    document.body.appendChild(toast);

    // Fade in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    // Fade out and remove
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-20px)';
      setTimeout(() => {
        toast.remove();
      }, 500);
    }, 3000);
  }

  private setHudOnFloor(onFloor: boolean) {
    const huds = document.querySelectorAll('.game-hud, .timer-container, .versus-divider-line');
    huds.forEach(el => {
      if (onFloor) {
        el.classList.add('on-floor');
      } else {
        el.classList.remove('on-floor');
      }
    });
  }
}

export const gamemode = new GameMode();
