/**
 * ============================================================================
 * StudyTrack Pro - Core Application Module
 * Clean, Human-written Modular JavaScript Architecture
 * ============================================================================
 */

class StudyTrackApp {
  constructor() {
    // --- Application State ---
    this.state = {
      userName: '',
      streakDays: 1,
      lastActiveDate: '',
      items: [],
      currentPage: 'dashboard',
      filterType: 'All',
      searchQuery: '',
      expandedItemId: null,

      // Flashcard Review Session
      review: {
        queue: [],
        currentIndex: 0,
        isFlipped: false,
        completedCount: 0,
      },

      // Focus Pomodoro Timer
      timer: {
        mode: 'work', // 'work', 'shortBreak', 'longBreak'
        totalSeconds: 25 * 60,
        remainingSeconds: 25 * 60,
        isRunning: false,
        intervalId: null,
        completedSessions: 0,
      },

      // Form State for Adding Item
      addType: 'Flashcard',
    };

    // Item Types Definition
    this.TYPES = {
      Flashcard:    { label: 'Flashcard',     badge: 'badge-flash', icon: '🃏' },
      Topic:        { label: 'Topic Note',    badge: 'badge-topic', icon: '📖' },
      Slide:        { label: 'Slide Deck',    badge: 'badge-slide', icon: '🖼️' },
      PracticeTask: { label: 'Practice Task', badge: 'badge-task',  icon: '✏️' },
    };

    // Audio Context for Chimes (Web Audio API - dependency-free)
    this.audioCtx = null;
  }

  /* ==========================================================================
     1. INITIALIZATION & LIFECYCLE
     ========================================================================== */
  init() {
    this.loadStateFromStorage();
    this.checkStreak();
    this.setupEventListeners();

    if (!this.state.userName) {
      this.openModal('onboard-modal');
    } else {
      this.updateSidebarUser();
      this.renderCurrentPage();
    }
  }

