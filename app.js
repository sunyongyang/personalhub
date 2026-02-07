const SpeechRecognitionCtor =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

document.addEventListener('DOMContentLoaded', initAppShell);

const moduleRegistry = {
  modules: new Map(),
  order: [],
  hostEl: null,
  navEl: null,
  currentModuleId: null,
  init({ moduleHost, moduleNav }) {
    this.hostEl = moduleHost;
    this.navEl = moduleNav;
    if (this.navEl) {
      this.navEl.addEventListener('click', (event) => {
        const target = event.target.closest('[data-module-target]');
        if (!target) {
          return;
        }
        this.mount(target.dataset.moduleTarget);
      });
    }
  },
  register(moduleDef) {
    if (!moduleDef?.id) {
      throw new Error('模块需要唯一的 id');
    }
    this.modules.set(moduleDef.id, moduleDef);
    this.order.push(moduleDef.id);
    this.renderNav();
  },
  renderNav() {
    if (!this.navEl) {
      return;
    }
    this.navEl.innerHTML = this.order
      .map((id) => {
        const mod = this.modules.get(id);
        if (!mod) {
          return '';
        }
        return `
          <button type="button" class="module-nav-btn" data-module-target="${mod.id}">
            <span class="module-icon">${mod.icon ?? '📦'}</span>
            <span>${mod.label ?? mod.id}</span>
          </button>
        `;
      })
      .join('');
    this.updateNavActiveState();
  },
  updateNavActiveState() {
    if (!this.navEl) {
      return;
    }
    const buttons = this.navEl.querySelectorAll('[data-module-target]');
    buttons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.moduleTarget === this.currentModuleId);
    });
  },
  mount(moduleId) {
    if (!this.hostEl || !this.modules.has(moduleId)) {
      return;
    }
    if (this.currentModuleId === moduleId) {
      return;
    }
    if (this.currentModuleId) {
      const currentModule = this.modules.get(this.currentModuleId);
      currentModule?.unmount?.();
    }
    this.hostEl.innerHTML = '';
    const nextModule = this.modules.get(moduleId);
    nextModule.mount(this.hostEl);
    this.currentModuleId = moduleId;
    this.updateNavActiveState();
  }
};

function initAppShell() {
  const moduleHost = document.getElementById('moduleHost');
  const moduleNav = document.getElementById('moduleNav');
  const quickAction = document.getElementById('topbarQuickAction');

  moduleRegistry.init({ moduleHost, moduleNav });

  const timeTrackerModule = createTimeTrackerModule();
  const textDraftModule = createTextDraftModule();
  moduleRegistry.register(timeTrackerModule);
  moduleRegistry.register(textDraftModule);

  if (quickAction) {
    quickAction.addEventListener('click', () => {
      moduleRegistry.mount(timeTrackerModule.id);
      timeTrackerModule.focusQuickEntry?.();
    });
  }

  moduleRegistry.mount(timeTrackerModule.id);
}

