/**
 * Studia — Central Console & AI Tutor Chat Module
 */
(function(window) {
  'use strict';

  class StudiaChat {
    constructor() {
      this.messagesContainer = null;
      this.inputEl = null;
      this.sendBtn = null;
      this.newChatBtn = null;
      this.history = []; // in-memory session only
      this.isGenerating = false;
    }

    init() {
      this.messagesContainer = document.getElementById('chat-messages');
      this.inputEl = document.getElementById('chat-input');
      this.sendBtn = document.getElementById('btn-chat-send');
      this.newChatBtn = document.getElementById('btn-new-chat');

      if (this.sendBtn) {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
      }

      if (this.inputEl) {
        this.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
          }
        });
      }

      if (this.newChatBtn) {
        this.newChatBtn.addEventListener('click', () => this.resetChat());
      }

      // Delegate citation chips clicks
      if (this.messagesContainer) {
        this.messagesContainer.addEventListener('click', (e) => {
          const chip = e.target.closest('.ref-chip');
          if (chip) {
            const file = chip.getAttribute('data-file');
            const page = parseInt(chip.getAttribute('data-page') || '1', 10);
            window.Studia.viewer.openPdf(file, page);
          }
        });
      }

      // Quick prompt chips
      document.querySelectorAll('.quick-prompt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (this.inputEl) {
            this.inputEl.value = btn.getAttribute('data-prompt') || btn.textContent;
            this.inputEl.focus();
          }
        });
      });
    }

    resetChat() {
      if (this.isGenerating) return;
      this.history = [];
      if (this.messagesContainer) {
        this.messagesContainer.innerHTML = `
          <div class="chat-welcome">
            <div class="welcome-icon">🎓</div>
            <h2>Consola de Estudio Inteligente</h2>
            <p>Pregunta cualquier duda sobre tus fuentes seleccionadas. El tutor responderá citando directamente las páginas del PDF original.</p>
            <div class="quick-prompts">
              <button class="quick-prompt-btn" data-prompt="Resume los conceptos clave de los temas seleccionados">📌 Resumen de conceptos clave</button>
              <button class="quick-prompt-btn" data-prompt="¿Cuáles son las definiciones más importantes y en qué páginas se encuentran?">📖 Definiciones clave y páginas</button>
              <button class="quick-prompt-btn" data-prompt="Explícame paso a paso el tema principal como si tuviera que explicárselo a un colega">💡 Explicación pedagógica paso a paso</button>
            </div>
          </div>
        `;
        // Re-attach quick prompt events
        this.messagesContainer.querySelectorAll('.quick-prompt-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            if (this.inputEl) {
              this.inputEl.value = btn.getAttribute('data-prompt');
              this.sendMessage();
            }
          });
        });
      }
    }

    /**
     * Converts raw text or markdown into HTML, replacing [ref:file#page] with interactive chips
     */
    renderWithCitations(rawMarkdown) {
      // 1. Process [ref:file#page] citations into custom HTML chips before or after markdown
      // Matches: [ref:path/to/doc.pdf#14] or [ref:doc.pdf#14] or [ref:doc.pdf]
      const refRegex = /\[ref:([^\]#]+)(?:#(\d+))?\]/g;
      const parsedWithPlaceholders = rawMarkdown.replace(refRegex, (match, filePath, pageNum) => {
        const cleanFile = filePath.trim();
        const page = pageNum ? pageNum.trim() : '1';
        const displayFileName = cleanFile.split('/').pop();
        return `<button type="button" class="ref-chip" data-file="${cleanFile}" data-page="${page}" title="Abrir ${cleanFile} en la página ${page}"><span class="chip-icon">📄</span> <span class="chip-name">${displayFileName}</span> <span class="chip-page">p. ${page}</span></button>`;
      });

      if (window.marked && typeof window.marked.parse === 'function') {
        return window.marked.parse(parsedWithPlaceholders);
      }
      return parsedWithPlaceholders.replace(/\n/g, '<br>');
    }

    appendMessage(role, initialText = '') {
      // Clear welcome message if present
      const welcome = this.messagesContainer.querySelector('.chat-welcome');
      if (welcome) welcome.remove();

      const msgEl = document.createElement('div');
      msgEl.className = `chat-message message-${role}`;

      const avatar = role === 'user' ? '👤' : '🧠';
      const roleName = role === 'user' ? 'Tú' : 'Tutor IA';

      msgEl.innerHTML = `
        <div class="message-header">
          <span class="message-avatar">${avatar}</span>
          <span class="message-author">${roleName}</span>
          <span class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="message-body">${this.renderWithCitations(initialText)}</div>
      `;

      this.messagesContainer.appendChild(msgEl);
      this.scrollToBottom();
      return msgEl.querySelector('.message-body');
    }

    scrollToBottom() {
      if (this.messagesContainer) {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      }
    }

    async sendMessage() {
      if (this.isGenerating) return;
      const text = (this.inputEl ? this.inputEl.value : '').trim();
      if (!text) return;

      if (!window.Studia.gemini.hasKey()) {
        alert('Configura primero tu Gemini API Key en Ajustes (icono ⚙️).');
        return;
      }

      this.inputEl.value = '';
      this.isGenerating = true;
      if (this.sendBtn) this.sendBtn.disabled = true;

      // 1. Add user message
      this.appendMessage('user', text);
      this.history.push({ role: 'user', content: text });

      // 2. Prepare assistant placeholder
      const assistantBody = this.appendMessage('assistant', 'Pensando...');
      assistantBody.classList.add('streaming');

      try {
        // Load tutor prompt
        let tutorPrompt = '';
        try {
          tutorPrompt = await window.Studia.fs.readTextFile('agentes/tutor.md');
        } catch (e) {
          tutorPrompt = 'Eres un tutor riguroso. Cita siempre tus fuentes con [ref:archivo.pdf#pagina].';
        }

        // Load active sources
        const sources = await window.Studia.sources.getSelectedSourcesContent();

        let sourcesContext = '';
        if (sources.length > 0) {
          sourcesContext = '\n\n=== FUENTES DE ESTUDIO DISPONIBLES ===\n';
          sources.forEach((src, idx) => {
            sourcesContext += `\n--- FUENTE [${idx + 1}]: "${src.pdfPath}" ---\n${src.text}\n`;
          });
          sourcesContext += '\n=== FIN DE FUENTES ===\n';
        } else {
          sourcesContext = '\n[AVISO: No hay ninguna fuente seleccionada actualmente en el panel izquierdo. Si el usuario pregunta por materias específicas, recuérdale marcar sus fuentes.]\n';
        }

        const systemInstruction = `${tutorPrompt}\n\n${sourcesContext}`;

        // Build Gemini contents array from history
        const contents = this.history.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        }));

        let accumulated = '';
        assistantBody.innerHTML = '<span class="typing-indicator"><span></span><span></span><span></span></span>';

        await window.Studia.gemini.streamGenerate({
          systemInstruction,
          contents,
          onChunk: (chunk, fullText) => {
            accumulated = fullText;
            assistantBody.innerHTML = this.renderWithCitations(fullText);
            this.scrollToBottom();
          }
        });

        assistantBody.classList.remove('streaming');
        if (!accumulated) {
          assistantBody.innerHTML = '<em>No se recibió respuesta del modelo.</em>';
        }
        this.history.push({ role: 'assistant', content: accumulated });
      } catch (err) {
        console.error('Error en el chat:', err);
        assistantBody.innerHTML = `<div class="error-inline">❌ Error: ${err.message}</div>`;
      } finally {
        this.isGenerating = false;
        if (this.sendBtn) this.sendBtn.disabled = false;
        if (this.inputEl) this.inputEl.focus();
      }
    }
  }

  window.Studia = window.Studia || {};
  window.Studia.chat = new StudiaChat();
})(window);
