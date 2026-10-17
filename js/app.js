/**
 * Studia — Main Application Entry Point & Settings Manager
 */
(function(window) {
  'use strict';

  class StudiaApp {
    constructor() {
      this.isInitialized = false;
    }

    async init() {
      // 1. Initialize submodules
      window.Studia.viewer.init();
      window.Studia.chat.init();
      window.Studia.sources.init();
      window.Studia.tests.init();

      // 2. Setup Modals & Settings
      this.setupSettingsModal();
      this.setupAgentEditor();
      this.setupProjectPicker();
      this.setupLayoutControls();

      // 3. Check folder from previous session
      try {
        const session = await window.Studia.fs.checkStoredSession();
        if (session.status === 'granted') {
          this.onProjectLoaded();
        } else if (session.status === 'needs_permission') {
          this.showResumeUI(session.name);
        } else {
          this.showInitialUI();
        }
      } catch (err) {
        console.warn('Error comprobando sesión previa:', err);
        this.showInitialUI();
      }

      this.isInitialized = true;
    }

    showResumeUI(folderName) {
      const resumeContainer = document.getElementById('welcome-resume-container');
      const initialContainer = document.getElementById('welcome-initial-container');
      const folderNameEl = document.getElementById('resume-folder-name');
      const welcomeDesc = document.getElementById('welcome-desc');

      if (folderNameEl) folderNameEl.textContent = `"${folderName}"`;
      if (welcomeDesc) welcomeDesc.textContent = `Se ha detectado tu sesión anterior con la carpeta "${folderName}". Pulsa para reanudar el acceso directamente sin tener que buscarla.`;
      if (resumeContainer) {
        resumeContainer.classList.remove('hidden');
        resumeContainer.style.display = 'flex';
      }
      if (initialContainer) initialContainer.classList.add('hidden');
    }

    showInitialUI() {
      const resumeContainer = document.getElementById('welcome-resume-container');
      const initialContainer = document.getElementById('welcome-initial-container');
      if (resumeContainer) {
        resumeContainer.classList.add('hidden');
        resumeContainer.style.display = 'none';
      }
      if (initialContainer) initialContainer.classList.remove('hidden');
    }

    setupProjectPicker() {
      const resumeBtn = document.getElementById('btn-resume-project');
      if (resumeBtn) {
        resumeBtn.addEventListener('click', async () => {
          try {
            resumeBtn.disabled = true;
            resumeBtn.innerHTML = '<span class="spinner"></span> Reanudando acceso...';
            const ok = await window.Studia.fs.resumeStoredSession();
            if (ok) {
              this.onProjectLoaded();
              this.showToast('Acceso a la carpeta reanudado con éxito', 'success');
            } else {
              this.showInitialUI();
            }
          } catch (err) {
            console.error('Error reanudando carpeta:', err);
            this.showInitialUI();
          } finally {
            resumeBtn.disabled = false;
          }
        });
      }

      const openFolderBtns = document.querySelectorAll('.btn-open-project');
      openFolderBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await window.Studia.fs.pickDirectory();
            this.onProjectLoaded();
            this.showToast('Carpeta del proyecto vinculada correctamente', 'success');
          } catch (err) {
            if (err.name !== 'AbortError') {
              console.error('Error seleccionando carpeta:', err);
              alert(err.message);
            }
          }
        });
      });
    }

    async onProjectLoaded() {
      // Hide welcome overlay if present
      const overlay = document.getElementById('welcome-overlay');
      if (overlay) overlay.classList.add('hidden');

      const projectPathEl = document.getElementById('project-path-display');
      if (projectPathEl && window.Studia.fs.rootHandle) {
        projectPathEl.textContent = window.Studia.fs.rootHandle.name;
        projectPathEl.title = `Carpeta: ${window.Studia.fs.rootHandle.name}`;
      }

      // Refresh sources and saved tests
      await window.Studia.sources.refresh();
      await window.Studia.tests.renderSavedTests();

      // If user has no API key, prompt settings gently
      if (!window.Studia.gemini.hasKey()) {
        this.openSettingsModal();
      }
    }

    setupSettingsModal() {
      const settingsBtn = document.getElementById('btn-open-settings');
      const settingsModal = document.getElementById('settings-modal');
      const closeBtn = document.getElementById('btn-close-settings');
      const saveBtn = document.getElementById('btn-save-settings');
      const testKeyBtn = document.getElementById('btn-test-key');
      const apiKeyInput = document.getElementById('settings-api-key');
      const modelSelect = document.getElementById('settings-model-select');
      const keyStatus = document.getElementById('key-test-status');

      if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => this.openSettingsModal());
      }

      if (closeBtn && settingsModal) {
        closeBtn.addEventListener('click', () => {
          settingsModal.classList.add('hidden');
        });
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const key = apiKeyInput ? apiKeyInput.value.trim() : '';
          const model = modelSelect ? modelSelect.value : 'gemini-3.8-flash';

          window.Studia.gemini.setApiKey(key);
          window.Studia.gemini.setModel(model);

          if (settingsModal) settingsModal.classList.add('hidden');
          this.showToast('Ajustes guardados correctamente', 'success');
        });
      }

      if (testKeyBtn) {
        testKeyBtn.addEventListener('click', async () => {
          const key = apiKeyInput ? apiKeyInput.value.trim() : '';
          const model = modelSelect ? modelSelect.value : 'gemini-3.8-flash';
          window.Studia.gemini.setApiKey(key);
          window.Studia.gemini.setModel(model);

          if (!key) {
            if (keyStatus) keyStatus.innerHTML = '<span class="text-red">Introduce una API Key primero.</span>';
            return;
          }

          if (keyStatus) {
            keyStatus.innerHTML = '<span class="spinner"></span> Probando conexión con Google AI Studio...';
          }

          try {
            await window.Studia.gemini.testConnection();
            if (keyStatus) {
              keyStatus.innerHTML = '<span class="text-green">✅ ¡Conexión con Gemini verificada con éxito!</span>';
            }
          } catch (err) {
            if (keyStatus) {
              keyStatus.innerHTML = `<span class="text-red">❌ Error: ${err.message}</span>`;
            }
          }
        });
      }
    }

    openSettingsModal() {
      const modal = document.getElementById('settings-modal');
      const apiKeyInput = document.getElementById('settings-api-key');
      const modelSelect = document.getElementById('settings-model-select');
      const keyStatus = document.getElementById('key-test-status');

      if (apiKeyInput) apiKeyInput.value = window.Studia.gemini.getApiKey();
      if (modelSelect) modelSelect.value = window.Studia.gemini.getModel();
      if (keyStatus) keyStatus.innerHTML = '';
      if (modal) modal.classList.remove('hidden');
    }

    setupAgentEditor() {
      const modal = document.getElementById('agent-editor-modal');
      const btnOpen = document.getElementById('btn-open-agents');
      const btnClose = document.getElementById('btn-close-agents');
      const btnSave = document.getElementById('btn-save-agent');
      const agentSelector = document.getElementById('agent-file-select');
      const textarea = document.getElementById('agent-prompt-textarea');

      const loadAgent = async () => {
        if (!agentSelector || !textarea) return;
        const file = agentSelector.value;
        try {
          const content = await window.Studia.fs.readTextFile(file);
          textarea.value = content;
        } catch (e) {
          textarea.value = '';
          console.warn('Error leyendo agente:', e);
        }
      };

      if (btnOpen && modal) {
        btnOpen.addEventListener('click', async () => {
          if (!window.Studia.fs.rootHandle) {
            alert('Abre primero la carpeta del proyecto.');
            return;
          }
          await loadAgent();
          modal.classList.remove('hidden');
        });
      }

      if (btnClose && modal) {
        btnClose.addEventListener('click', () => modal.classList.add('hidden'));
      }

      if (agentSelector) {
        agentSelector.addEventListener('change', () => loadAgent());
      }

      if (btnSave && textarea && agentSelector) {
        btnSave.addEventListener('click', async () => {
          try {
            const file = agentSelector.value;
            const content = textarea.value;
            await window.Studia.fs.writeTextFile(file, content);
            this.showToast(`Instrucciones de ${file} actualizadas`, 'success');
            if (modal) modal.classList.add('hidden');
          } catch (err) {
            alert(`Error guardando agente: ${err.message}`);
          }
        });
      }
    }

    setupLayoutControls() {
      // Toggle sidebars for compact view
      const toggleLeft = document.getElementById('btn-toggle-left-panel');
      const toggleRight = document.getElementById('btn-toggle-right-panel');
      const leftPanel = document.getElementById('left-panel');
      const rightPanel = document.getElementById('right-panel');

      if (toggleLeft && leftPanel) {
        toggleLeft.addEventListener('click', () => {
          leftPanel.classList.toggle('collapsed');
        });
      }
      if (toggleRight && rightPanel) {
        toggleRight.addEventListener('click', () => {
          rightPanel.classList.toggle('collapsed');
        });
      }
    }

    showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.textContent = message;

      container.appendChild(toast);
      setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 400);
      }, 3500);
    }
  }

  window.Studia = window.Studia || {};
  window.Studia.app = new StudiaApp();

  document.addEventListener('DOMContentLoaded', () => {
    window.Studia.app.init();
  });
})(window);
