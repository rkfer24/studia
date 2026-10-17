/**
 * Studia — File System Access API & IndexedDB Storage Module
 */
(function(window) {
  'use strict';

  const DB_NAME = 'studia_fs_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'handles';
  const ROOT_HANDLE_KEY = 'project_root';

  class StudiaFS {
    constructor() {
      this.rootHandle = null;
      this.db = null;
    }

    async init() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this);
        };
        req.onerror = () => reject(req.error);
      });
    }

    async getStoredHandle() {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(ROOT_HANDLE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }

    async storeHandle(handle) {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(handle, ROOT_HANDLE_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    async clearStoredHandle() {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(ROOT_HANDLE_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    async verifyPermission(fileHandle, readWrite = true) {
      const options = { mode: readWrite ? 'readwrite' : 'read' };
      if ((await fileHandle.queryPermission(options)) === 'granted') {
        return true;
      }
      if ((await fileHandle.requestPermission(options)) === 'granted') {
        return true;
      }
      return false;
    }

    async pickDirectory() {
      if (!window.showDirectoryPicker) {
        throw new Error('Tu navegador no soporta File System Access API. Por favor usa Google Chrome o Microsoft Edge.');
      }
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      this.rootHandle = handle;
      localStorage.setItem('studia_last_folder_name', handle.name);
      await this.storeHandle(handle);
      await this.ensureProjectStructure();
      return handle;
    }

    async checkStoredSession() {
      const storedHandle = await this.getStoredHandle();
      if (!storedHandle) return { status: 'none' };

      const folderName = storedHandle.name || localStorage.getItem('studia_last_folder_name') || 'Studia';
      try {
        const perm = await storedHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          this.rootHandle = storedHandle;
          localStorage.setItem('studia_last_folder_name', folderName);
          await this.ensureProjectStructure();
          return { status: 'granted', handle: storedHandle, name: folderName };
        }
        return { status: 'needs_permission', handle: storedHandle, name: folderName };
      } catch (err) {
        console.warn('Error consultando permisos del handle previo:', err);
        return { status: 'needs_permission', handle: storedHandle, name: folderName };
      }
    }

    async resumeStoredSession() {
      const storedHandle = await this.getStoredHandle();
      if (!storedHandle) return false;

      try {
        const perm = await storedHandle.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          this.rootHandle = storedHandle;
          localStorage.setItem('studia_last_folder_name', storedHandle.name);
          await this.ensureProjectStructure();
          return true;
        }
      } catch (err) {
        console.error('Error al reanudar permisos:', err);
      }
      return false;
    }

    async restoreSession() {
      const res = await this.checkStoredSession();
      if (res.status === 'granted') {
        return this.rootHandle;
      }
      return null;
    }

    // Helper: traverse path segments
    async getDirByPath(path, create = false) {
      if (!this.rootHandle) throw new Error('No hay carpeta seleccionada');
      const parts = path.split('/').filter(Boolean);
      let current = this.rootHandle;
      for (const part of parts) {
        current = await current.getDirectoryHandle(part, { create });
      }
      return current;
    }

    async getFileHandle(filePath, create = false) {
      if (!this.rootHandle) throw new Error('No hay carpeta seleccionada');
      const parts = filePath.split('/').filter(Boolean);
      const fileName = parts.pop();
      const dirPath = parts.join('/');
      const dir = parts.length > 0 ? await this.getDirByPath(dirPath, create) : this.rootHandle;
      return await dir.getFileHandle(fileName, { create });
    }

    async fileExists(filePath) {
      try {
        await this.getFileHandle(filePath, false);
        return true;
      } catch (e) {
        return false;
      }
    }

    async readTextFile(filePath) {
      const fileHandle = await this.getFileHandle(filePath, false);
      const file = await fileHandle.getFile();
      return await file.text();
    }

    async writeTextFile(filePath, text) {
      const fileHandle = await this.getFileHandle(filePath, true);
      const writable = await fileHandle.createWritable();
      await writable.write(text);
      await writable.close();
    }

    async readJsonFile(filePath, fallback = null) {
      try {
        const text = await this.readTextFile(filePath);
        return JSON.parse(text);
      } catch (e) {
        return fallback;
      }
    }

    async writeJsonFile(filePath, data) {
      const text = JSON.stringify(data, null, 2);
      await this.writeTextFile(filePath, text);
    }

    async getFileBlob(filePath) {
      const fileHandle = await this.getFileHandle(filePath, false);
      return await fileHandle.getFile();
    }

    async ensureProjectStructure() {
      const dirs = [
        'fuentes',
        'agentes',
        '.studia',
        '.studia/transcripciones',
        '.studia/tests',
        '.studia/resultados'
      ];
      for (const dir of dirs) {
        await this.getDirByPath(dir, true);
      }

      // Check / Seed agentes/tutor.md
      const tutorExists = await this.fileExists('agentes/tutor.md');
      if (!tutorExists) {
        await this.writeTextFile('agentes/tutor.md', `# Agente Tutor — Studia\n\nEres un tutor académico riguroso...`);
      }
      // Check / Seed agentes/examinador.md
      const examExists = await this.fileExists('agentes/examinador.md');
      if (!examExists) {
        await this.writeTextFile('agentes/examinador.md', `# Agente Examinador — Studia\n\nEres un especialista en diseño psicométrico...`);
      }
    }

    // Recursively list files in 'fuentes' folder
    async listSourcesTree(dirHandle = null, relativePath = '') {
      if (!this.rootHandle) return [];
      let targetHandle = dirHandle;
      if (!targetHandle) {
        try {
          targetHandle = await this.rootHandle.getDirectoryHandle('fuentes', { create: true });
        } catch (e) {
          return [];
        }
      }

      const items = [];
      for await (const [name, handle] of targetHandle.entries()) {
        if (name.startsWith('.')) continue; // skip hidden
        const currentRelPath = relativePath ? `${relativePath}/${name}` : name;
        if (handle.kind === 'directory') {
          const children = await this.listSourcesTree(handle, currentRelPath);
          items.push({
            name,
            kind: 'directory',
            path: currentRelPath,
            children
          });
        } else if (handle.kind === 'file') {
          const isPdf = name.toLowerCase().endsWith('.pdf');
          const isMd = name.toLowerCase().endsWith('.md');
          if (isPdf || isMd) {
            const file = await handle.getFile();
            // Check if there is an existing transcription for this file
            const transcriptRelPath = `.studia/transcripciones/${currentRelPath.replace(/\.pdf$/i, '.md')}`;
            const isTranscribed = isPdf ? await this.fileExists(transcriptRelPath) : true;

            items.push({
              name,
              kind: 'file',
              path: currentRelPath,
              size: file.size,
              lastModified: file.lastModified,
              isPdf,
              isTranscribed,
              transcriptPath: transcriptRelPath
            });
          }
        }
      }

      // Sort: folders first, then files
      items.sort((a, b) => {
        if (a.kind === b.kind) return a.name.localeCompare(b.name, undefined, { numeric: true });
        return a.kind === 'directory' ? -1 : 1;
      });

      return items;
    }

    // List all saved tests in .studia/tests/
    async listSavedTests() {
      if (!this.rootHandle) return [];
      try {
        const testsDir = await this.getDirByPath('.studia/tests', false);
        const tests = [];
        for await (const [name, handle] of testsDir.entries()) {
          if (handle.kind === 'file' && name.endsWith('.json')) {
            const file = await handle.getFile();
            const text = await file.text();
            try {
              const data = JSON.parse(text);
              tests.push({ ...data, fileName: name });
            } catch (err) {
              console.warn('Error leyendo test:', name, err);
            }
          }
        }
        return tests.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      } catch (e) {
        return [];
      }
    }
  }

  window.Studia = window.Studia || {};
  window.Studia.fs = new StudiaFS();
})(window);
