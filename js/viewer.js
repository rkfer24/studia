/**
 * Studia — Integrated PDF & Markdown Document Viewer
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
      this.currentBlobUrl = null;
      this.currentPdfPath = null;
      this.currentPage = 1;
    }

    init() {
      this.modal = document.getElementById('viewer-modal');
      this.iframe = document.getElementById('viewer-iframe');
      this.mdViewer = document.getElementById('viewer-md-content');
      this.titleEl = document.getElementById('viewer-title');
      this.openExternalBtn = document.getElementById('viewer-open-external');
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

    async openPdf(relativePath, pageNumber = 1) {
      if (!window.Studia.fs.rootHandle) {
        alert('Debes abrir primero la carpeta del proyecto.');
        return;
      }

      try {
        const fullSourcePath = relativePath.startsWith('fuentes/')
          ? relativePath
          : `fuentes/${relativePath}`;

        const blob = await window.Studia.fs.getFileBlob(fullSourcePath);
        
        // Revoke previous blob url if exists
        if (this.currentBlobUrl) {
          URL.revokeObjectURL(this.currentBlobUrl);
        }

        this.currentBlobUrl = URL.createObjectURL(blob);
        this.currentPdfPath = relativePath;
        this.currentPage = pageNumber || 1;

        if (this.titleEl) {
          this.titleEl.innerHTML = `<span class="icon">📄</span> <span class="doc-name">${relativePath}</span> <span class="badge">Página ${this.currentPage}</span>`;
        }

        if (this.iframe && this.mdViewer) {
          this.mdViewer.classList.add('hidden');
          this.iframe.classList.remove('hidden');
          this.iframe.src = `${this.currentBlobUrl}#page=${this.currentPage}&view=FitH`;
        }

        if (this.openExternalBtn) {
          this.openExternalBtn.style.display = 'inline-flex';
        }

        this.modal.classList.remove('hidden');
      } catch (err) {
        console.error('Error al abrir PDF:', err);
        alert(`No se pudo abrir el archivo PDF "${relativePath}": ${err.message}`);
      }
    }

    async openMarkdown(relativePath, title = '') {
      try {
        const text = await window.Studia.fs.readTextFile(relativePath);
        if (this.titleEl) {
          this.titleEl.innerHTML = `<span class="icon">📝</span> <span class="doc-name">${title || relativePath}</span>`;
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
    }
  }

  window.Studia = window.Studia || {};
  window.Studia.viewer = new StudiaViewer();
})(window);
