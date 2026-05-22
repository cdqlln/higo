// AI WorkDeck · Prototype interactions
(function () {
  const screens = document.querySelectorAll('.screen');
  const tabs = document.querySelectorAll('.nav-tab');

  function showScreen(name) {
    screens.forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.screen === name));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  tabs.forEach((t) => t.addEventListener('click', () => showScreen(t.dataset.screen)));

  document.querySelectorAll('[data-go]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      showScreen(el.dataset.go);
    });
  });

  // File tree folder toggles
  document.querySelectorAll('.ft-folder > .ft-row').forEach((row) => {
    row.addEventListener('click', () => {
      const li = row.parentElement;
      li.classList.toggle('open');
      const caret = row.querySelector('.ft-caret');
      if (caret && (caret.textContent === '▾' || caret.textContent === '▸')) {
        caret.textContent = li.classList.contains('open') ? '▾' : '▸';
      }
    });
  });

  // File selection
  document.querySelectorAll('.ft-file > .ft-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.ft-file').forEach((f) => f.classList.remove('active'));
      row.parentElement.classList.add('active');
    });
  });

  // Tabs
  document.querySelectorAll('.ide-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ide-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // Essentials tabs
  document.querySelectorAll('.es-tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.es-tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
    });
  });

  // Marketplace sort
  document.querySelectorAll('.sort-chip').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.sort-chip').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
    });
  });

  // Workspace filter chips
  document.querySelectorAll('.chip-btn:not(.view-toggle)').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.chip-btn:not(.view-toggle)').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
    });
  });

  // Workspace sidebar nav
  document.querySelectorAll('.ws-side-nav li').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.ws-side-nav li').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
    });
  });

  // Marketplace side categories
  document.querySelectorAll('.mk-side-group ul li').forEach((t) => {
    t.addEventListener('click', () => {
      const sibs = t.parentElement.querySelectorAll('li');
      sibs.forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
    });
  });

  // Send button
  const sendBtn = document.querySelector('.ag-send');
  const textarea = document.querySelector('.ag-input-box textarea');
  if (sendBtn && textarea) {
    sendBtn.addEventListener('click', () => {
      const v = textarea.value.trim();
      if (!v) return;
      const conv = document.querySelector('.ag-conv');
      const userMsg = document.createElement('div');
      userMsg.className = 'ag-msg user';
      userMsg.innerHTML = `<div class="ag-bubble">${escapeHtml(v)}</div>`;
      conv.appendChild(userMsg);
      textarea.value = '';
      conv.scrollTop = conv.scrollHeight;

      setTimeout(() => {
        const reply = document.createElement('div');
        reply.className = 'ag-msg agent';
        reply.innerHTML = `<div class="ag-bubble">已收到任务,正在分解执行计划…<br/><span style="color:var(--text-3); font-size:11px;">(原型演示:实际版本会调用相应技能与 MCP)</span></div>`;
        conv.appendChild(reply);
        conv.scrollTop = conv.scrollHeight;
      }, 600);
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
