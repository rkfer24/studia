/**
 * Studia — Gemini API Client Module
 */
(function(window) {
  'use strict';

  const STORAGE_KEY_API = 'studia_gemini_api_key';
  const STORAGE_KEY_MODEL = 'studia_gemini_model';
  const DEFAULT_MODEL = 'gemini-2.5-flash';

  class StudiaGemini {
    constructor() {
      this.apiKey = localStorage.getItem(STORAGE_KEY_API) || '';
      this.model = localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL;
    }

    getApiKey() {
      return this.apiKey;
    }

    setApiKey(key) {
      this.apiKey = (key || '').trim();
      localStorage.setItem(STORAGE_KEY_API, this.apiKey);
    }

    getModel() {
      return this.model;
    }

    setModel(model) {
      this.model = (model || DEFAULT_MODEL).trim();
      localStorage.setItem(STORAGE_KEY_MODEL, this.model);
    }

    hasKey() {
      return Boolean(this.apiKey && this.apiKey.length > 5);
    }

    async testConnection() {
      if (!this.hasKey()) throw new Error('No has configurado tu Gemini API Key');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const payload = {
        contents: [{ role: 'user', parts: [{ text: 'Hola, responde con "OK" si estás activo.' }] }],
        generationConfig: { maxOutputTokens: 10 }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Error HTTP ${res.status}`);
      }
      return true;
    }

    /**
     * Standard generateContent call (JSON schema or regular text)
     */
    async generate({ systemInstruction, contents, responseSchema = null, jsonMode = false, model = null }) {
      if (!this.hasKey()) throw new Error('Introduce tu API Key en Ajustes (icono ⚙️) para continuar.');
      const activeModel = model || this.model;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${this.apiKey}`;

      const body = {
        contents: Array.isArray(contents) ? contents : [{ role: 'user', parts: [{ text: contents }] }]
      };

      if (systemInstruction) {
        body.systemInstruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      const generationConfig = {};
      if (jsonMode || responseSchema) {
        generationConfig.responseMimeType = 'application/json';
        if (responseSchema) {
          generationConfig.responseSchema = responseSchema;
        }
      }

      if (Object.keys(generationConfig).length > 0) {
        body.generationConfig = generationConfig;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Error HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return text;
    }

    /**
     * Stream generateContent with SSE alt=sse
     */
    async streamGenerate({ systemInstruction, contents, onChunk, model = null }) {
      if (!this.hasKey()) throw new Error('Introduce tu API Key en Ajustes (icono ⚙️) para continuar.');
      const activeModel = model || this.model;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

      const body = {
        contents: Array.isArray(contents) ? contents : [{ role: 'user', parts: [{ text: contents }] }]
      };

      if (systemInstruction) {
        body.systemInstruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Error HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep remainder

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const partText = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (partText) {
                accumulatedText += partText;
                if (typeof onChunk === 'function') {
                  onChunk(partText, accumulatedText);
                }
              }
            } catch (err) {
              console.warn('Error parsing SSE chunk:', err, jsonStr);
            }
          }
        }
      }

      return accumulatedText;
    }

    /**
     * Convert Blob to Base64
     */
    async blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result;
          const base64 = res.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    /**
     * Transcribe PDF file using Gemini native multimodal capability
     */
    async transcribePdf(pdfBlob, sourceRelativePath) {
      if (pdfBlob.size > 22 * 1024 * 1024) {
        throw new Error(`El PDF pesa ${(pdfBlob.size / (1024 * 1024)).toFixed(1)} MB. La transcripción directa en v1 admite un máximo de 20 MB por archivo.`);
      }

      const base64Data = await this.blobToBase64(pdfBlob);

      const systemInstruction = `Actúa como un transcriptor técnico y académico de altísima fidelidad.
Tu misión es transcribir fielmente todo el contenido de este documento PDF a formato Markdown.

REGLAS CRÍTICAS:
1. MARCADOR DE PÁGINAS OBLIGATORIO:
   Cada vez que comience una nueva página en el documento original, debes insertar una línea única con la sintaxis exacta:
   <!-- page: N -->
   donde N es el número correlativo de la página (empezando en 1).
   Nunca olvides este marcador al inicio de cada página.
2. CONSERVA LA ESTRUCTURA:
   - Títulos y subtítulos (#, ##, ###).
   - Tablas completas en formato Markdown.
   - Listas numeradas y con viñetas.
   - Términos destacados en negrita o cursiva.
3. INTEGRIDAD:
   - No resumas, no omitas párrafos, no alteres datos, nombres ni números.
   - No añadas saludos, despedidas ni metatexto explicativo. Empieza directamente con el contenido de la página 1.`;

      const contents = [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Data
              }
            },
            {
              text: `Transcribe íntegramente este documento ("${sourceRelativePath}") a Markdown respetando escrupulosamente los marcadores <!-- page: N --> al inicio de cada página.`
            }
          ]
        }
      ];

      const transcribedMarkdown = await this.generate({
        systemInstruction,
        contents,
        model: this.model
      });

      return transcribedMarkdown;
    }
  }

  window.Studia = window.Studia || {};
  window.Studia.gemini = new StudiaGemini();
})(window);