function createTimeTrackerModule() {
  const STORAGE_KEY = 'ptr_entries_v1';
  const DEFAULT_TITLE = '未命名事项';
  const dom = {};
  const state = {
    activeSession: null,
    intervalId: null,
    selectedDate: null,
    inlineEditor: null
  };
  let rootEl = null;

  function mount(hostEl) {
    const template = document.getElementById('timeModuleTemplate');
    if (!template) {
      hostEl.innerHTML = '<p>无法加载时间记录模块。</p>';
      return;
    }
    hostEl.appendChild(template.content.cloneNode(true));
    rootEl = hostEl.querySelector('.time-module');
    if (!rootEl) {
      return;
    }
    cacheDom();
    setupVoiceInput();
    initializeDateState();
    bindEvents();
    renderDay();
  }

  function unmount() {
    cleanupInlineEditor();
    clearActiveSession();
    rootEl = null;
    Object.keys(dom).forEach((key) => {
      dom[key] = null;
    });
  }

  function focusQuickEntry() {
    dom.taskName?.focus();
  }

  function cacheDom() {
    dom.moduleRoot = rootEl;
    dom.datePicker = rootEl.querySelector('#datePicker');
    dom.taskName = rootEl.querySelector('#taskName');
    dom.taskCategory = rootEl.querySelector('#taskCategory');
    dom.taskNotes = rootEl.querySelector('#taskNotes');
    dom.startBtn = rootEl.querySelector('#startBtn');
    dom.stopBtn = rootEl.querySelector('#stopBtn');
    dom.timerDisplay = rootEl.querySelector('#timerDisplay');
    dom.timerMeta = rootEl.querySelector('#timerMeta');
    dom.entriesList = rootEl.querySelector('#entriesList');
    dom.summaryContent = rootEl.querySelector('#summaryContent');
    dom.totalTimeBadge = rootEl.querySelector('#totalTimeBadge');
    dom.exportBtn = rootEl.querySelector('#exportBtn');
    dom.entryTemplate = rootEl.querySelector('#entryTemplate');
    dom.voiceBtn = rootEl.querySelector('#voiceBtn');
    dom.voiceHint = rootEl.querySelector('#voiceHint');
  }

  function bindEvents() {
    dom.startBtn?.addEventListener('click', handleStart);
    dom.stopBtn?.addEventListener('click', handleStop);
    dom.datePicker?.addEventListener('change', handleDateChange);
    dom.exportBtn?.addEventListener('click', handleExport);
    dom.entriesList?.addEventListener('click', handleEntryListClick);
    dom.entriesList?.addEventListener('dblclick', handleEntryDblClick);
  }

  function setupVoiceInput() {
    if (!dom.voiceBtn || !dom.voiceHint) {
      return;
    }

    const defaultHint =
      dom.voiceHint.textContent.trim() ||
      '点击语音输入按钮即可通过语音快速填写事项。';
    if (!SpeechRecognitionCtor) {
      dom.voiceBtn.disabled = true;
      dom.voiceHint.textContent =
        '当前浏览器暂不支持语音输入，建议使用最新版 Chrome。';
      dom.voiceHint.classList.add('error');
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const resetVoiceUi = () => {
      dom.voiceBtn.disabled = false;
      dom.voiceBtn.classList.remove('recording');
      dom.voiceBtn.textContent = '语音输入';
    };

    dom.voiceBtn.addEventListener('click', () => {
      dom.voiceHint.classList.remove('error');
      dom.voiceHint.textContent = '正在聆听，请清晰地说出事项名称。';
      dom.voiceBtn.disabled = true;
      dom.voiceBtn.classList.add('recording');
      dom.voiceBtn.textContent = '聆听中...';
      try {
        recognition.start();
      } catch (error) {
        resetVoiceUi();
        dom.voiceHint.classList.add('error');
        dom.voiceHint.textContent = '无法启动语音识别，请确认麦克风权限。';
      }
    });

    recognition.addEventListener('result', (event) => {
      const transcript = event.results[0][0].transcript.trim();
      if (transcript && dom.taskName) {
        dom.taskName.value = transcript;
        dom.taskName.focus();
      }
      dom.voiceHint.classList.remove('error');
      dom.voiceHint.textContent = '识别完成，如需重新录入请再次点击。';
    });

    recognition.addEventListener('error', (event) => {
      dom.voiceHint.classList.add('error');
      if (event.error === 'not-allowed') {
        dom.voiceHint.textContent = '麦克风权限被拒绝，请允许浏览器访问麦克风。';
      } else if (event.error === 'no-speech') {
        dom.voiceHint.textContent = '未检测到语音，请靠近麦克风后重试。';
      } else {
        dom.voiceHint.textContent = '语音识别出错，请稍后重试。';
      }
    });

    recognition.addEventListener('end', () => {
      resetVoiceUi();
      if (!dom.voiceHint.classList.contains('error')) {
        dom.voiceHint.textContent = defaultHint;
      }
    });
  }

  function initializeDateState() {
    const todayKey = formatDateKey(new Date());
    state.selectedDate = todayKey;
    if (dom.datePicker) {
      dom.datePicker.value = todayKey;
      dom.datePicker.max = todayKey;
    }
  }

  function handleEntryListClick(event) {
    const actionBtn = event.target.closest('[data-entry-action]');
    if (!actionBtn) {
      return;
    }

    const card = actionBtn.closest('.entry-card');
    if (!card || !card.dataset.entryId) {
      return;
    }

    if (actionBtn.dataset.entryAction === 'delete') {
      deleteEntry(card.dataset.entryId);
    }
  }

  function handleEntryDblClick(event) {
    const card = event.target.closest('.entry-card');
    if (!card || !card.dataset.entryId) {
      return;
    }

    let field = null;
    if (event.target.closest('.entry-title')) {
      field = 'title';
    } else if (event.target.closest('.entry-notes')) {
      field = 'notes';
    }

    if (!field) {
      return;
    }

    startInlineEdit(card, field);
  }

  function startInlineEdit(card, field) {
    const targetEntryId = card.dataset.entryId;

    if (state.inlineEditor) {
      commitInlineEdit();
      card = dom.entriesList.querySelector(`[data-entry-id="${targetEntryId}"]`);
    }

    if (!card) {
      return;
    }

    const entries = loadEntries();
    const entry = entries.find((item) => item.id === targetEntryId);
    if (!entry) {
      return;
    }

    const displayEl =
      field === 'title'
        ? card.querySelector('.entry-title')
        : card.querySelector('.entry-notes');
    if (!displayEl) {
      return;
    }

    const editor =
      field === 'title'
        ? document.createElement('input')
        : document.createElement('textarea');
    editor.className = 'inline-editor';
    editor.value = field === 'title' ? entry.title : entry.notes || '';
    if (field === 'notes') {
      const lineCount = editor.value ? editor.value.split('\n').length : 1;
      editor.rows = Math.min(4, Math.max(2, lineCount));
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'inline-editor-wrapper';
    wrapper.appendChild(editor);
    displayEl.style.display = 'none';
    displayEl.insertAdjacentElement('afterend', wrapper);

    let voiceBtn = null;
    if (SpeechRecognitionCtor) {
      voiceBtn = document.createElement('button');
      voiceBtn.type = 'button';
      voiceBtn.className = 'inline-voice-btn';
      voiceBtn.textContent = '语音输入';
      voiceBtn.addEventListener('mousedown', (event) => event.preventDefault());
      voiceBtn.addEventListener('click', (event) => {
        event.preventDefault();
        startInlineVoiceCapture(voiceBtn, editor, { append: field === 'notes' });
      });
      wrapper.appendChild(voiceBtn);
    }

    editor.focus();
    editor.select();

    const onBlur = () => commitInlineEdit();
    const onKeyDown = (e) => {
      if (e.key === 'Enter' && field === 'title' && !e.shiftKey) {
        e.preventDefault();
        commitInlineEdit();
      } else if (field === 'notes' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commitInlineEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        commitInlineEdit({ cancel: true });
      }
    };

    editor.addEventListener('blur', onBlur, { once: true });
    editor.addEventListener('keydown', onKeyDown);

    state.inlineEditor = {
      entryId: targetEntryId,
      field,
      displayEl,
      editorEl: editor,
      wrapperEl: wrapper,
      voiceBtn,
      keydownHandler: onKeyDown
    };
  }

  function commitInlineEdit({ cancel = false } = {}) {
    if (!state.inlineEditor) {
      return;
    }

    const { entryId, field, editorEl } = state.inlineEditor;
    const newValue = editorEl.value;
    cleanupInlineEditor();

    if (cancel) {
      return;
    }

    const trimmed = newValue.trim();
    if (field === 'title' && !trimmed) {
      alert('事项名称不能为空。');
      return;
    }

    const entries = loadEntries();
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) {
      return;
    }

    if (field === 'title') {
      entry.title = trimmed;
    } else {
      entry.notes = trimmed;
    }

    saveEntries(entries);
    if (entry.date === state.selectedDate) {
      renderDay();
    }
  }

  function cleanupInlineEditor() {
    if (!state.inlineEditor) {
      return;
    }

    const { displayEl, editorEl, wrapperEl, keydownHandler } = state.inlineEditor;
    if (displayEl) {
      displayEl.style.removeProperty('display');
    }
    if (editorEl && keydownHandler) {
      editorEl.removeEventListener('keydown', keydownHandler);
    }
    if (wrapperEl) {
      wrapperEl.remove();
    } else if (editorEl) {
      editorEl.remove();
    }
    state.inlineEditor = null;
  }

  function startInlineVoiceCapture(button, editor, { append = false } = {}) {
    if (!SpeechRecognitionCtor) {
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const resetButton = (label = '语音输入') => {
      button.disabled = false;
      button.classList.remove('recording');
      button.textContent = label;
    };

    recognition.addEventListener('result', (event) => {
      const transcript = event.results[0][0].transcript.trim();
      if (!transcript) {
        return;
      }
      if (append) {
        const hasContent = editor.value.trim().length > 0;
        editor.value = hasContent ? `${editor.value}\n${transcript}` : transcript;
      } else {
        editor.value = transcript;
      }
      editor.focus();
      const end = editor.value.length;
      editor.setSelectionRange(end, end);
    });

    recognition.addEventListener('error', () => {
      resetButton('重试语音');
    });

    recognition.addEventListener('end', () => {
      resetButton();
    });

    try {
      button.disabled = true;
      button.classList.add('recording');
      button.textContent = '聆听中...';
      recognition.start();
    } catch (error) {
      console.error('Inline voice capture failed', error);
      resetButton('重试语音');
    }
  }

  function deleteEntry(entryId) {
    const entries = loadEntries();
    const index = entries.findIndex((item) => item.id === entryId);
    if (index === -1) {
      return;
    }

    const target = entries[index];
    const confirmed = confirm('确定要删除这条记录吗？此操作不可恢复。');
    if (!confirmed) {
      return;
    }

    if (state.inlineEditor && state.inlineEditor.entryId === entryId) {
      cleanupInlineEditor();
    }

    entries.splice(index, 1);
    saveEntries(entries);

    if (target.date === state.selectedDate) {
      renderDay();
    }
  }

  function handleStart() {
    if (state.activeSession) {
      return;
    }

    const titleInput = dom.taskName?.value.trim() ?? '';
    const category = dom.taskCategory?.value.trim() ?? '';
    const start = Date.now();
    state.activeSession = {
      id: crypto?.randomUUID?.() ?? `session-${start}`,
      title: titleInput || DEFAULT_TITLE,
      category: category || '未分类',
      startedAt: start
    };

    if (dom.startBtn) {
      dom.startBtn.disabled = true;
    }
    if (dom.stopBtn) {
      dom.stopBtn.disabled = false;
    }
    if (dom.timerMeta) {
      dom.timerMeta.textContent = `${state.activeSession.title} · ${state.activeSession.category}`;
    }

    updateTimerDisplay(0);
    state.intervalId = setInterval(() => {
      if (!state.activeSession) {
        return;
      }
      const elapsed = Date.now() - state.activeSession.startedAt;
      updateTimerDisplay(elapsed);
    }, 1000);
  }

  function handleStop() {
    if (!state.activeSession) {
      return;
    }

    const end = Date.now();
    const elapsed = end - state.activeSession.startedAt;
    if (elapsed < 1000) {
      alert('计时时间太短，至少需要 1 秒。');
      return;
    }

    const latestTitle = dom.taskName?.value.trim() ?? '';
    const entry = {
      id: state.activeSession.id,
      title: latestTitle || state.activeSession.title || DEFAULT_TITLE,
      category: state.activeSession.category,
      notes: dom.taskNotes?.value.trim() ?? '',
      start: state.activeSession.startedAt,
      end,
      duration: elapsed,
      date: formatDateKey(new Date(state.activeSession.startedAt)),
      savedAt: end
    };

    const entries = loadEntries();
    entries.push(entry);
    saveEntries(entries);

    clearActiveSession();
    resetForm();

    if (entry.date === state.selectedDate) {
      renderDay();
    }
  }

  function handleDateChange(event) {
    state.selectedDate = event.target.value || formatDateKey(new Date());
    renderDay();
  }

  function handleExport() {
    const entries = loadEntries();
    if (!entries.length) {
      alert('目前还没有任何数据可以导出。');
      return;
    }

    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `time-record-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function renderDay() {
    const entries = getEntriesByDate(state.selectedDate);
    renderEntries(entries);
    renderSummary(entries);
  }

  function renderEntries(entries) {
    cleanupInlineEditor();
    if (!dom.entriesList) {
      return;
    }
    if (!entries.length) {
      dom.entriesList.classList.add('empty-state');
      dom.entriesList.innerHTML = '<p>今天还没有记录，点击上方开始按钮吧。</p>';
      if (dom.totalTimeBadge) {
        dom.totalTimeBadge.textContent = '总计 0h0m';
      }
      return;
    }

    dom.entriesList.classList.remove('empty-state');
    dom.entriesList.innerHTML = '';

    const sorted = [...entries].sort((a, b) => a.start - b.start);
    const fragment = document.createDocumentFragment();

    sorted.forEach((entry) => {
      const node = dom.entryTemplate.content.cloneNode(true);
      const card = node.querySelector('.entry-card');
      card.dataset.entryId = entry.id;
      const titleEl = node.querySelector('.entry-title');
      const notesEl = node.querySelector('.entry-notes');
      titleEl.textContent = entry.title;
      const hasNotes = Boolean(entry.notes?.trim());
      notesEl.textContent = hasNotes ? entry.notes : '无备注';
      notesEl.classList.toggle('empty', !hasNotes);
      node.querySelector('.entry-category').textContent = entry.category;
      node.querySelector('.entry-duration').textContent = formatDuration(entry.duration);
      node.querySelector('.entry-time-range').textContent = formatTimeRange(
        entry.start,
        entry.end
      );
      fragment.appendChild(node);
    });

    dom.entriesList.appendChild(fragment);
    const totalDuration = entries.reduce((acc, entry) => acc + entry.duration, 0);
    if (dom.totalTimeBadge) {
      dom.totalTimeBadge.textContent = `总计 ${formatDuration(totalDuration)}`;
    }
  }

  function renderSummary(entries) {
    if (!dom.summaryContent) {
      return;
    }
    if (!entries.length) {
      dom.summaryContent.classList.add('empty-state');
      dom.summaryContent.innerHTML =
        '<p>记录几段时间后，系统会自动计算各类占比、最长事项等信息。</p>';
      return;
    }

    dom.summaryContent.classList.remove('empty-state');

    const totalDuration = entries.reduce((acc, entry) => acc + entry.duration, 0);
    const avgDuration = totalDuration / entries.length;
    const longest = entries.reduce((prev, curr) =>
      curr.duration > prev.duration ? curr : prev
    );
    const categories = entries.reduce((map, entry) => {
      const key = entry.category || '未分类';
      map[key] = (map[key] || 0) + entry.duration;
      return map;
    }, {});

    const topCategories = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    dom.summaryContent.innerHTML = `
      <div class="summary-grid">
        <div class="stat-card">
          <p class="stat-label">记录数量</p>
          <p class="stat-value">${entries.length} 段</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">累计时长</p>
          <p class="stat-value">${formatDuration(totalDuration)}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">平均每段</p>
          <p class="stat-value">${formatDuration(avgDuration)}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">最长事项</p>
          <p class="stat-value">${longest.title}</p>
          <p>${formatDuration(longest.duration)}</p>
        </div>
      </div>
      <div class="summary-list">
        <h3>按类别分布</h3>
        <ul>
          ${
            topCategories.length
              ? topCategories
                  .map(
                    ([category, duration]) =>
                      `<li><span>${category}</span><span>${formatDuration(
                        duration
                      )}</span></li>`
                  )
                  .join('')
              : '<li><span>暂无数据</span><span>--</span></li>'
          }
        </ul>
      </div>
    `;
  }

  function clearActiveSession() {
    if (state.intervalId) {
      clearInterval(state.intervalId);
    }
    state.intervalId = null;
    state.activeSession = null;
    if (dom.timerMeta) {
      dom.timerMeta.textContent = '暂无进行中的任务';
    }
    updateTimerDisplay(0);
    if (dom.startBtn) {
      dom.startBtn.disabled = false;
    }
    if (dom.stopBtn) {
      dom.stopBtn.disabled = true;
    }
  }

  function resetForm() {
    if (dom.taskName) {
      dom.taskName.value = '';
    }
    if (dom.taskCategory) {
      dom.taskCategory.value = '';
    }
    if (dom.taskNotes) {
      dom.taskNotes.value = '';
    }
  }

  function loadEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('Failed to load entries', error);
      return [];
    }
  }

  function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  function getEntriesByDate(dateKey) {
    return loadEntries().filter((entry) => entry.date === dateKey);
  }

  function updateTimerDisplay(durationMs) {
    if (dom.timerDisplay) {
      dom.timerDisplay.textContent = formatClock(durationMs);
    }
  }

  function formatClock(durationMs) {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  function formatDuration(durationMs) {
    const totalMinutes = Math.round(durationMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) {
      return `${minutes}m`;
    }
    return `${hours}h${minutes}m`;
  }

  function formatTimeRange(startMs, endMs) {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
    return `${formatter.format(startMs)} - ${formatter.format(endMs)}`;
  }

  function formatDateKey(date) {
    const tzOffset = date.getTimezoneOffset() * 60000;
    const localISO = new Date(date.getTime() - tzOffset).toISOString();
    return localISO.slice(0, 10);
  }

  return {
    id: 'time-tracker',
    label: '时间记录',
    icon: '⏱',
    mount,
    unmount,
    focusQuickEntry
  };
}

function createTextDraftModule() {
  const STORAGE_KEY = 'ptr_text_drafts_v1';
  const DEFAULT_TITLE = '未命名草稿';
  const dom = {};
  const state = {
    drafts: [],
    currentDraftId: null,
    recognition: null
  };
  let rootEl = null;

  function mount(hostEl) {
    const template = document.getElementById('textModuleTemplate');
    if (!template) {
      hostEl.innerHTML = '<p>无法加载文本草稿模块。</p>';
      return;
    }
    hostEl.appendChild(template.content.cloneNode(true));
    rootEl = hostEl.querySelector('.text-module');
    cacheDom();
    bindEvents();
    loadDrafts();
    renderDraftList();
    updateSaveButton();
  }

  function unmount() {
    stopVoiceInput();
    rootEl = null;
    state.currentDraftId = null;
    Object.keys(dom).forEach((key) => {
      dom[key] = null;
    });
  }

  function cacheDom() {
    dom.moduleRoot = rootEl;
    dom.draftTitle = rootEl.querySelector('#draftTitle');
    dom.draftContent = rootEl.querySelector('#draftContent');
    dom.saveDraftBtn = rootEl.querySelector('#saveDraftBtn');
    dom.copyDraftBtn = rootEl.querySelector('#copyDraftBtn');
    dom.exportDraftBtn = rootEl.querySelector('#exportDraftBtn');
    dom.newDraftBtn = rootEl.querySelector('#newDraftBtn');
    dom.clearDraftsBtn = rootEl.querySelector('#clearDraftsBtn');
    dom.draftList = rootEl.querySelector('#draftList');
    dom.draftVoiceBtn = rootEl.querySelector('#draftVoiceBtn');
    dom.draftVoiceHint = rootEl.querySelector('#draftVoiceHint');
    dom.insertTimestampBtn = rootEl.querySelector('#insertTimestampBtn');
  }

  function bindEvents() {
    dom.saveDraftBtn?.addEventListener('click', handleSaveDraft);
    dom.copyDraftBtn?.addEventListener('click', handleCopyDraft);
    dom.exportDraftBtn?.addEventListener('click', handleExportDraft);
    dom.newDraftBtn?.addEventListener('click', handleNewDraft);
    dom.clearDraftsBtn?.addEventListener('click', handleClearAllDrafts);
    dom.insertTimestampBtn?.addEventListener('click', handleInsertTimestamp);
    dom.draftList?.addEventListener('click', handleDraftListClick);
    setupVoiceInput();
  }

  function loadDrafts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state.drafts = raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('Failed to load drafts', error);
      state.drafts = [];
    }
  }

  function persistDrafts() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.drafts));
  }

  function handleSaveDraft() {
    const title = dom.draftTitle?.value.trim() || DEFAULT_TITLE;
    const content = dom.draftContent?.value || '';
    if (!content.trim()) {
      alert('请先输入草稿内容。');
      return;
    }

    const payload = {
      id: state.currentDraftId || crypto?.randomUUID?.() || `draft-${Date.now()}`,
      title,
      content,
      updatedAt: Date.now()
    };

    const existingIndex = state.drafts.findIndex((draft) => draft.id === payload.id);
    if (existingIndex >= 0) {
      state.drafts[existingIndex] = payload;
    } else {
      state.drafts.unshift(payload);
    }

    state.currentDraftId = payload.id;
    persistDrafts();
    renderDraftList();
    updateSaveButton();
  }

  function handleCopyDraft() {
    const content = dom.draftContent?.value || '';
    if (!content) {
      alert('没有可复制的内容。');
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(content)
        .then(() => {
          if (dom.copyDraftBtn) {
            const original = dom.copyDraftBtn.textContent;
            dom.copyDraftBtn.textContent = '已复制';
            setTimeout(() => {
              if (dom.copyDraftBtn) {
                dom.copyDraftBtn.textContent = original;
              }
            }, 1000);
          }
        })
        .catch(() => alert('复制失败，请手动选择文本。'));
    } else {
      alert('浏览器不支持快速复制，请手动选择文本。');
    }
  }

  function handleExportDraft() {
    const title = dom.draftTitle?.value.trim() || DEFAULT_TITLE;
    const content = dom.draftContent?.value || '';
    if (!content) {
      alert('没有可导出的内容。');
      return;
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleNewDraft() {
    state.currentDraftId = null;
    if (dom.draftTitle) {
      dom.draftTitle.value = '';
    }
    if (dom.draftContent) {
      dom.draftContent.value = '';
      dom.draftContent.focus();
    }
    updateSaveButton();
  }

  function handleClearAllDrafts() {
    if (!state.drafts.length) {
      alert('当前没有草稿。');
      return;
    }
    const confirmed = confirm('确定要清空全部草稿吗？该操作不可撤销。');
    if (!confirmed) {
      return;
    }
    state.drafts = [];
    state.currentDraftId = null;
    persistDrafts();
    renderDraftList();
    updateSaveButton();
  }

  function handleInsertTimestamp() {
    if (!dom.draftContent) {
      return;
    }
    const cursorPos = dom.draftContent.selectionStart || dom.draftContent.value.length;
    const timestamp = `[${new Date().toLocaleString()}] `;
    const value = dom.draftContent.value;
    dom.draftContent.value =
      value.slice(0, cursorPos) + timestamp + value.slice(cursorPos, value.length);
    dom.draftContent.focus();
    const newPos = cursorPos + timestamp.length;
    dom.draftContent.setSelectionRange(newPos, newPos);
  }

  function setupVoiceInput() {
    if (!dom.draftVoiceBtn || !dom.draftVoiceHint) {
      return;
    }
    if (!SpeechRecognitionCtor) {
      dom.draftVoiceBtn.disabled = true;
      dom.draftVoiceHint.textContent =
        '当前浏览器不支持语音输入，可手动输入或更换浏览器。';
      dom.draftVoiceHint.classList.add('error');
      return;
    }
    state.recognition = new SpeechRecognitionCtor();
    state.recognition.lang = 'zh-CN';
    state.recognition.interimResults = false;
    state.recognition.maxAlternatives = 1;

    const resetBtn = () => {
      dom.draftVoiceBtn.disabled = false;
      dom.draftVoiceBtn.classList.remove('recording');
      dom.draftVoiceBtn.textContent = '语音输入';
    };

    dom.draftVoiceBtn.addEventListener('click', () => {
      dom.draftVoiceHint.classList.remove('error');
      dom.draftVoiceHint.textContent = '正在聆听，请开始讲话。';
      dom.draftVoiceBtn.disabled = true;
      dom.draftVoiceBtn.classList.add('recording');
      dom.draftVoiceBtn.textContent = '聆听中...';
      try {
        state.recognition.start();
      } catch (error) {
        resetBtn();
        dom.draftVoiceHint.classList.add('error');
        dom.draftVoiceHint.textContent = '无法启动语音识别，请检查权限。';
      }
    });

    state.recognition.addEventListener('result', (event) => {
      const transcript = event.results[0][0].transcript.trim();
      if (transcript && dom.draftContent) {
        const hasContent = dom.draftContent.value.trim().length > 0;
        dom.draftContent.value = hasContent
          ? `${dom.draftContent.value}\n${transcript}`
          : transcript;
        dom.draftContent.focus();
        dom.draftContent.setSelectionRange(
          dom.draftContent.value.length,
          dom.draftContent.value.length
        );
      }
      dom.draftVoiceHint.textContent = '识别完成，可继续编辑或再次录入。';
    });

    state.recognition.addEventListener('error', (event) => {
      dom.draftVoiceHint.classList.add('error');
      if (event.error === 'not-allowed') {
        dom.draftVoiceHint.textContent = '麦克风权限被拒绝，请允许浏览器访问麦克风。';
      } else if (event.error === 'no-speech') {
        dom.draftVoiceHint.textContent = '未检测到语音，请靠近麦克风后重试。';
      } else {
        dom.draftVoiceHint.textContent = '语音识别出错，请稍后重试。';
      }
    });

    state.recognition.addEventListener('end', () => {
      resetBtn();
      if (!dom.draftVoiceHint.classList.contains('error')) {
        dom.draftVoiceHint.textContent = '可用语音快速补充内容。';
      }
    });
  }

  function stopVoiceInput() {
    try {
      state.recognition?.stop?.();
    } catch {
      // ignore
    }
    state.recognition = null;
  }

  function handleDraftListClick(event) {
    const actionBtn = event.target.closest('[data-draft-action]');
    if (!actionBtn) {
      return;
    }
    const card = actionBtn.closest('.draft-card');
    if (!card) {
      return;
    }
    const draftId = card.dataset.draftId;
    const draft = state.drafts.find((item) => item.id === draftId);
    if (!draft) {
      return;
    }
    const action = actionBtn.dataset.draftAction;
    if (action === 'load') {
      loadDraftIntoEditor(draft);
    } else if (action === 'copy') {
      navigator.clipboard
        ?.writeText(draft.content)
        .then(() => {
          actionBtn.textContent = '已复制';
          setTimeout(() => {
            actionBtn.textContent = '复制';
          }, 1000);
        })
        .catch(() => alert('复制失败，请手动选择文本。'));
    } else if (action === 'delete') {
      const confirmed = confirm(`确定删除「${draft.title}」吗？`);
      if (!confirmed) {
        return;
      }
      state.drafts = state.drafts.filter((item) => item.id !== draftId);
      if (state.currentDraftId === draftId) {
        handleNewDraft();
      }
      persistDrafts();
      renderDraftList();
    }
  }

  function loadDraftIntoEditor(draft) {
    state.currentDraftId = draft.id;
    if (dom.draftTitle) {
      dom.draftTitle.value = draft.title;
    }
    if (dom.draftContent) {
      dom.draftContent.value = draft.content;
      dom.draftContent.focus();
    }
    updateSaveButton();
  }

  function renderDraftList() {
    if (!dom.draftList) {
      return;
    }
    if (!state.drafts.length) {
      dom.draftList.classList.add('empty-state');
      dom.draftList.innerHTML = '<p>暂未保存草稿，保存后将在此展示，方便复用。</p>';
      return;
    }
    dom.draftList.classList.remove('empty-state');
    dom.draftList.innerHTML = '';
    const fragment = document.createDocumentFragment();
    state.drafts.forEach((draft) => {
      const card = document.createElement('article');
      card.className = 'draft-card';
      card.dataset.draftId = draft.id;
      card.innerHTML = `
        <div class="draft-card-header">
          <div>
            <p class="draft-card-title">${escapeHtml(draft.title)}</p>
            <p class="draft-card-subtitle">${formatRelativeTime(draft.updatedAt)}</p>
          </div>
          <div class="draft-card-actions">
            <button type="button" class="ghost-btn ghost-btn--small" data-draft-action="load">载入</button>
            <button type="button" class="ghost-btn ghost-btn--small" data-draft-action="copy">复制</button>
            <button type="button" class="icon-btn" data-draft-action="delete" aria-label="删除草稿">
              <span class="icon-trash" aria-hidden="true"></span>
            </button>
          </div>
        </div>
        <p class="draft-snippet">${escapeHtml(getSnippet(draft.content))}</p>
      `;
      fragment.appendChild(card);
    });
    dom.draftList.appendChild(fragment);
  }

  function getSnippet(content) {
    const trimmed = content.trim().replace(/\s+/g, ' ');
    return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed || '（空内容）';
  }

  function formatRelativeTime(timestamp) {
    const date = new Date(timestamp);
    return `更新于 ${date.toLocaleString()}`;
  }

  function updateSaveButton() {
    if (!dom.saveDraftBtn) {
      return;
    }
    dom.saveDraftBtn.textContent = state.currentDraftId ? '更新草稿' : '保存到草稿库';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return {
    id: 'text-drafts',
    label: '文本草稿',
    icon: '📝',
    mount,
    unmount
  };
}