  loadStateFromStorage() {
    try {
      const saved = localStorage.getItem('studytrack_pro_db');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.state.userName = parsed.userName || '';
        this.state.streakDays = parsed.streakDays || 1;
        this.state.lastActiveDate = parsed.lastActiveDate || '';
        this.state.items = parsed.items || [];
      }
    } catch (err) {
      console.error('Failed to load state from LocalStorage:', err);
    }
  }

  saveStateToStorage() {
    const dataToSave = {
      userName: this.state.userName,
      streakDays: this.state.streakDays,
      lastActiveDate: this.state.lastActiveDate,
      items: this.state.items,
    };
    localStorage.setItem('studytrack_pro_db', JSON.stringify(dataToSave));
    this.updateBadges();
  }

  checkStreak() {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (!this.state.lastActiveDate) {
      this.state.lastActiveDate = todayStr;
      this.state.streakDays = 1;
      return;
    }

    const last = new Date(this.state.lastActiveDate);
    const today = new Date(todayStr);
    const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      this.state.streakDays += 1;
      this.state.lastActiveDate = todayStr;
    } else if (diffDays > 1) {
      this.state.streakDays = 1;
      this.state.lastActiveDate = todayStr;
    }
    this.saveStateToStorage();
  }

  setupEventListeners() {
    // Keyboard navigation shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (this.state.currentPage === 'review' && this.state.review.queue.length > 0) {
        if (e.code === 'Space') {
          e.preventDefault();
          this.toggleCardFlip();
        } else if (['1', '2', '3', '4', '5'].includes(e.key) && this.state.review.isFlipped) {
          this.submitReviewScore(parseInt(e.key, 10));
        }
      }
    });

    // Enter key for onboarding modal
    const onboardInput = document.getElementById('onboard-user-name');
    if (onboardInput) {
      onboardInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.completeOnboarding();
      });
    }
  }

  /* ==========================================================================
     2. SPACED REPETITION ENGINE (SM-2 Inspired)
     ========================================================================== */
  calculateNextReviewInterval(score, reviewCount = 0) {
    // Spaced intervals: Score 1 -> 1d, Score 2 -> 2d, Score 3 -> 3d, Score 4 -> 5d, Score 5 -> 7d * count factor
    const baseIntervals = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 7 };
    let days = baseIntervals[score] || 1;
    if (score >= 4 && reviewCount > 1) {
      days = Math.round(days * (1 + reviewCount * 0.25));
    }
    return days;
  }

  generateNextReviewDateString(daysFromNow) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString().slice(0, 10);
  }

  isItemDueToday(nextReviewDate) {
    if (!nextReviewDate) return true;
    const todayStr = new Date().toISOString().slice(0, 10);
    return nextReviewDate <= todayStr;
  }

  /* ==========================================================================
     3. NAVIGATION & ROUTING SYSTEM
     ========================================================================== */
  navigate(page) {
    this.state.currentPage = page;
    this.state.expandedItemId = null;

    // Sidebar active highlighting
    document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
    const targetNav = document.getElementById(`nav-${page}`);
    if (targetNav) targetNav.classList.add('active');

    // Close mobile sidebar
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) sidebar.classList.remove('open');

    // Initialize Review Queue on fresh visit
    if (page === 'review') {
      this.initReviewQueue();
    }

    this.renderCurrentPage();
  }

  toggleSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) sidebar.classList.toggle('open');
  }

  updateSidebarUser() {
    const avatarEl = document.getElementById('sb-avatar');
    const nameEl = document.getElementById('sb-name');
    const streakEl = document.getElementById('sb-streak');

    const name = this.state.userName || 'Student';
    const initials = name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

    if (avatarEl) avatarEl.textContent = initials || '?';
    if (nameEl) nameEl.textContent = name;
    if (streakEl) streakEl.textContent = `🔥 ${this.state.streakDays} Day Streak`;

    this.updateBadges();
  }

  updateBadges() {
    const reviewBadge = document.getElementById('review-badge');
    const dueBadge = document.getElementById('due-count-badge');

    const dueItems = this.state.items.filter((i) => this.isItemDueToday(i.nextReviewDate));

    if (reviewBadge) {
      if (this.state.items.length > 0) {
        reviewBadge.style.display = 'inline-block';
        reviewBadge.textContent = this.state.items.length;
      } else {
        reviewBadge.style.display = 'none';
      }
    }

    if (dueBadge) {
      if (dueItems.length > 0) {
        dueBadge.style.display = 'inline-block';
        dueBadge.textContent = dueItems.length;
      } else {
        dueBadge.style.display = 'none';
      }
    }
  }

  /* ==========================================================================
     4. PAGE RENDER ROUTER & VIEWS
     ========================================================================== */
  renderCurrentPage() {
    const container = document.getElementById('main-app');
    if (!container) return;

    container.className = 'main-content page-animate';
    container.innerHTML = '';

    switch (this.state.currentPage) {
      case 'dashboard':
        this.renderDashboard(container);
        break;
      case 'items':
        this.renderItemsList(container);
        break;
      case 'due':
        this.renderDueTodayList(container);
        break;
      case 'review':
        this.renderReviewSession(container);
        break;
      case 'focus':
        this.renderFocusTimer(container);
        break;
      case 'analytics':
        this.renderAnalytics(container);
        break;
      case 'add':
        this.renderAddItemForm(container);
        break;
      default:
        this.renderDashboard(container);
    }
  }

  /* --------------------------------------------------------------------------
     DASHBOARD VIEW
     -------------------------------------------------------------------------- */
  renderDashboard(container) {
    const totalCount = this.state.items.length;
    const dueCount = this.state.items.filter((i) => this.isItemDueToday(i.nextReviewDate)).length;
    const reviewedCount = this.state.items.filter((i) => i.reviewCount > 0).length;
    
    const avgScore = totalCount > 0
      ? (this.state.items.reduce((acc, i) => acc + (i.reviewScore || 0), 0) / totalCount).toFixed(1)
      : '0.0';

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <img src="logo.svg" alt="Logo" class="title-logo-icon" />
            <span>Welcome back, ${this.escapeHtml(this.state.userName)} 👋</span>
          </h1>
          <p class="page-subtitle">Track your study retention & daily spaced repetition goals.</p>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-primary" onclick="app.navigate('review')">
            <span>↺</span> Start Review Session
          </button>
          <button class="btn btn-secondary" onclick="app.navigate('add')">
            <span>➕</span> Add Item
          </button>
        </div>
      </div>

      <!-- Stats Grid Cards -->
      <div class="stats-grid">
        <div class="stat-card" style="--stat-accent: var(--accent-blue);">
          <div class="stat-header">
            <span class="stat-label">Total Items</span>
            <span>📚</span>
          </div>
          <div class="stat-value">${totalCount}</div>
          <div class="stat-hint">${reviewedCount} reviewed so far</div>
        </div>

        <div class="stat-card" style="--stat-accent: var(--accent-red);">
          <div class="stat-header">
            <span class="stat-label">Due For Review</span>
            <span>⏰</span>
          </div>
          <div class="stat-value" style="color:var(--accent-red);">${dueCount}</div>
          <div class="stat-hint">Items scheduled for today</div>
        </div>

        <div class="stat-card" style="--stat-accent: var(--accent-amber);">
          <div class="stat-header">
            <span class="stat-label">Avg Recall Score</span>
            <span>⭐</span>
          </div>
          <div class="stat-value" style="color:var(--accent-amber);">${avgScore}</div>
          <div class="stat-hint">Scale of 1 to 5</div>
        </div>

        <div class="stat-card" style="--stat-accent: var(--accent-purple);">
          <div class="stat-header">
            <span class="stat-label">Study Streak</span>
            <span>🔥</span>
          </div>
          <div class="stat-value" style="color:var(--accent-purple);">${this.state.streakDays}d</div>
          <div class="stat-hint">Keep learning daily!</div>
        </div>
      </div>

      <!-- Recent Items Panel -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <span>📌</span> Recently Added Items
          </div>
          <button class="btn btn-ghost btn-sm" onclick="app.navigate('items')">View All →</button>
        </div>
        <div class="panel-body" id="dashboard-recent-list"></div>
      </div>
    `;

    const recentContainer = document.getElementById('dashboard-recent-list');
    const recentItems = [...this.state.items].slice(-4).reverse();

    if (recentItems.length === 0) {
      recentContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-title">No Study Items Found</div>
          <div class="empty-state-text">Start by adding your first flashcard, topic note, or lecture slide.</div>
          <button class="btn btn-primary" onclick="app.navigate('add')">➕ Create Item</button>
        </div>
      `;
    } else {
      recentItems.forEach((item) => {
        recentContainer.appendChild(this.buildItemCardNode(item));
      });
    }
  }

  /* --------------------------------------------------------------------------
     ITEMS LIST VIEW WITH SEARCH & FILTERS
     -------------------------------------------------------------------------- */
  renderItemsList(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <img src="logo.svg" alt="Logo" class="title-logo-icon" />
            <span>My Study Library</span>
          </h1>
          <p class="page-subtitle">Manage, edit, and organize all your study cards and notes.</p>
        </div>
        <button class="btn btn-primary" onclick="app.navigate('add')">➕ Add New Item</button>
      </div>

      <!-- Search & Filter Controls -->
      <div class="search-filter-bar">
        <div class="search-input-wrapper">
          <span class="search-icon">🔍</span>
          <input 
            type="text" 
            placeholder="Search topics, subjects, or questions..." 
            value="${this.escapeHtml(this.state.searchQuery)}" 
            oninput="app.handleSearchInput(event)"
          />
        </div>

        <div class="filter-row">
          ${['All', ...Object.keys(this.TYPES)].map((typeKey) => {
            const label = typeKey === 'All' ? 'All Items' : this.TYPES[typeKey].label;
            const activeClass = this.state.filterType === typeKey ? 'active' : '';
            return `<div class="filter-pill ${activeClass}" onclick="app.setFilterType('${typeKey}')">${label}</div>`;
          }).join('')}
        </div>
      </div>

      <!-- Item List Container -->
      <div id="items-list-container"></div>
    `;

    this.renderFilteredItems();
  }

  renderFilteredItems() {
    const listContainer = document.getElementById('items-list-container');
    if (!listContainer) return;

    let filtered = this.state.items;

    // Type filter
    if (this.state.filterType !== 'All') {
      filtered = filtered.filter((i) => i.type === this.state.filterType);
    }

    // Search query filter
    if (this.state.searchQuery.trim()) {
      const q = this.state.searchQuery.toLowerCase().trim();
      filtered = filtered.filter((i) => {
        return (
          (i.topic && i.topic.toLowerCase().includes(q)) ||
          (i.subject && i.subject.toLowerCase().includes(q)) ||
          (i.question && i.question.toLowerCase().includes(q)) ||
          (i.notes && i.notes.toLowerCase().includes(q))
        );
      });
    }

    listContainer.innerHTML = '';

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔎</div>
          <div class="empty-state-title">No Matching Items</div>
          <div class="empty-state-text">Try adjusting your search terms or filter tags.</div>
        </div>
      `;
    } else {
      filtered.forEach((item) => {
        listContainer.appendChild(this.buildItemCardNode(item));
      });
    }
  }

  handleSearchInput(e) {
    this.state.searchQuery = e.target.value;
    this.renderFilteredItems();
  }

  setFilterType(typeKey) {
    this.state.filterType = typeKey;
    this.renderCurrentPage();
  }

  /* --------------------------------------------------------------------------
     DUE TODAY LIST VIEW
     -------------------------------------------------------------------------- */
  renderDueTodayList(container) {
    const dueItems = this.state.items.filter((i) => this.isItemDueToday(i.nextReviewDate));

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <img src="logo.svg" alt="Logo" class="title-logo-icon" />
            <span>Due For Review Today</span>
          </h1>
          <p class="page-subtitle">${dueItems.length} study items require spacing review today.</p>
        </div>
        ${dueItems.length > 0 ? `
          <button class="btn btn-primary" onclick="app.navigate('review')">
            <span>↺</span> Review Due Items Now
          </button>
        ` : ''}
      </div>

      <div id="due-items-container"></div>
    `;

    const dueContainer = document.getElementById('due-items-container');
    if (dueItems.length === 0) {
      dueContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎉</div>
          <div class="empty-state-title">All Caught Up!</div>
          <div class="empty-state-text">Great job! You have no study items due for review right now.</div>
          <button class="btn btn-secondary" onclick="app.navigate('items')">Browse All Items</button>
        </div>
      `;
    } else {
      dueItems.forEach((item) => {
        dueContainer.appendChild(this.buildItemCardNode(item));
      });
    }
  }

  /* --------------------------------------------------------------------------
     ITEM CARD BUILDER NODE
     -------------------------------------------------------------------------- */
  buildItemCardNode(item) {
    const cfg = this.TYPES[item.type] || this.TYPES.Flashcard;
    const isExpanded = this.state.expandedItemId === item.id;
    const isDue = this.isItemDueToday(item.nextReviewDate);

    const starsHtml = item.reviewScore
      ? '★'.repeat(item.reviewScore) + '☆'.repeat(5 - item.reviewScore)
      : 'Unrated';

    // Build detail fields based on item type
    let detailFieldsHtml = '';
    if (item.type === 'Flashcard') {
      detailFieldsHtml = `
        <div class="detail-box">
          <div class="detail-label">Question</div>
          <div class="detail-value">${this.escapeHtml(item.question || '')}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Answer</div>
          <div class="detail-value">${this.escapeHtml(item.answer || '')}</div>
        </div>`;
    } else if (item.type === 'Topic') {
      detailFieldsHtml = `
        <div class="detail-box">
          <div class="detail-label">Chapter / Section</div>
          <div class="detail-value">${this.escapeHtml(item.chapter || '')}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Summary Notes</div>
          <div class="detail-value">${this.escapeHtml(item.notes || '')}</div>
        </div>`;
    } else if (item.type === 'Slide') {
      detailFieldsHtml = `
        <div class="detail-box">
          <div class="detail-label">Presentation File</div>
          <div class="detail-value">${this.escapeHtml(item.fileName || '')}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Slide Number</div>
          <div class="detail-value">Slide #${item.slideNumber || 1}</div>
        </div>`;
    } else {
      detailFieldsHtml = `
        <div class="detail-box">
          <div class="detail-label">Difficulty Level</div>
          <div class="detail-value">${this.escapeHtml(item.difficulty || 'Medium')}</div>
        </div>
        <div class="detail-box">
          <div class="detail-label">Target Deadline</div>
          <div class="detail-value">${this.escapeHtml(item.deadline || 'None')}</div>
        </div>`;
    }

    const cardNode = document.createElement('div');
    cardNode.className = `item-card ${isExpanded ? 'is-expanded' : ''}`;
    cardNode.id = `item-card-${item.id}`;

    cardNode.innerHTML = `
      <div class="item-card-header" onclick="app.toggleItemExpand(${item.id})">
        <span class="type-badge ${cfg.badge}">
          <span>${cfg.icon}</span> ${cfg.label}
        </span>
        
        <div class="item-main-info">
          <div class="item-topic-title">${this.escapeHtml(item.topic || 'Untitled')}</div>
          <div class="item-meta-sub">
            <span>${this.escapeHtml(item.subject || 'General')}</span>
            <span>•</span>
            <span>Reviewed ${item.reviewCount || 0}×</span>
          </div>
        </div>

        <div class="item-right-controls">
          <span class="score-stars">${starsHtml}</span>
          <span class="due-tag ${isDue ? 'due-now' : 'due-later'}">
            ${isDue ? 'Due Today' : `Next: ${item.nextReviewDate || 'TBD'}`}
          </span>
          <span class="chevron-icon">▼</span>
        </div>
      </div>

      <div class="item-card-body">
        <div class="detail-grid">
          ${detailFieldsHtml}
        </div>

        <div class="rating-action-bar">
          <div>
            <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px; font-weight:600;">
              Rate Recall (1 = Forgot, 5 = Perfect):
            </div>
            <div class="rating-buttons-group">
              ${[1, 2, 3, 4, 5].map((s) => `
                <button class="rating-btn" data-score="${s}" onclick="app.rateItemFromList(${item.id}, ${s}, event)">
                  ${s}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="action-btn-group">
            <button class="btn btn-danger btn-sm" onclick="app.deleteItem(${item.id}, event)">
              <span>🗑️</span> Delete
            </button>
          </div>
        </div>
      </div>
    `;

    return cardNode;
  }

  toggleItemExpand(id) {
    this.state.expandedItemId = this.state.expandedItemId === id ? null : id;
    this.renderCurrentPage();
  }

  rateItemFromList(id, score, e) {
    if (e) e.stopPropagation();
    const item = this.state.items.find((i) => i.id === id);
    if (!item) return;

    item.reviewScore = score;
    item.reviewCount = (item.reviewCount || 0) + 1;

    const days = this.calculateNextReviewInterval(score, item.reviewCount);
    item.nextReviewDate = this.generateNextReviewDateString(days);

    this.saveStateToStorage();
    this.showToast(`Scored ${score}/5 — Next review in ${days} day(s)`, 'success');
    
    if (score === 5) this.triggerConfetti();

    this.renderCurrentPage();
  }

  deleteItem(id, e) {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to delete this study item?')) return;

    this.state.items = this.state.items.filter((i) => i.id !== id);
    this.state.expandedItemId = null;
    this.saveStateToStorage();
    this.showToast('Item deleted successfully', 'info');
    this.renderCurrentPage();
  }

  /* --------------------------------------------------------------------------
     5. FLASHCARD REVIEW MODE (3D Flip & Shortcuts)
     -------------------------------------------------------------------------- */
  initReviewQueue() {
    // Priority queue: Due items first, then others
    const due = this.state.items.filter((i) => this.isItemDueToday(i.nextReviewDate));
    const upcoming = this.state.items.filter((i) => !this.isItemDueToday(i.nextReviewDate));

    this.state.review = {
      queue: [...due, ...upcoming],
      currentIndex: 0,
      isFlipped: false,
      completedCount: 0,
    };
  }

  renderReviewSession(container) {
    const rev = this.state.review;
    const queue = rev.queue;

    if (queue.length === 0) {
      container.innerHTML = `
        <div class="review-container">
          <div class="page-header">
            <div>
              <h1 class="page-title">
                <img src="logo.svg" alt="Logo" class="title-logo-icon" />
                <span>Review Session</span>
              </h1>
              <p class="page-subtitle">Interactive spaced repetition flashcard runner.</p>
            </div>
          </div>
          <div class="panel" style="text-align:center; padding: 48px 24px;">
            <div class="empty-state-icon">📭</div>
            <h3 style="font-size:20px; font-weight:700; margin-bottom:8px;">No Items to Review</h3>
            <p style="color:var(--text-muted); margin-bottom:20px; font-size:13.5px;">
              Add flashcards or study topics to begin testing your memory.
            </p>
            <button class="btn btn-primary" onclick="app.navigate('add')">➕ Add Study Item</button>
          </div>
        </div>
      `;
      return;
    }

    if (rev.currentIndex >= queue.length) {
      container.innerHTML = `
        <div class="review-container">
          <div class="page-header">
            <div>
              <h1 class="page-title">
                <img src="logo.svg" alt="Logo" class="title-logo-icon" />
                <span>Session Complete!</span>
              </h1>
              <p class="page-subtitle">Fantastic effort!</p>
            </div>
          </div>
          <div class="panel" style="text-align:center; padding: 56px 24px;">
            <div style="font-size:54px; margin-bottom:12px;">🎉</div>
            <h2 style="font-size:24px; font-weight:800; margin-bottom:8px;">Review Complete!</h2>
            <p style="color:var(--text-muted); font-size:14px; margin-bottom:24px;">
              You completed ${queue.length} item(s) in this session. Keep up the great streak!
            </p>
            <button class="btn btn-primary" onclick="app.restartReview()">↺ Review Again</button>
          </div>
        </div>
      `;
      this.triggerConfetti();
      return;
    }

    const currentItem = queue[rev.currentIndex];
    const cfg = this.TYPES[currentItem.type] || this.TYPES.Flashcard;
    const progressPct = Math.round((rev.currentIndex / queue.length) * 100);

    let promptQuestion = '';
    let answerText = '';

    if (currentItem.type === 'Flashcard') {
      promptQuestion = currentItem.question;
      answerText = currentItem.answer;
    } else if (currentItem.type === 'Topic') {
      promptQuestion = `${currentItem.topic} (${currentItem.chapter || 'Chapter Notes'})`;
      answerText = currentItem.notes;
    } else if (currentItem.type === 'Slide') {
      promptQuestion = currentItem.topic;
      answerText = `File: ${currentItem.fileName} — Slide #${currentItem.slideNumber}`;
    } else {
      promptQuestion = currentItem.topic;
      answerText = `Difficulty: ${currentItem.difficulty} | Deadline: ${currentItem.deadline}`;
    }

    container.innerHTML = `
      <div class="review-container">
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <img src="logo.svg" alt="Logo" class="title-logo-icon" />
              <span>Flashcard Review</span>
            </h1>
            <p class="page-subtitle">Press <kbd style="background:var(--bg-surface); padding:2px 6px; border-radius:4px; font-size:11px;">Space</kbd> to flip card, <kbd style="background:var(--bg-surface); padding:2px 6px; border-radius:4px; font-size:11px;">1-5</kbd> to score.</p>
          </div>
          <div style="font-size:14px; font-weight:700; color:var(--text-muted);">
            ${rev.currentIndex + 1} of ${queue.length}
          </div>
        </div>

        <div class="review-progress-header">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${progressPct}%;"></div>
          </div>
        </div>

        <!-- 3D Flip Flashcard -->
        <div class="flashcard-3d-wrapper">
          <div class="flashcard-3d ${rev.isFlipped ? 'flipped' : ''}" onclick="app.toggleCardFlip()">
            <!-- Front Face -->
            <div class="card-face card-face-front">
              <span class="type-badge ${cfg.badge}" style="margin-bottom:16px;">
                <span>${cfg.icon}</span> ${cfg.label}
              </span>
              <div class="card-prompt-text">${this.escapeHtml(promptQuestion || 'Question')}</div>
              <div class="card-subtext">${this.escapeHtml(currentItem.subject || 'General')}</div>
              <div class="flip-prompt-hint">
                <span>🔄 Click or Press Space to Reveal Answer</span>
              </div>
            </div>

            <!-- Back Face -->
            <div class="card-face card-face-back">
              <div class="card-hint-badge">Verified Answer / Details</div>
              <div class="card-prompt-text" style="font-size:18px; font-weight:600;">
                ${this.escapeHtml(answerText || 'No detail provided.')}
              </div>
            </div>
          </div>
        </div>

        <!-- Scoring Panel (Visible when card is flipped) -->
        ${rev.isFlipped ? `
          <div class="review-scoring-panel">
            <div style="font-size:12px; font-weight:700; color:var(--text-muted); uppercase; letter-spacing:0.06em;">
              How well did you remember this?
            </div>
            <div class="scoring-buttons-row">
              <div class="score-action-card" onclick="app.submitReviewScore(1)">
                <span class="score-num" style="color:var(--accent-red)">1</span>
                <span class="score-txt">Forgot</span>
              </div>
              <div class="score-action-card" onclick="app.submitReviewScore(2)">
                <span class="score-num" style="color:var(--accent-amber)">2</span>
                <span class="score-txt">Hard</span>
              </div>
              <div class="score-action-card" onclick="app.submitReviewScore(3)">
                <span class="score-num" style="color:var(--accent-amber)">3</span>
                <span class="score-txt">Good</span>
              </div>
              <div class="score-action-card" onclick="app.submitReviewScore(4)">
                <span class="score-num" style="color:var(--accent-green)">4</span>
                <span class="score-txt">Easy</span>
              </div>
              <div class="score-action-card" onclick="app.submitReviewScore(5)">
                <span class="score-num" style="color:var(--accent-blue)">5</span>
                <span class="score-txt">Perfect</span>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  toggleCardFlip() {
    this.state.review.isFlipped = !this.state.review.isFlipped;
    this.renderCurrentPage();
  }

  submitReviewScore(score) {
    const rev = this.state.review;
    const currentItem = rev.queue[rev.currentIndex];
    if (!currentItem) return;

    currentItem.reviewScore = score;
    currentItem.reviewCount = (currentItem.reviewCount || 0) + 1;

    const days = this.calculateNextReviewInterval(score, currentItem.reviewCount);
    currentItem.nextReviewDate = this.generateNextReviewDateString(days);

    this.saveStateToStorage();
    this.showToast(`Scored ${score}/5 — Next review in ${days} day(s)`, 'success');

    if (score === 5) this.playChimeSound();

    rev.currentIndex += 1;
    rev.isFlipped = false;
    this.renderCurrentPage();
  }

  restartReview() {
    this.initReviewQueue();
    this.renderCurrentPage();
  }

  /* --------------------------------------------------------------------------
     6. FOCUS POMODORO TIMER MODULE
     -------------------------------------------------------------------------- */
  renderFocusTimer(container) {
    const timer = this.state.timer;
    const mins = Math.floor(timer.remainingSeconds / 60).toString().padStart(2, '0');
    const secs = (timer.remainingSeconds % 60).toString().padStart(2, '0');

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <img src="logo.svg" alt="Logo" class="title-logo-icon" />
            <span>Focus Pomodoro Timer</span>
          </h1>
          <p class="page-subtitle">Boost deep work sessions using structured 25-minute intervals.</p>
        </div>
      </div>

      <div class="timer-hero-panel">
        <div class="filter-row" style="justify-content:center; margin-bottom:20px;">
          <div class="filter-pill ${timer.mode === 'work' ? 'active' : ''}" onclick="app.setTimerMode('work')">25m Work</div>
          <div class="filter-pill ${timer.mode === 'shortBreak' ? 'active' : ''}" onclick="app.setTimerMode('shortBreak')">5m Short Break</div>
          <div class="filter-pill ${timer.mode === 'longBreak' ? 'active' : ''}" onclick="app.setTimerMode('longBreak')">15m Long Break</div>
        </div>

        <div class="timer-circle-display">
          <div class="timer-digits">${mins}:${secs}</div>
          <div class="timer-mode-label">${timer.mode === 'work' ? 'Deep Work' : 'Break Time'}</div>
        </div>

        <div class="timer-controls">
          <button class="btn btn-primary" onclick="app.toggleTimer()">
            ${timer.isRunning ? '⏸️ Pause' : '▶️ Start Timer'}
          </button>
          <button class="btn btn-secondary" onclick="app.resetTimer()">
            🔄 Reset
          </button>
        </div>

        <div style="margin-top:24px; font-size:13px; color:var(--text-muted);">
          Completed Focus Sessions Today: <strong style="color:var(--accent-green);">${timer.completedSessions}</strong>
        </div>
      </div>
    `;
  }

  setTimerMode(mode) {
    this.pauseTimer();
    this.state.timer.mode = mode;
    if (mode === 'work') this.state.timer.totalSeconds = 25 * 60;
    else if (mode === 'shortBreak') this.state.timer.totalSeconds = 5 * 60;
    else if (mode === 'longBreak') this.state.timer.totalSeconds = 15 * 60;

    this.state.timer.remainingSeconds = this.state.timer.totalSeconds;
    this.renderCurrentPage();
  }

  toggleTimer() {
    if (this.state.timer.isRunning) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
    this.renderCurrentPage();
  }

  startTimer() {
    if (this.state.timer.isRunning) return;
    this.state.timer.isRunning = true;
    this.state.timer.intervalId = setInterval(() => {
      if (this.state.timer.remainingSeconds > 0) {
        this.state.timer.remainingSeconds -= 1;
        this.renderCurrentPage();
      } else {
        this.onTimerComplete();
      }
    }, 1000);
  }

  pauseTimer() {
    if (this.state.timer.intervalId) {
      clearInterval(this.state.timer.intervalId);
      this.state.timer.intervalId = null;
    }
    this.state.timer.isRunning = false;
  }

  resetTimer() {
    this.pauseTimer();
    this.state.timer.remainingSeconds = this.state.timer.totalSeconds;
    this.renderCurrentPage();
  }

  onTimerComplete() {
    this.pauseTimer();
    this.playChimeSound();
    this.triggerConfetti();

    if (this.state.timer.mode === 'work') {
      this.state.timer.completedSessions += 1;
      this.showToast('Great job! Work session completed. Take a break!', 'success');
      this.setTimerMode('shortBreak');
    } else {
      this.showToast('Break time over! Ready to focus again?', 'info');
      this.setTimerMode('work');
    }
  }

  /* --------------------------------------------------------------------------
     7. ANALYTICS & MASTERY INSIGHTS VIEW
     -------------------------------------------------------------------------- */
  renderAnalytics(container) {
    const total = this.state.items.length;
    const mastered = this.state.items.filter((i) => i.reviewScore === 5).length;
    const learning = this.state.items.filter((i) => i.reviewScore >= 2 && i.reviewScore <= 4).length;
    const newItems = this.state.items.filter((i) => !i.reviewScore || i.reviewScore === 1).length;

    // Subjects breakdown
    const subjectCounts = {};
    this.state.items.forEach((i) => {
      const s = i.subject || 'General';
      subjectCounts[s] = (subjectCounts[s] || 0) + 1;
    });

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <img src="logo.svg" alt="Logo" class="title-logo-icon" />
            <span>Study Mastery Analytics</span>
          </h1>
          <p class="page-subtitle">Visual insights into your learning progress and subject balance.</p>
        </div>
      </div>

      <div class="panel" style="margin-bottom:24px;">
        <div class="panel-header">
          <div class="panel-title">🏆 Retention Breakdown</div>
        </div>
        <div class="panel-body">
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:14px;">
            <div class="detail-box" style="border-left: 4px solid var(--accent-blue);">
              <div class="detail-label">Mastered (Score 5)</div>
              <div class="detail-value" style="font-size:22px; font-weight:800; color:var(--accent-blue);">${mastered}</div>
            </div>
            <div class="detail-box" style="border-left: 4px solid var(--accent-green);">
              <div class="detail-label">Learning (Score 2-4)</div>
              <div class="detail-value" style="font-size:22px; font-weight:800; color:var(--accent-green);">${learning}</div>
            </div>
            <div class="detail-box" style="border-left: 4px solid var(--accent-amber);">
              <div class="detail-label">Needs Practice</div>
              <div class="detail-value" style="font-size:22px; font-weight:800; color:var(--accent-amber);">${newItems}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">📚 Subjects Overview</div>
        </div>
        <div class="panel-body">
          ${Object.keys(subjectCounts).length === 0 ? '<div style="color:var(--text-muted)">No data available yet.</div>' : ''}
          ${Object.entries(subjectCounts).map(([subject, count]) => {
            const pct = Math.round((count / total) * 100);
            return `
              <div style="margin-bottom:14px;">
                <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600; margin-bottom:4px;">
                  <span>${this.escapeHtml(subject)}</span>
                  <span style="color:var(--text-muted);">${count} item(s) (${pct}%)</span>
                </div>
                <div class="progress-bar-bg" style="height:8px;">
                  <div class="progress-bar-fill" style="width:${pct}%;"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  /* --------------------------------------------------------------------------
     8. ADD ITEM FORM VIEW
     -------------------------------------------------------------------------- */
  renderAddItemForm(container) {
    const typeCardsHtml = Object.entries(this.TYPES).map(([key, cfg]) => {
      const activeClass = this.state.addType === key ? 'active' : '';
      return `
        <div class="type-option-card ${activeClass}" onclick="app.setAddType('${key}')">
          <div class="type-option-icon">${cfg.icon}</div>
          <div class="type-option-label">${cfg.label}</div>
        </div>
      `;
    }).join('');

    let dynamicFieldsHtml = '';
    if (this.state.addType === 'Flashcard') {
      dynamicFieldsHtml = `
        <div class="form-group">
          <label for="form-question">Question / Front Card Prompt *</label>
          <textarea id="form-question" placeholder="e.g. What is Polymorphism in Object-Oriented Programming?"></textarea>
        </div>
        <div class="form-group">
          <label for="form-answer">Answer / Back Card Explanation *</label>
          <textarea id="form-answer" placeholder="e.g. The ability of different objects to respond to the same method call in unique ways."></textarea>
        </div>
      `;
    } else if (this.state.addType === 'Topic') {
      dynamicFieldsHtml = `
        <div class="form-group">
          <label for="form-chapter">Chapter / Book Section *</label>
          <input type="text" id="form-chapter" placeholder="e.g. Chapter 4 - Memory Management" />
        </div>
        <div class="form-group">
          <label for="form-notes">Key Notes / Summary *</label>
          <textarea id="form-notes" placeholder="Summarize key formulas, theorems, or takeaways..."></textarea>
        </div>
      `;
    } else if (this.state.addType === 'Slide') {
      dynamicFieldsHtml = `
        <div class="form-grid">
          <div class="form-group">
            <label for="form-filename">Presentation File Name *</label>
            <input type="text" id="form-filename" placeholder="e.g. Lecture_05.pdf" />
          </div>
          <div class="form-group">
            <label for="form-slideno">Slide Number *</label>
            <input type="number" id="form-slideno" min="1" value="1" />
          </div>
        </div>
      `;
    } else {
      dynamicFieldsHtml = `
        <div class="form-grid">
          <div class="form-group">
            <label for="form-difficulty">Task Difficulty</label>
            <select id="form-difficulty">
              <option>Easy</option>
              <option selected>Medium</option>
              <option>Hard</option>
            </select>
          </div>
          <div class="form-group">
            <label for="form-deadline">Target Deadline</label>
            <input type="date" id="form-deadline" value="${this.generateNextReviewDateString(7)}" />
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <img src="logo.svg" alt="Logo" class="title-logo-icon" />
            <span>Add New Study Item</span>
          </h1>
          <p class="page-subtitle">Select a format and fill in the details for spaced learning.</p>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">1. Choose Content Type</div>
        </div>
        <div class="panel-body">
          <div class="type-picker-grid">
            ${typeCardsHtml}
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label for="form-topic">Topic Title *</label>
              <input type="text" id="form-topic" placeholder="e.g. Virtual Memory & Paging" />
            </div>
            <div class="form-group">
              <label for="form-subject">Subject / Course *</label>
              <input type="text" id="form-subject" placeholder="e.g. Operating Systems" />
            </div>
          </div>

          ${dynamicFieldsHtml}

          <button class="btn btn-primary btn-full" onclick="app.submitNewItem()" style="margin-top:10px;">
            <span>➕</span> Save ${this.TYPES[this.state.addType].label}
          </button>
        </div>
      </div>
    `;
  }

  setAddType(typeKey) {
    this.state.addType = typeKey;
    this.renderCurrentPage();
  }

  submitNewItem() {
    const topic = this.getInputValue('form-topic');
    const subject = this.getInputValue('form-subject');

    if (!topic || !subject) {
      this.showToast('Please provide both Topic Title and Subject', 'error');
      return;
    }

    const newItem = {
      id: Date.now(),
      type: this.state.addType,
      topic,
      subject,
      nextReviewDate: this.generateNextReviewDateString(1),
      reviewCount: 0,
      reviewScore: 0,
      createdAt: new Date().toISOString(),
    };

    if (this.state.addType === 'Flashcard') {
      const q = this.getInputValue('form-question');
      const a = this.getInputValue('form-answer');
      if (!q || !a) return this.showToast('Question and Answer are required', 'error');
      newItem.question = q;
      newItem.answer = a;
    } else if (this.state.addType === 'Topic') {
      const c = this.getInputValue('form-chapter');
      const n = this.getInputValue('form-notes');
      if (!c) return this.showToast('Chapter title is required', 'error');
      newItem.chapter = c;
      newItem.notes = n;
    } else if (this.state.addType === 'Slide') {
      const fn = this.getInputValue('form-filename');
      const sn = parseInt(this.getInputValue('form-slideno'), 10) || 1;
      if (!fn) return this.showToast('File name is required', 'error');
      newItem.fileName = fn;
      newItem.slideNumber = sn;
    } else {
      newItem.difficulty = this.getInputValue('form-difficulty') || 'Medium';
      newItem.deadline = this.getInputValue('form-deadline');
    }

    this.state.items.push(newItem);
    this.saveStateToStorage();
    this.showToast('Study item added successfully!', 'success');
    this.navigate('items');
  }

  getInputValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  /* ==========================================================================
     9. MODAL OVERLAYS & IMPORT/EXPORT DATA
     ========================================================================== */
  openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
  }

  closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
  }

  openSettings() {
    this.openModal('settings-modal');
  }

  completeOnboarding() {
    const nameInput = document.getElementById('onboard-user-name');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) return;

    this.state.userName = name;
    this.saveStateToStorage();
    this.closeModal('onboard-modal');
    this.updateSidebarUser();
    this.renderCurrentPage();
  }

  exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state.items, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `studytrack_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    this.showToast('Backup exported successfully!', 'success');
  }

  importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedItems = JSON.parse(e.target.result);
        if (Array.isArray(importedItems)) {
          this.state.items = importedItems;
          this.saveStateToStorage();
          this.showToast(`Imported ${importedItems.length} items!`, 'success');
          this.closeModal('settings-modal');
          this.renderCurrentPage();
        } else {
          this.showToast('Invalid JSON file format.', 'error');
        }
      } catch (err) {
        this.showToast('Error parsing JSON backup file.', 'error');
      }
    };
    reader.readAsText(file);
  }

  loadSamplePresets() {
    const samples = [
      {
        id: Date.now() + 1,
        type: 'Flashcard',
        topic: 'Big O Time Complexity',
        subject: 'Computer Science',
        question: 'What is the time complexity of searching in a Balanced Binary Search Tree (BST)?',
        answer: 'O(log n) because the search space is halved at each node step.',
        nextReviewDate: this.generateNextReviewDateString(0),
        reviewCount: 2,
        reviewScore: 4,
      },
      {
        id: Date.now() + 2,
        type: 'Topic',
        topic: 'Mendelian Genetics',
        subject: 'Biology',
        chapter: 'Chapter 14 - Gene Transmission',
        notes: 'Law of Segregation states alleles separate during gamete formation. Law of Independent Assortment applies to genes on different chromosomes.',
        nextReviewDate: this.generateNextReviewDateString(0),
        reviewCount: 1,
        reviewScore: 3,
      },
      {
        id: Date.now() + 3,
        type: 'Slide',
        topic: 'Neural Network Backpropagation',
        subject: 'Machine Learning',
        fileName: 'Deep_Learning_L3.pdf',
        slideNumber: 24,
        nextReviewDate: this.generateNextReviewDateString(1),
        reviewCount: 3,
        reviewScore: 5,
      },
      {
        id: Date.now() + 4,
        type: 'PracticeTask',
        topic: 'Solve 10 Integration by Parts Problems',
        subject: 'Calculus',
        difficulty: 'Hard',
        deadline: this.generateNextReviewDateString(3),
        nextReviewDate: this.generateNextReviewDateString(0),
        reviewCount: 0,
        reviewScore: 0,
      },
    ];

    this.state.items = [...this.state.items, ...samples];
    this.saveStateToStorage();
    this.showToast('Sample Study Decks Loaded!', 'success');
    this.closeModal('settings-modal');
    this.renderCurrentPage();
  }

  /* ==========================================================================
     10. UI UTILITIES, TOASTS, AUDIO & CONFETTI
     ========================================================================== */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ️'}</span>
      <span>${this.escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => toast.classList.add('visible'), 10);

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  playChimeSound() {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, this.audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, this.audioCtx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.35);
    } catch (e) {
      // Audio context silenced or blocked
    }
  }

  triggerConfetti() {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#6c8fff', '#4ecca3', '#ffb547', '#ff6b6b', '#b388ff'];

    for (let i = 0; i < 40; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12 - 4,
        size: Math.random() * 6 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
      });
    }

    let frames = 0;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2; // gravity
        p.alpha -= 0.02;

        ctx.save();
        ctx.globalAlpha = Math.max(p.alpha, 0);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      frames++;
      if (frames < 60) {
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    animate();
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Global App Instance Initialization
const app = new StudyTrackApp();
window.addEventListener('DOMContentLoaded', () => app.init());
