/**
 * Studia — Test Creation, Execution, Repetition & Error Tracking Module
 */
(function(window) {
  'use strict';

  class StudiaTests {
    constructor() {
      this.currentTest = null;
      this.currentAnswers = {}; // { questionId: selectedIndex }
      this.activeTestMode = false;
      this.filterOnlyFailures = false;
    }

    init() {
      const btnOpenCreate = document.getElementById('btn-open-create-test');
      const btnSubmitCreate = document.getElementById('btn-create-test-submit');
      const btnCancelCreate = document.getElementById('btn-cancel-create-test');
      const modalCreate = document.getElementById('create-test-modal');

      if (btnOpenCreate && modalCreate) {
        btnOpenCreate.addEventListener('click', () => {
          modalCreate.classList.remove('hidden');
        });
      }

      if (btnCancelCreate && modalCreate) {
        btnCancelCreate.addEventListener('click', () => {
          modalCreate.classList.add('hidden');
        });
      }

      if (btnSubmitCreate) {
        btnSubmitCreate.addEventListener('click', () => this.generateNewTest());
      }

      const tabs = document.querySelectorAll('.right-panel-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const target = tab.getAttribute('data-tab');
          document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
          const targetEl = document.getElementById(`tab-${target}`);
          if (targetEl) targetEl.classList.remove('hidden');

          if (target === 'stats') {
            this.renderStats();
          } else if (target === 'saved') {
            this.renderSavedTests();
          }
        });
      });
    }

    async generateNewTest() {
      const modal = document.getElementById('create-test-modal');
      const countInput = document.getElementById('test-questions-count');
      const difficultyInput = document.getElementById('test-difficulty');
      const focusInput = document.getElementById('test-focus');
      const submitBtn = document.getElementById('btn-create-test-submit');

      const count = parseInt(countInput ? countInput.value : '5', 10) || 5;
      const difficulty = difficultyInput ? difficultyInput.value : 'Media';
      const focus = focusInput ? focusInput.value.trim() : '';

      if (!window.Studia.gemini.hasKey()) {
        alert('Configura primero tu Gemini API Key en Ajustes (icono ⚙️).');
        return;
      }

      const sources = await window.Studia.sources.getSelectedSourcesContent();
      if (sources.length === 0) {
        alert('Debes seleccionar al menos una fuente transcrita en el panel izquierdo para crear el test.');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Generando test con Gemini...';
      }

      try {
        let examinadorPrompt = '';
        try {
          examinadorPrompt = await window.Studia.fs.readTextFile('agentes/examinador.md');
        } catch (e) {
          examinadorPrompt = 'Eres un creador de tests de opción múltiple. Crea 4 opciones con 1 correcta y cita la referencia.';
        }

        let sourcesContext = '=== MATERIAL PARA EL EXAMEN ===\n';
        sources.forEach((s, idx) => {
          sourcesContext += `\n[DOCUMENTO ${idx + 1}: "${s.pdfPath}"]\n${s.text}\n`;
        });
        sourcesContext += '\n=== FIN DEL MATERIAL ===';

        const systemInstruction = `${examinadorPrompt}\n\n${sourcesContext}`;

        const promptText = `Genera un examen tipo test de ${count} preguntas de opción múltiple (4 opciones por pregunta).
Dificultad: ${difficulty}.
${focus ? `Enfoque temático prioritario: ${focus}.` : ''}

REGLAS ESTRICTAS:
1. Cada pregunta DEBE tener exactamente 4 opciones en el arreglo "options".
2. "correctIndex" DEBE ser un número entero entre 0 y 3 que apunte a la opción correcta.
3. "ref" DEBE contener el archivo y la página de donde se extrae la pregunta con la sintaxis: "ruta/archivo.pdf#N".
4. "explanation" DEBE justificar pedagógicamente la opción acertada.
5. "topic" debe indicar el tema o título del capítulo evaluado.`;

        const testSchema = {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            difficulty: { type: "STRING" },
            questions: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  id: { type: "STRING" },
                  question: { type: "STRING" },
                  options: {
                    type: "ARRAY",
                    items: { type: "STRING" }
                  },
                  correctIndex: { type: "INTEGER" },
                  explanation: { type: "STRING" },
                  ref: { type: "STRING" },
                  topic: { type: "STRING" }
                },
                required: ["id", "question", "options", "correctIndex", "explanation", "ref"]
              }
            }
          },
          required: ["title", "questions"]
        };

        const jsonResponse = await window.Studia.gemini.generate({
          systemInstruction,
          contents: promptText,
          responseSchema: testSchema,
          jsonMode: true
        });

        const testData = JSON.parse(jsonResponse);
        const testId = `test_${Date.now()}`;
        testData.id = testId;
        testData.createdAt = new Date().toISOString();
        testData.sources = sources.map(s => s.pdfPath);

        // Save to .studia/tests/
        await window.Studia.fs.writeJsonFile(`.studia/tests/${testId}.json`, testData);

        if (modal) modal.classList.add('hidden');
        if (focusInput) focusInput.value = '';

        // Start test immediately in the central area
        this.startTest(testData);
        this.renderSavedTests();
      } catch (err) {
        console.error('Error generando test:', err);
        alert(`Error al generar test: ${err.message}`);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '⚡ Generar Test';
        }
      }
    }

    startTest(testData, questionsSubset = null, isOnlyFailures = false) {
      this.currentTest = testData;
      this.activeTestMode = true;
      this.currentAnswers = {};
      this.filterOnlyFailures = isOnlyFailures;

      const questionsToRun = questionsSubset || testData.questions;
      this.activeQuestions = questionsToRun;

      const container = document.getElementById('chat-messages');
      if (!container) return;

      container.innerHTML = `
        <div class="test-runner-header">
          <div class="test-runner-meta">
            <span class="test-tag">Examen Activo</span>
            <h2>${testData.title || 'Evaluación de Conocimientos'}</h2>
            <p>Preguntas: <b>${questionsToRun.length}</b> ${isOnlyFailures ? '<i>(Repetición de fallos)</i>' : ''} · Dificultad: <b>${testData.difficulty || 'Media'}</b></p>
          </div>
          <button id="btn-exit-test" class="btn-secondary">✕ Salir del test</button>
        </div>

        <div class="test-questions-list" id="test-questions-container">
        </div>

        <div class="test-runner-footer">
          <button id="btn-submit-exam" class="btn-primary btn-large">📝 Corregir Examen</button>
        </div>
      `;

      document.getElementById('btn-exit-test')?.addEventListener('click', () => {
        if (confirm('¿Deseas salir del examen en curso? Volverás a la consola de chat.')) {
          this.activeTestMode = false;
          window.Studia.chat.resetChat();
        }
      });

      document.getElementById('btn-submit-exam')?.addEventListener('click', () => {
        this.submitExam();
      });

      const qContainer = document.getElementById('test-questions-container');
      questionsToRun.forEach((q, qIndex) => {
        const qCard = document.createElement('div');
        qCard.className = 'test-question-card';
        qCard.id = `q-card-${q.id || qIndex}`;

        const letters = ['A', 'B', 'C', 'D'];
        let optionsHtml = '';
        q.options.forEach((opt, optIndex) => {
          optionsHtml += `
            <label class="option-label" data-q="${q.id || qIndex}" data-opt="${optIndex}">
              <input type="radio" name="question_${q.id || qIndex}" value="${optIndex}">
              <span class="option-letter">${letters[optIndex]}</span>
              <span class="option-text">${opt}</span>
            </label>
          `;
        });

        qCard.innerHTML = `
          <div class="question-number">Pregunta ${qIndex + 1} de ${questionsToRun.length}</div>
          <div class="question-title">${q.question}</div>
          <div class="question-options">${optionsHtml}</div>
          <div class="question-feedback hidden" id="feedback-${q.id || qIndex}"></div>
        `;

        // Radio click listeners
        qCard.querySelectorAll('input[type="radio"]').forEach(radio => {
          radio.addEventListener('change', (e) => {
            const qKey = q.id || qIndex;
            this.currentAnswers[qKey] = parseInt(e.target.value, 10);
            
            // Highlight selected option visually
            qCard.querySelectorAll('.option-label').forEach(lbl => lbl.classList.remove('selected'));
            e.target.closest('.option-label').classList.add('selected');
          });
        });

        qContainer.appendChild(qCard);
      });

      // Scroll to top
      container.scrollTop = 0;
    }

    async submitExam() {
      const total = this.activeQuestions.length;
      let correctCount = 0;
      const responsesLog = [];
      const failedQuestions = [];

      this.activeQuestions.forEach((q, qIndex) => {
        const qKey = q.id || qIndex;
        const selected = this.currentAnswers[qKey];
        const isCorrect = selected === q.correctIndex;

        if (isCorrect) {
          correctCount++;
        } else {
          failedQuestions.push(q);
        }

        responsesLog.push({
          questionId: q.id || `q_${qIndex}`,
          questionText: q.question,
          selected,
          correct: q.correctIndex,
          isCorrect,
          ref: q.ref,
          topic: q.topic || 'General'
        });

        // Show card feedback
        const qCard = document.getElementById(`q-card-${qKey}`);
        const feedbackEl = document.getElementById(`feedback-${qKey}`);
        if (qCard && feedbackEl) {
          qCard.classList.add(isCorrect ? 'card-correct' : 'card-incorrect');
          
          const refParts = (q.ref || '').split('#');
          const refFile = refParts[0] || '';
          const refPage = refParts[1] || '1';

          feedbackEl.classList.remove('hidden');
          feedbackEl.innerHTML = `
            <div class="feedback-badge ${isCorrect ? 'ok' : 'fail'}">
              ${isCorrect ? '✅ Respuesta Correcta' : '❌ Respuesta Incorrecta'}
            </div>
            <div class="feedback-explanation">
              <b>Explicación:</b> ${q.explanation || ''}
            </div>
            ${q.ref ? `
              <div class="feedback-ref">
                <button type="button" class="ref-chip" data-file="${refFile}" data-page="${refPage}" title="Ver en el PDF original">
                  <span class="chip-icon">📄</span>
                  <span class="chip-name">${refFile.split('/').pop()}</span>
                  <span class="chip-page">p. ${refPage}</span>
                </button>
              </div>
            ` : ''}
          `;

          // Mark option states
          const optionLabels = qCard.querySelectorAll('.option-label');
          optionLabels.forEach((lbl, idx) => {
            lbl.classList.remove('is-correct', 'is-wrong');
            if (idx === q.correctIndex) {
              lbl.classList.add('is-correct');
            } else if (idx === selected) {
              lbl.classList.add('is-wrong');
            }
          });
        }
      });

      const score = Math.round((correctCount / total) * 100) / 10; // score out of 10

      // Record result in .studia/resultados/intentos.json
      const attemptRecord = {
        testId: this.currentTest.id,
        testTitle: this.currentTest.title,
        date: new Date().toISOString(),
        score,
        correctCount,
        totalQuestions: total,
        responses: responsesLog
      };

      await this.saveAttempt(attemptRecord);

      // Render summary banner at the top
      const header = document.querySelector('.test-runner-header');
      if (header) {
        const scoreClass = score >= 7 ? 'score-high' : score >= 5 ? 'score-mid' : 'score-low';
        const summaryBanner = document.createElement('div');
        summaryBanner.className = `exam-result-banner ${scoreClass}`;
        summaryBanner.innerHTML = `
          <div class="result-score-circle">
            <span class="score-number">${score}</span>
            <span class="score-max">/10</span>
          </div>
          <div class="result-details">
            <h3>${score >= 5 ? '¡Examen Superado!' : 'Necesitas repasar algunos conceptos'}</h3>
            <p>Has acertado <b>${correctCount}</b> de <b>${total}</b> preguntas (${Math.round((correctCount/total)*100)}%).</p>
          </div>
          <div class="result-actions">
            <button id="btn-repeat-full" class="btn-secondary">🔄 Repetir test completo</button>
            ${failedQuestions.length > 0 ? `
              <button id="btn-repeat-failures" class="btn-accent">🔥 Repetir solo los ${failedQuestions.length} fallos</button>
            ` : ''}
          </div>
        `;

        header.after(summaryBanner);

        document.getElementById('btn-repeat-full')?.addEventListener('click', () => {
          this.startTest(this.currentTest);
        });

        document.getElementById('btn-repeat-failures')?.addEventListener('click', () => {
          this.startTest(this.currentTest, failedQuestions, true);
        });
      }

      // Hide submit button to avoid duplicate submissions
      const footer = document.querySelector('.test-runner-footer');
      if (footer) footer.style.display = 'none';

      // Update stats and saved tests
      this.renderStats();
      this.renderSavedTests();

      // Scroll to summary
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async saveAttempt(record) {
      try {
        let attempts = await window.Studia.fs.readJsonFile('.studia/resultados/intentos.json', []);
        if (!Array.isArray(attempts)) attempts = [];
        attempts.unshift(record); // newest first
        await window.Studia.fs.writeJsonFile('.studia/resultados/intentos.json', attempts);
      } catch (err) {
        console.warn('Error guardando intento:', err);
      }
    }

    async renderSavedTests() {
      const container = document.getElementById('saved-tests-list');
      if (!container) return;

      container.innerHTML = '<div class="loading-state"><span class="spinner"></span> Cargando tests guardados...</div>';
      const tests = await window.Studia.fs.listSavedTests();

      if (tests.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">📝</span>
            <p>No tienes tests guardados aún.</p>
            <small>Pulsa el botón "Crear Test" para generar una evaluación a medida con Gemini.</small>
          </div>
        `;
        return;
      }

      container.innerHTML = '';
      tests.forEach(test => {
        const item = document.createElement('div');
        item.className = 'saved-test-card';
        const dateStr = test.createdAt ? new Date(test.createdAt).toLocaleDateString() : '';

        item.innerHTML = `
          <div class="saved-test-info">
            <h4>${test.title || 'Examen sin título'}</h4>
            <div class="saved-test-meta">
              <span>📅 ${dateStr}</span>
              <span>❓ ${test.questions?.length || 0} preguntas</span>
              <span class="badge">${test.difficulty || 'Media'}</span>
            </div>
          </div>
          <div class="saved-test-actions">
            <button class="btn-primary btn-sm btn-start-saved" title="Realizar este test">▶ Realizar</button>
            <button class="btn-icon btn-delete-test" title="Eliminar test">🗑️</button>
          </div>
        `;

        item.querySelector('.btn-start-saved').addEventListener('click', () => {
          this.startTest(test);
        });

        item.querySelector('.btn-delete-test').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`¿Eliminar el test "${test.title}"?`)) {
            try {
              const fileHandle = await window.Studia.fs.getFileHandle(`.studia/tests/${test.fileName}`, false);
              const testsDir = await window.Studia.fs.getDirByPath('.studia/tests', false);
              await testsDir.removeEntry(test.fileName);
              this.renderSavedTests();
            } catch (err) {
              alert(`Error al eliminar: ${err.message}`);
            }
          }
        });

        container.appendChild(item);
      });
    }

    async renderStats() {
      const container = document.getElementById('stats-container');
      if (!container) return;

      const attempts = await window.Studia.fs.readJsonFile('.studia/resultados/intentos.json', []);
      if (!Array.isArray(attempts) || attempts.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">📊</span>
            <p>Aún no hay estadísticas disponibles.</p>
            <small>Completa tu primer test para ver tu nota media y las preguntas con más errores.</small>
          </div>
        `;
        return;
      }

      const totalAttempts = attempts.length;
      const avgScore = (attempts.reduce((acc, a) => acc + (a.score || 0), 0) / totalAttempts).toFixed(1);

      // Aggregate failures by question / topic
      const failuresByQuestion = {};
      const failuresByTopic = {};

      attempts.forEach(att => {
        (att.responses || []).forEach(r => {
          if (!r.isCorrect) {
            const qKey = r.questionText || r.questionId;
            failuresByQuestion[qKey] = failuresByQuestion[qKey] || { count: 0, text: qKey, ref: r.ref };
            failuresByQuestion[qKey].count++;

            const topic = r.topic || 'General';
            failuresByTopic[topic] = (failuresByTopic[topic] || 0) + 1;
          }
        });
      });

      const topFailedQuestions = Object.values(failuresByQuestion)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const topFailedTopics = Object.entries(failuresByTopic)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      container.innerHTML = `
        <div class="stats-overview-grid">
          <div class="stat-box">
            <span class="stat-val">${totalAttempts}</span>
            <span class="stat-lbl">Exámenes hechos</span>
          </div>
          <div class="stat-box">
            <span class="stat-val ${avgScore >= 7 ? 'text-green' : avgScore >= 5 ? 'text-amber' : 'text-red'}">${avgScore}</span>
            <span class="stat-lbl">Nota media</span>
          </div>
        </div>

        <div class="stats-section">
          <h4>⚠️ Temarios con más errores</h4>
          ${topFailedTopics.length > 0 ? `
            <ul class="error-topic-list">
              ${topFailedTopics.map(([topic, count]) => `
                <li>
                  <span class="topic-name">${topic}</span>
                  <span class="topic-errors-badge">${count} error${count === 1 ? '' : 'es'}</span>
                </li>
              `).join('')}
            </ul>
          ` : '<p class="text-muted">¡Sin errores registrados todavía!</p>'}
        </div>

        <div class="stats-section">
          <h4>🔍 Preguntas más falladas</h4>
          ${topFailedQuestions.length > 0 ? `
            <div class="failed-questions-list">
              ${topFailedQuestions.map(item => `
                <div class="failed-q-item">
                  <div class="failed-q-text">"${item.text}"</div>
                  <div class="failed-q-meta">
                    <span class="fail-count">❌ ${item.count} vez/veces fallada</span>
                    ${item.ref ? `
                      <button class="ref-chip" data-file="${item.ref.split('#')[0]}" data-page="${item.ref.split('#')[1] || 1}">
                        📄 ${item.ref.split('#')[0].split('/').pop()} p.${item.ref.split('#')[1] || 1}
                      </button>
                    ` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          ` : '<p class="text-muted">No hay fallos frecuentes.</p>'}
        </div>
      `;
    }
  }

  window.Studia = window.Studia || {};
  window.Studia.tests = new StudiaTests();
})(window);
