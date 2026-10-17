/**
 * Studia — Sources Explorer & Transcription Manager
 */
(function(window) {
  'use strict';

  class StudiaSources {
    constructor() {
      this.treeContainer = null;
      this.selectedPaths = new Set();
      this.sourcesList = [];
      this.isTranscribing = false;
    }

    init() {
      this.treeContainer = document.getElementById('sources-tree');
      const refreshBtn = document.getElementById('btn-refresh-sources');
      const selectAllBtn = document.getElementById('btn-select-all-sources');
      const deselectAllBtn = document.getElementById('btn-deselect-all-sources');

      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this.refresh());
      }
      if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => this.selectAll(true));
      }
      if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => this.selectAll(false));
      }
    }

    async refresh() {
      if (!window.Studia.fs.rootHandle) return;
      if (!this.treeContainer) return;

      this.treeContainer.innerHTML = '<div class="loading-state"><span class="spinner"></span> Leyendo carpeta fuentes/...</div>';

      try {
        const tree = await window.Studia.fs.listSourcesTree();
        this.sourcesList = tree;

        if (tree.length === 0) {
          this.treeContainer.innerHTML = `
            <div class="empty-state">
              <span class="empty-icon">📂</span>
              <p>No se encontraron archivos en <code>fuentes/</code>.</p>
              <small>Copia tus PDFs o carpetas de apuntes dentro de la carpeta <code>fuentes/</code> y pulsa Refrescar.</small>
            </div>
          `;
          this.updateContextCounter();
          return;
        }

        this.treeContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();
        this.renderTreeNodes(tree, fragment);
        this.treeContainer.appendChild(fragment);

        this.updateContextCounter();
      } catch (err) {
        console.error('Error al leer fuentes:', err);
        this.treeContainer.innerHTML = `<div class="error-state">Error leyendo fuentes: ${err.message}</div>`;
      }
    }

    renderTreeNodes(nodes, container, depth = 0) {
      nodes.forEach(node => {
        if (node.kind === 'directory') {
          const folderEl = document.createElement('div');
          folderEl.className = 'tree-item tree-folder';
          folderEl.style.paddingLeft = `${depth * 14 + 8}px`;

          folderEl.innerHTML = `
            <div class="folder-header">
              <span class="folder-toggle">▼</span>
              <span class="folder-icon">📁</span>
              <span class="folder-name">${node.name}</span>
            </div>
          `;

          const childrenContainer = document.createElement('div');
          childrenContainer.className = 'tree-children';
          this.renderTreeNodes(node.children, childrenContainer, depth + 1);

          const toggleBtn = folderEl.querySelector('.folder-header');
          toggleBtn.addEventListener('click', () => {
            const isCollapsed = childrenContainer.classList.toggle('collapsed');
            folderEl.querySelector('.folder-toggle').textContent = isCollapsed ? '▶' : '▼';
          });

          container.appendChild(folderEl);
          container.appendChild(childrenContainer);
        } else {
          const fileEl = document.createElement('div');
          fileEl.className = `tree-item tree-file ${node.isTranscribed ? 'transcribed' : 'pending'}`;
          fileEl.style.paddingLeft = `${depth * 14 + 8}px`;

          const isChecked = this.selectedPaths.has(node.path);
          const sizeKb = (node.size / 1024).toFixed(0);

          fileEl.innerHTML = `
            <label class="file-label">
              <input type="checkbox" class="source-checkbox" data-path="${node.path}" ${isChecked ? 'checked' : ''} ${!node.isTranscribed ? 'title="Transcribe primero el archivo para poder usarlo en consultas"' : ''}>
              <span class="file-icon">${node.isPdf ? '📄' : '📝'}</span>
              <span class="file-name" title="${node.path}">${node.name}</span>
              <span class="file-size">${sizeKb} KB</span>
            </label>
            <div class="file-actions">
              ${node.isPdf ? `
                <button class="btn-icon btn-view-pdf" title="Abrir PDF original">👁️</button>
                <button class="btn-icon btn-transcribe ${node.isTranscribed ? 're' : ''}" title="${node.isTranscribed ? 'Volver a transcribir con IA' : 'Transcribir a Markdown con Gemini'}">
                  ${node.isTranscribed ? '🔄' : '⚡'}
                </button>
              ` : ''}
              ${node.isTranscribed ? `
                <button class="btn-icon btn-view-md" title="Ver transcripción Markdown">📝</button>
              ` : ''}
            </div>
          `;

          // Checkbox handler
          const cb = fileEl.querySelector('.source-checkbox');
          cb.addEventListener('change', (e) => {
            if (e.target.checked) {
              this.selectedPaths.add(node.path);
            } else {
              this.selectedPaths.delete(node.path);
            }
            this.updateContextCounter();
          });

          // PDF viewer button
          const viewPdfBtn = fileEl.querySelector('.btn-view-pdf');
          if (viewPdfBtn) {
            viewPdfBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              window.Studia.viewer.openPdf(node.path, 1);
            });
          }

          // Transcribe button
          const transcribeBtn = fileEl.querySelector('.btn-transcribe');
          if (transcribeBtn) {
            transcribeBtn.addEventListener('click', async (e) => {
              e.stopPropagation();
              await this.transcribeFile(node);
            });
          }

          // View MD button
          const viewMdBtn = fileEl.querySelector('.btn-view-md');
          if (viewMdBtn) {
            viewMdBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              window.Studia.viewer.openMarkdown(node.transcriptPath, `Transcripción: ${node.name}`);
            });
          }

          container.appendChild(fileEl);
        }
      });
    }

    async transcribeFile(node) {
      if (this.isTranscribing) {
        alert('Ya hay una transcripción en proceso. Espera a que termine.');
        return;
      }

      if (!window.Studia.gemini.hasKey()) {
        alert('Debes configurar tu Gemini API Key en Ajustes (icono ⚙️) antes de transcribir.');
        return;
      }

      const confirmMsg = node.isTranscribed
        ? `"${node.name}" ya está transcrito. ¿Quieres volver a procesarlo con Gemini y sobrescribir la versión actual?`
        : `¿Transcribir "${node.name}" a Markdown con Gemini?\nSe incluirán marcadores de página (<!-- page: N -->) para citas exactas.`;

      if (!confirm(confirmMsg)) return;

      this.isTranscribing = true;
      const statusEl = document.getElementById('transcribe-status-bar');
      if (statusEl) {
        statusEl.classList.remove('hidden');
        statusEl.innerHTML = `<span class="spinner"></span> Transcribiendo <b>${node.name}</b> con Gemini... esto puede tardar unos segundos.`;
      }

      try {
        const fullSourcePath = `fuentes/${node.path}`;
        const blob = await window.Studia.fs.getFileBlob(fullSourcePath);

        const transcribedMd = await window.Studia.gemini.transcribePdf(blob, node.path);

        // Header metadata
        const fileContent = `---
source: fuentes/${node.path}
transcribedAt: ${new Date().toISOString()}
model: ${window.Studia.gemini.getModel()}
---

${transcribedMd}`;

        await window.Studia.fs.writeTextFile(node.transcriptPath, fileContent);

        // Auto-select the newly transcribed document
        this.selectedPaths.add(node.path);

        if (statusEl) {
          statusEl.innerHTML = `✅ <b>${node.name}</b> transcrito correctamente.`;
          setTimeout(() => statusEl.classList.add('hidden'), 4000);
        }

        await this.refresh();
      } catch (err) {
        console.error('Error en transcripción:', err);
        alert(`Error al transcribir "${node.name}": ${err.message}`);
        if (statusEl) {
          statusEl.innerHTML = `❌ Error transcribiendo <b>${node.name}</b>: ${err.message}`;
        }
      } finally {
        this.isTranscribing = false;
      }
    }

    selectAll(select = true) {
      const flattenFiles = (nodes) => {
        let files = [];
        nodes.forEach(n => {
          if (n.kind === 'file') files.push(n);
          else if (n.children) files = files.concat(flattenFiles(n.children));
        });
        return files;
      };

      const allFiles = flattenFiles(this.sourcesList);
      allFiles.forEach(file => {
        if (select) {
          if (file.isTranscribed) this.selectedPaths.add(file.path);
        } else {
          this.selectedPaths.delete(file.path);
        }
      });

      this.refresh();
    }

    updateContextCounter() {
      const badge = document.getElementById('sources-count-badge');
      if (badge) {
        badge.textContent = `${this.selectedPaths.size} seleccionada${this.selectedPaths.size === 1 ? '' : 's'}`;
      }
    }

    /**
     * Gathers all transcribed texts of currently checked sources
     * Returns an array of objects: { path, pdfPath, text }
     */
    async getSelectedSourcesContent() {
      const results = [];
      for (const relPath of this.selectedPaths) {
        const transcriptPath = `.studia/transcripciones/${relPath.replace(/\.pdf$/i, '.md')}`;
        try {
          const text = await window.Studia.fs.readTextFile(transcriptPath);
          results.push({
            path: relPath,
            pdfPath: relPath,
            text
          });
        } catch (e) {
          console.warn(`No se pudo leer transcripción de ${relPath}:`, e);
        }
      }
      return results;
    }
  }

  window.Studia = window.Studia || {};
  window.Studia.sources = new StudiaSources();
})(window);
