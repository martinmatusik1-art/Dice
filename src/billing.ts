/* -------------------------------------------------------------
   Google Play Billing - Mock Platobný Systém
   ------------------------------------------------------------- */

import { ads } from './ads';
import { audio } from './audio';

class BillingManager {
  private modal: HTMLElement | null = null;
  private confirmBtn: HTMLButtonElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;
  private closeBtn: HTMLButtonElement | null = null;
  private buyPremiumBtn: HTMLButtonElement | null = null;
  private sidebarBuyBtn: HTMLButtonElement | null = null;

  public init() {
    this.modal = document.getElementById('billing-modal');
    this.confirmBtn = document.getElementById('billing-confirm-btn') as HTMLButtonElement;
    this.cancelBtn = document.getElementById('billing-cancel-btn') as HTMLButtonElement;
    this.closeBtn = document.getElementById('billing-close-btn') as HTMLButtonElement;
    this.buyPremiumBtn = document.getElementById('premium-badge-btn') as HTMLButtonElement;
    this.sidebarBuyBtn = document.getElementById('sidebar-buy-premium') as HTMLButtonElement;

    this.setupListeners();
  }

  private setupListeners() {
    // Open Billing Dialog
    const openModal = () => {
      audio.playClick();
      if (ads.getIsPremium()) {
        alert("You have already purchased the Premium version! All features are unlocked.");
        return;
      }
      this.modal?.classList.remove('hidden');
    };

    this.buyPremiumBtn?.addEventListener('click', openModal);
    this.sidebarBuyBtn?.addEventListener('click', openModal);

    // Close Billing Dialog
    const closeModal = () => {
      audio.playClick();
      this.modal?.classList.add('hidden');
    };
    this.cancelBtn?.addEventListener('click', closeModal);
    this.closeBtn?.addEventListener('click', closeModal);

    // Zatvorenie kliknutím na tmavé pozadie modálneho okna
    this.modal?.addEventListener('pointerdown', (e) => {
      if (e.target === this.modal) closeModal();
    });

    // Confirm Mock Purchase
    this.confirmBtn?.addEventListener('click', () => {
      this.processPurchase();
    });
  }

  private processPurchase() {
    if (!this.confirmBtn) return;

    // Disable button to prevent double click, show loading state
    this.confirmBtn.disabled = true;
    const originalText = this.confirmBtn.innerText;
    this.confirmBtn.innerText = "Processing payment...";

    // Simulating Google Play Billing interaction (1.5 seconds)
    setTimeout(() => {
      // 1. Mark Premium in AdManager
      ads.enablePremium();

      // 2. Play beautiful successful arpeggio fanfare
      audio.playSuccess();

      // 3. Reset button state & hide modal
      if (this.confirmBtn) {
        this.confirmBtn.disabled = false;
        this.confirmBtn.innerText = originalText;
      }
      this.modal?.classList.add('hidden');

      // 4. Show success message
      this.showPremiumNotification();

      // 5. Hide sidebar Buy Premium button
      if (this.sidebarBuyBtn) {
        this.sidebarBuyBtn.style.display = 'none';
      }
    }, 15000 / 10); // 1.5 seconds
  }

  private showPremiumNotification() {
    // Create temporary beautiful glass toast
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.top = '100px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%) translateY(-20px)';
    toast.style.background = 'linear-gradient(135deg, rgba(255, 183, 3, 0.9) 0%, rgba(251, 133, 0, 0.9) 100%)';
    toast.style.color = '#512e09';
    toast.style.padding = '16px 32px';
    toast.style.borderRadius = '30px';
    toast.style.fontWeight = '700';
    toast.style.fontSize = '1rem';
    toast.style.boxShadow = '0 10px 25px rgba(251, 133, 0, 0.4)';
    toast.style.zIndex = '1000';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.style.opacity = '0';
    toast.style.transition = 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    toast.innerHTML = `<i class="fa-solid fa-crown"></i> <span>Premium version activated! Thank you!</span>`;

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
    }, 4000);
  }
}

export const billing = new BillingManager();
