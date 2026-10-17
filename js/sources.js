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

    /**
     * Recursively retrieves all files under a folder node
     */
    getFolderFiles(folderNode) {
      let files = [];
      if (!folderNode.children) return files;
      for (const child of folderNode.children) {
        if (child.kind === 'file') {
          files.push(child);
        } else if (child.kind === 'directory') {
          files = files.concat(this.getFolderFiles(child));
        }
      }
      return files;
    }

    renderTreeNodes(nodes, container, depth = 0) {
      nodes.forEach(node => {
        if (node.kind === 'directory') {
          const folderEl = document.createElement('div');
          folderEl.className = 'tree-item tree-folder';
          folderEl.style.paddingLeft = `${depth * 14 + 8}px`;

          const descFiles = this.getFolderFiles(node);
          const hasFiles = descFiles.length > 0;
          const allTranscribed = hasFiles && descFiles.every(f => f.isTranscribed);
          const pendingFiles = descFiles.filter(f => !f.isTranscribed);
          const transcribedCount = descFiles.filter(f => f.isTranscribed).length;
          const allSelected = allTranscribed && descFiles.every(f => this.selectedPaths.has(f.path));
          const someSelected = descFiles.some(f => this.selectedPaths.has(f.path));

          folderEl.innerHTML = `
            <div class="folder-header">
              <span class="folder-toggle">▼</span>
              ${allTranscribed ? `
                <input type="checkbox" class="folder-checkbox" title="Seleccionar o deseleccionar toda la carpeta" ${allSelected ? 'checked' : ''}>
              ` : ''}
              <span class="folder-icon">📁</span>
              <span class="folder-name">${node.name}</span>
              ${hasFiles ? `
                <span class="folder-badge ${allTranscribed ? 'badge-ready' : 'badge-pending'}" title="${allTranscribed ? 'Todos los archivos transformados a MD' : `${pendingFiles.length} pendiente(s) de transformar`}">
                  ${transcribedCount}/${descFiles.length} md
                </span>
              ` : ''}
              <div class="folder-actions">
                ${allTranscribed ? `
                  <button class="btn-icon btn-retranscribe-folder" title="Recargar / Volver a transcribir los ${descFiles.length} archivos a Markdown">🔄</button>
                ` : hasFiles ? `
                  <button class="btn-icon btn-transcribe-folder" title="Transformar a Markdown los ${pendingFiles.length} archivos pendientes de esta carpeta">⚡</button>
                ` : ''}
              </div>
            </div>
          `;

          const childrenContainer = document.createElement('div');
          childrenContainer.className = 'tree-children';
          this.renderTreeNodes(node.children, childrenContainer, depth + 1);

          // Handle folder collapse/expand (clicking anywhere except checkbox or buttons)
          const folderHeader = folderEl.querySelector('.folder-header');
          folderHeader.addEventListener('click', (e) => {
            if (e.target.closest('.folder-checkbox') || e.target.closest('.folder-actions')) {
              return;
            }
            const isCollapsed = childrenContainer.classList.toggle('collapsed');
            folderEl.querySelector('.folder-toggle').textContent = isCollapsed ? '▶' : '▼';
          });

          // Handle folder-level checkbox (only present if allTranscribed === true)
          const folderCb = folderEl.querySelector('.folder-checkbox');
          if (folderCb) {
            folderCb.indeterminate = someSelected && !allSelected;
            folderCb.addEventListener('click', (e) => e.stopPropagation());
            folderCb.addEventListener('change', (e) => {
              e.stopPropagation();
              const checkAll = e.target.checked;
              descFiles.forEach(f => {
                if (checkAll) {
                  this.selectedPaths.add(f.path);
                } else {
                  this.selectedPaths.delete(f.path);
                }
              });
              this.refresh();
            });
          }

          // Handle batch folder transcription (⚡)
          const btnTranscribeFolder = folderEl.querySelector('.btn-transcribe-folder');
          if (btnTranscribeFolder) {
            btnTranscribeFolder.addEventListener('click', async (e) => {
              e.stopPropagation();
              await this.transcribeFolder(node);
            });
          }

          // Handle folder refresh/retranscription (🔄)
          const btnRetranscribeFolder = folderEl.querySelector('.btn-retranscribe-folder');
          if (btnRetranscribeFolder) {
            btnRetranscribeFolder.addEventListener('click', async (e) => {
              e.stopPropagation();
              await this.retranscribeFolder(node);
            });
          }

          container.appendChild(folderEl);
          container.appendChild(childrenContainer);
        } else {
          // File node
          const fileEl = document.createElement('div');
          fileEl.className = `tree-item tree-file ${node.isTranscribed ? 'transcribed' : 'pending'}`;
          fileEl.style.paddingLeft = `${depth * 14 + 8}px`;

          const isChecked = this.selectedPaths.has(node.path);
          const sizeKb = (node.size / 1024).toFixed(0);

          if (node.isTranscribed) {
            // Ya es Markdown: SELECCIONAR, VISUALIZAR Y RECARGAR MD
            fileEl.innerHTML = `
              <label class="file-label">
                <input type="checkbox" class="source-checkbox" data-path="${node.path}" ${isChecked ? 'checked' : ''}>
                <span class="file-icon">📝</span>
                <span class="file-name" title="${node.path}">${node.name}</span>
                <span class="file-size">${sizeKb} KB</span>
              </label>
              <div class="file-actions">
                ${node.isPdf ? `
                  <button class="btn-icon btn-view-pdf" title="Visualizar PDF original">👁️</button>
                ` : ''}
                <button class="btn-icon btn-view-md" title="Visualizar transcripción Markdown">📝</button>
                ${node.isPdf ? `
                  <button class="btn-icon btn-transcribe re" title="Recargar / Volver a transcribir con Gemini">🔄</button>
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
              this.updateFolderCheckboxStates();
            });

            // View Markdown button
            const viewMdBtn = fileEl.querySelector('.btn-view-md');
            if (viewMdBtn) {
              viewMdBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.Studia.viewer.openMarkdown(node.transcriptPath, `Transcripción: ${node.name}`);
              });
            }

            // PDF viewer button
            const viewPdfBtn = fileEl.querySelector('.btn-view-pdf');
            if (viewPdfBtn) {
              viewPdfBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.Studia.viewer.openPdf(node.path, 1);
              });
            }

            // Reload / retranscribe button
            const transcribeBtn = fileEl.querySelector('.btn-transcribe');
            if (transcribeBtn) {
              transcribeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.transcribeFile(node);
              });
            }
          } else {
            // No es aún Markdown: NO SE PUEDE SELECCIONAR. SOLO VISUALIZAR Y TRANSFORMAR A MD
            fileEl.innerHTML = `
              <div class="file-label file-pending">
                <span class="file-icon">📄</span>
                <span class="file-name text-muted" title="${node.path}">${node.name}</span>
                <span class="badge badge-untranscribed" title="Transforma a Markdown antes de poder seleccionarlo">PDF</span>
              </div>
              <div class="file-actions">
                <button class="btn-icon btn-view-pdf" title="Visualizar PDF original">👁️</button>
                <button class="btn-icon btn-transcribe" title="Transformar a Markdown con Gemini">⚡</button>
              </div>
            `;

            // PDF viewer button
            const viewPdfBtn = fileEl.querySelector('.btn-view-pdf');
            if (viewPdfBtn) {
              viewPdfBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.Studia.viewer.openPdf(node.path, 1);
              });
            }

            // Transform to MD button
            const transcribeBtn = fileEl.querySelector('.btn-transcribe');
            if (transcribeBtn) {
              transcribeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.transcribeFile(node);
              });
            }
          }

          container.appendChild(fileEl);
        }
      });
    }

    updateFolderCheckboxStates() {
      // Re-evaluate folder checkboxes to reflect indeterminate or checked state
      const folderEls = this.treeContainer.querySelectorAll('.tree-folder');
      folderEls.forEach(folderEl => {
        const folderCb = folderEl.querySelector('.folder-checkbox');
        if (!folderCb) return;
        const fileCheckboxes = folderEl.querySelectorAll('.tree-children .source-checkbox');
        if (fileCheckboxes.length === 0) return;

        const total = fileCheckboxes.length;
        const checkedCount = Array.from(fileCheckboxes).filter(cb => cb.checked).length;

        folderCb.checked = checkedCount === total && total > 0;
        folderCb.indeterminate = checkedCount > 0 && checkedCount < total;
      });
    }

    /**
     * Core routine to transcribe a single PDF file
     */
    async doTranscribeFile(node) {
      const fullSourcePath = `fuentes/${node.path}`;
      const blob = await window.Studia.fs.getFileBlob(fullSourcePath);
      const transcribedMd = await window.Studia.gemini.transcribePdf(blob, node.path);

      const fileContent = `---
source: fuentes/${node.path}
transcribedAt: ${new Date().toISOString()}
model: ${window.Studia.gemini.getModel()}
---

${transcribedMd}`;

      await window.Studia.fs.writeTextFile(node.transcriptPath, fileContent);
      this.selectedPaths.add(node.path);
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
        ? `"${node.name}" ya está transformado a Markdown. ¿Quieres volver a procesarlo con Gemini y recargar la versión actual?`
        : `¿Transformar "${node.name}" a Markdown con Gemini?\nSe generará el archivo .md con marcadores de página (<!-- page: N -->) para habilitar su selección y consulta.`;

      if (!confirm(confirmMsg)) return;

      this.isTranscribing = true;
      const statusEl = document.getElementById('transcribe-status-bar');
      if (statusEl) {
        statusEl.classList.remove('hidden');
        statusEl.innerHTML = `<span class="spinner"></span> Transformando <b>${node.name}</b> a Markdown con Gemini...`;
      }

      try {
        await this.doTranscribeFile(node);

        if (statusEl) {
          statusEl.innerHTML = `✅ <b>${node.name}</b> transformado a Markdown.`;
          setTimeout(() => statusEl.classList.add('hidden'), 4000);
        }

        await this.refresh();
      } catch (err) {
        console.error('Error en transcripción:', err);
        alert(`Error al transformar "${node.name}": ${err.message}`);
        if (statusEl) {
          statusEl.innerHTML = `❌ Error transformando <b>${node.name}</b>: ${err.message}`;
        }
      } finally {
        this.isTranscribing = false;
      }
    }

    async transcribeFolder(folderNode) {
      if (this.isTranscribing) {
        alert('Ya hay una transcripción en proceso. Espera a que termine.');
        return;
      }

      if (!window.Studia.gemini.hasKey()) {
        alert('Debes configurar tu Gemini API Key en Ajustes (icono ⚙️) antes de transcribir.');
        return;
      }

      const descFiles = this.getFolderFiles(folderNode);
      const pendingFiles = descFiles.filter(f => !f.isTranscribed && f.isPdf);
      if (pendingFiles.length === 0) {
        alert('No hay archivos PDF pendientes de transformar en esta carpeta.');
        return;
      }

      const confirmMsg = `¿Transformar a Markdown los ${pendingFiles.length} archivos pendientes de la carpeta "${folderNode.name}" con Gemini?`;
      if (!confirm(confirmMsg)) return;

      this.isTranscribing = true;
      const statusEl = document.getElementById('transcribe-status-bar');
      if (statusEl) statusEl.classList.remove('hidden');

      try {
        for (let i = 0; i < pendingFiles.length; i++) {
          const fileNode = pendingFiles[i];
          if (statusEl) {
            statusEl.innerHTML = `<span class="spinner"></span> [${i + 1}/${pendingFiles.length}] Transformando <b>${fileNode.name}</b> a Markdown...`;
          }
          await this.doTranscribeFile(fileNode);
        }

        if (statusEl) {
          statusEl.innerHTML = `✅ Todos los archivos de la carpeta <b>${folderNode.name}</b> se transformaron a Markdown.`;
          setTimeout(() => statusEl.classList.add('hidden'), 4000);
        }
      } catch (err) {
        console.error('Error transcribiendo carpeta:', err);
        alert(`Error al transformar carpeta: ${err.message}`);
        if (statusEl) {
          statusEl.innerHTML = `❌ Error en carpeta: ${err.message}`;
        }
      } finally {
        this.isTranscribing = false;
        await this.refresh();
      }
    }

    async retranscribeFolder(folderNode) {
      if (this.isTranscribing) {
        alert('Ya hay una transcripción en proceso. Espera a que termine.');
        return;
      }

      if (!window.Studia.gemini.hasKey()) {
        alert('Debes configurar tu Gemini API Key en Ajustes (icono ⚙️) antes de transcribir.');
        return;
      }

      const descFiles = this.getFolderFiles(folderNode).filter(f => f.isPdf);
      if (descFiles.length === 0) return;

      const confirmMsg = `¿Volver a transformar a Markdown los ${descFiles.length} archivos de la carpeta "${folderNode.name}" con Gemini y recargar sus transcripciones?`;
      if (!confirm(confirmMsg)) return;

      this.isTranscribing = true;
      const statusEl = document.getElementById('transcribe-status-bar');
      if (statusEl) statusEl.classList.remove('hidden');

      try {
        for (let i = 0; i < descFiles.length; i++) {
          const fileNode = descFiles[i];
          if (statusEl) {
            statusEl.innerHTML = `<span class="spinner"></span> [${i + 1}/${descFiles.length}] Recargando <b>${fileNode.name}</b> a Markdown...`;
          }
          await this.doTranscribeFile(fileNode);
        }

        if (statusEl) {
          statusEl.innerHTML = `✅ Carpeta <b>${folderNode.name}</b> recargada por completo.`;
          setTimeout(() => statusEl.classList.add('hidden'), 4000);
        }
      } catch (err) {
        console.error('Error recargando carpeta:', err);
        alert(`Error recargando carpeta: ${err.message}`);
      } finally {
        this.isTranscribing = false;
        await this.refresh();
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
