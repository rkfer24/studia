/**
 * Studia — Integrated PDF & Markdown Document Viewer with Quote Highlighting
 */
(function(window) {
  'use strict';

  class StudiaViewer {
    constructor() {
      this.modal = null;
      this.iframe = null;
      this.mdViewer = null;
      this.titleEl = null;
      this.openExternalBtn = null;
      this.toggleModeBtn = null;
      this.contextBanner = null;
      this.contextPageEl = null;
      this.contextQuoteEl = null;

      this.currentBlobUrl = null;
      this.currentPdfPath = null;
      this.currentPage = 1;
      this.currentQuote = '';
      this.currentMode = 'pdf'; // 'pdf' | 'md'
    }

    init() {
      this.modal = document.getElementById('viewer-modal');
      this.iframe = document.getElementById('viewer-iframe');
      this.mdViewer = document.getElementById('viewer-md-content');
      this.titleEl = document.getElementById('viewer-title');
      this.openExternalBtn = document.getElementById('viewer-open-external');
      this.toggleModeBtn = document.getElementById('viewer-toggle-mode-btn');
      this.contextBanner = document.getElementById('viewer-context-banner');
      this.contextPageEl = document.getElementById('viewer-context-page');
      this.contextQuoteEl = document.getElementById('viewer-context-quote');
      const closeBtn = document.getElementById('viewer-close-btn');

      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.close());
      }

      if (this.openExternalBtn) {
        this.openExternalBtn.addEventListener('click', () => {
          if (this.currentBlobUrl) {
            window.open(`${this.currentBlobUrl}#page=${this.currentPage}`, '_blank');
          }
        });
      }

      if (this.toggleModeBtn) {
        this.toggleModeBtn.addEventListener('click', () => this.toggleMode());
      }

      // Close on backdrop click or ESC key
      if (this.modal) {
        this.modal.addEventListener('click', (e) => {
          if (e.target === this.modal) this.close();
        });
      }
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen()) {
          this.close();
        }
      });
    }

    isOpen() {
      return this.modal && !this.modal.classList.contains('hidden');
    }

    async openPdf(relativePath, pageNumber = 1, quote = '') {
      if (!window.Studia.fs.rootHandle) {
        alert('Debes abrir primero la carpeta del proyecto.');
        return;
      }

      const cleanRel = (relativePath || '').replace(/^fuentes\//, '');
      const fullSourcePath = `fuentes/${cleanRel}`;

      try {
        const blob = await window.Studia.fs.getFileBlob(fullSourcePath);
        
        // Revoke previous blob url if exists
        if (this.currentBlobUrl) {
          URL.revokeObjectURL(this.currentBlobUrl);
        }

        this.currentBlobUrl = URL.createObjectURL(blob);
        this.currentPdfPath = cleanRel;
        this.currentPage = pageNumber || 1;
        this.currentQuote = (quote || '').trim();
        this.currentMode = 'pdf';

        if (this.titleEl) {
          this.titleEl.innerHTML = `<span class="icon">📄</span> <span class="doc-name">${cleanRel}</span> <span class="badge">Página ${this.currentPage}</span>`;
        }

        // Show context banner if quote is available
        if (this.contextBanner && this.contextQuoteEl) {
          if (this.currentQuote) {
            if (this.contextPageEl) this.contextPageEl.textContent = this.currentPage;
            this.contextQuoteEl.textContent = `«${this.currentQuote}»`;
            this.contextBanner.classList.remove('hidden');
          } else {
            this.contextBanner.classList.add('hidden');
          }
        }

        // Search query for Chrome's native PDF reader
        let searchParam = '';
        if (this.currentQuote) {
          const words = this.currentQuote
            .replace(/[^\wáéíóúÁÉÍÓÚñÑ\s]/gi, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 4)
            .slice(0, 3)
            .join(' ');
          if (words) {
            searchParam = `&search=${encodeURIComponent(words)}`;
          }
        }

        if (this.iframe && this.mdViewer) {
          this.mdViewer.classList.add('hidden');
          this.iframe.classList.remove('hidden');
          this.iframe.src = `${this.currentBlobUrl}#page=${this.currentPage}${searchParam}&view=FitH`;
        }

        if (this.toggleModeBtn) {
          this.toggleModeBtn.style.display = 'inline-flex';
          this.toggleModeBtn.textContent = '📝 Ver texto resaltado';
        }

        if (this.openExternalBtn) {
          this.openExternalBtn.style.display = 'inline-flex';
        }

        this.modal.classList.remove('hidden');
      } catch (err) {
        console.error('Error al abrir PDF:', err);
        alert(`No se pudo abrir el archivo PDF "${cleanRel}": ${err.message}`);
      }
    }

    async toggleMode() {
      if (this.currentMode === 'pdf') {
        this.currentMode = 'md';
        if (this.toggleModeBtn) this.toggleModeBtn.textContent = '📄 Ver PDF original';
        await this.renderMarkdownWithHighlight();
      } else {
        this.currentMode = 'pdf';
        if (this.toggleModeBtn) this.toggleModeBtn.textContent = '📝 Ver texto resaltado';
        if (this.iframe && this.mdViewer) {
          this.mdViewer.classList.add('hidden');
          this.iframe.classList.remove('hidden');
        }
      }
    }

    async renderMarkdownWithHighlight() {
      if (!this.currentPdfPath) return;
      const transcriptPath = `.studia/transcripciones/${this.currentPdfPath.replace(/\.pdf$/i, '.md')}`;

      try {
        let text = await window.Studia.fs.readTextFile(transcriptPath);

        // Highlight quote in markdown text if present
        if (this.currentQuote) {
          const cleanQuote = this.currentQuote.trim();
          // Escape regex characters
          const escaped = cleanQuote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(${escaped})`, 'i');

          if (regex.test(text)) {
            text = text.replace(regex, `<mark class="quote-highlight" id="highlighted-target">$1</mark>`);
          } else {
            // Try matching first 20-30 chars if full quote has minor differences
            const snippet = cleanQuote.slice(0, 35).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (snippet.length > 8) {
              const snippetRegex = new RegExp(`(${snippet}[^\\n.?!]*)`, 'i');
              if (snippetRegex.test(text)) {
                text = text.replace(snippetRegex, `<mark class="quote-highlight" id="highlighted-target">$1</mark>`);
              }
            }
          }
        }

        if (this.iframe && this.mdViewer) {
          this.iframe.classList.add('hidden');
          this.mdViewer.classList.remove('hidden');

          if (window.marked && typeof window.marked.parse === 'function') {
            this.mdViewer.innerHTML = window.marked.parse(text);
          } else {
            this.mdViewer.innerHTML = text.replace(/\n/g, '<br>');
          }

          // Smooth scroll to highlighted target
          setTimeout(() => {
            const target = this.mdViewer.querySelector('#highlighted-target');
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 120);
        }
      } catch (err) {
        console.warn('No se encontró transcripción MD:', err);
        if (this.mdViewer) {
          this.mdViewer.innerHTML = `<div class="error-inline">Este archivo no tiene transcripción Markdown aún.</div>`;
        }
      }
    }

    async openMarkdown(relativePath, title = '') {
      try {
        const text = await window.Studia.fs.readTextFile(relativePath);
        if (this.titleEl) {
          this.titleEl.innerHTML = `<span class="icon">📝</span> <span class="doc-name">${title || relativePath}</span>`;
        }

        if (this.contextBanner) {
          this.contextBanner.classList.add('hidden');
        }

        if (this.iframe && this.mdViewer) {
          this.iframe.classList.add('hidden');
          this.mdViewer.classList.remove('hidden');
          
          if (window.marked && typeof window.marked.parse === 'function') {
            this.mdViewer.innerHTML = window.marked.parse(text);
          } else {
            this.mdViewer.textContent = text;
          }
        }

        if (this.toggleModeBtn) {
          this.toggleModeBtn.style.display = 'none';
        }

        if (this.openExternalBtn) {
          this.openExternalBtn.style.display = 'none';
        }

        this.modal.classList.remove('hidden');
      } catch (err) {
        console.error('Error al abrir Markdown:', err);
        alert(`No se pudo leer el archivo: ${err.message}`);
      }
    }

    close() {
      if (this.modal) {
        this.modal.classList.add('hidden');
      }
      if (this.iframe) {
        this.iframe.src = 'about:blank';
      }
      if (this.contextBanner) {
        this.contextBanner.classList.add('hidden');
      }
    }
  }

  window.Studia = window.Studia || {};
  window.Studia.viewer = new StudiaViewer();
})(window);
