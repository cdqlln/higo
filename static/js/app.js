'use strict';

/* ── Constants ──────────────────────────────────────── */
const FLIGHT_STATUS_LABELS = {
  scheduled: '计划中', boarding: '登机中', departed: '已起飞',
  arrived: '已到达', delayed: '延误', cancelled: '取消',
};
const TASK_STATUS_LABELS = {
  pending: '待处理', in_progress: '进行中', completed: '已完成', cancelled: '已取消',
};
const PRIORITY_LABELS = { urgent: '紧急', high: '高', normal: '普通', low: '低' };
const CATEGORY_LABELS = {
  general: '综合', safety: '安全', catering: '餐饮',
  maintenance: '维修', ground: '地面保障', crew: '机组',
};
const STATUS_COLORS = {
  scheduled: '#2563eb', boarding: '#4338ca', departed: '#16a34a',
  arrived: '#065f46', delayed: '#ca8a04', cancelled: '#94a3b8',
};

/* ── Clock ──────────────────────────────────────────── */
function updateClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('clock').textContent =
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  document.getElementById('date-display').textContent =
    `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} 周${days[now.getDay()]}`;
}
updateClock();
setInterval(updateClock, 1000);

/* ── Toast ──────────────────────────────────────────── */
let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast${type ? ' ' + type : ''} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ── Navigation ─────────────────────────────────────── */
let currentPage = 'dashboard';

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  const titles = { dashboard: '仪表盘', flights: '航班管理', tasks: '任务管理' };
  document.getElementById('page-title').textContent = titles[page];
  currentPage = page;

  const actions = document.getElementById('topbar-actions');
  actions.innerHTML = '';

  if (page === 'dashboard') loadDashboard();
  if (page === 'flights')   loadFlights();
  if (page === 'tasks')     loadTasks();

  // close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* ── API helper ─────────────────────────────────────── */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ══════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════ */
async function loadDashboard() {
  try {
    const d = await api('/api/dashboard');
    renderStats(d);
    renderFlightStatusChart(d);
    renderUrgentTasks(d.urgent_tasks);
  } catch (e) { showToast('加载仪表盘失败: ' + e.message, 'error'); }
}

function renderStats(d) {
  const items = [
    { label: '总航班数', value: d.flight_total, sub: '今日', cls: 'blue' },
    { label: '总任务数', value: d.task_total, sub: '全部任务', cls: 'blue' },
    { label: '待处理任务', value: d.task_pending, sub: '需处理', cls: 'yellow' },
    { label: '进行中任务', value: d.task_in_progress, sub: '执行中', cls: 'orange' },
    { label: '已完成任务', value: d.task_completed, sub: '已完成', cls: 'green' },
  ];
  document.getElementById('stats-grid').innerHTML = items.map(i => `
    <div class="stat-card ${i.cls}">
      <div class="stat-label">${i.label}</div>
      <div class="stat-value">${i.value}</div>
      <div class="stat-sub">${i.sub}</div>
    </div>`).join('');
}

function renderFlightStatusChart(d) {
  const total = d.flight_total || 1;
  const items = Object.entries(d.flight_status).map(([status, count]) => ({
    label: FLIGHT_STATUS_LABELS[status] || status,
    count,
    pct: Math.round(count / total * 100),
    color: STATUS_COLORS[status] || '#94a3b8',
  }));
  document.getElementById('flight-status-list').innerHTML = items.map(i => `
    <div class="status-row">
      <span class="status-row-label">${i.label}</span>
      <div class="status-bar-wrap">
        <div class="status-bar" style="width:${i.pct}%;background:${i.color}"></div>
      </div>
      <span class="status-row-count">${i.count}</span>
    </div>`).join('') || '<div style="padding:16px;color:var(--gray-400)">暂无数据</div>';
}

function renderUrgentTasks(tasks) {
  document.getElementById('urgent-tasks-list').innerHTML = tasks.length ? tasks.map(t => `
    <div class="urgent-task-item">
      <span class="urgent-badge">紧急</span>
      <div class="urgent-task-info">
        <div class="urgent-task-title">${esc(t.title)}</div>
        <div class="urgent-task-meta">航班: ${esc(t.flight_number)} · 负责: ${esc(t.assigned_to||'未分配')}</div>
      </div>
      <span class="badge badge-${t.status === 'in_progress' ? 'in_progress' : 'pending'}">
        ${TASK_STATUS_LABELS[t.status] || t.status}
      </span>
    </div>`).join('')
    : '<div style="padding:20px;text-align:center;color:var(--gray-400)">暂无紧急任务</div>';
}

/* ══════════════════════════════════════════════════════
   FLIGHTS
══════════════════════════════════════════════════════ */
let flightSearchTimer;
function debounceFlightSearch() {
  clearTimeout(flightSearchTimer);
  flightSearchTimer = setTimeout(loadFlights, 300);
}

async function loadFlights() {
  const q      = document.getElementById('flight-search').value.trim();
  const status = document.getElementById('flight-status-filter').value;
  const params = new URLSearchParams();
  if (q)      params.set('q', q);
  if (status) params.set('status', status);
  try {
    const flights = await api(`/api/flights?${params}`);
    renderFlightsTable(flights);
  } catch (e) { showToast('加载航班失败: ' + e.message, 'error'); }
}

function renderFlightsTable(flights) {
  const tbody  = document.getElementById('flights-tbody');
  const empty  = document.getElementById('flights-empty');
  if (!flights.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = flights.map(f => {
    const dep = fmtDT(f.departure_time);
    const arr = fmtDT(f.arrival_time);
    const prog = f.task_total
      ? `<div class="task-progress">
           <div class="task-bar-wrap"><div class="task-bar" style="width:${Math.round(f.task_completed/f.task_total*100)}%"></div></div>
           <span class="task-count">${f.task_completed}/${f.task_total}</span>
         </div>`
      : '<span style="color:var(--gray-300);font-size:12px">—</span>';
    return `<tr>
      <td><strong>${esc(f.flight_number)}</strong></td>
      <td>${esc(f.airline)}</td>
      <td>${esc(f.origin)}</td>
      <td>${esc(f.destination)}</td>
      <td style="white-space:nowrap">${dep}</td>
      <td style="white-space:nowrap">${arr}</td>
      <td>${esc(f.aircraft_type||'—')}</td>
      <td><span class="badge badge-${f.status}">${FLIGHT_STATUS_LABELS[f.status]||f.status}</span></td>
      <td>${prog}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-sm btn-ghost" onclick="openDetailModal(${f.id})">详情</button>
          <button class="btn btn-sm btn-ghost" onclick="openFlightModal(${f.id})">编辑</button>
          <button class="btn btn-sm btn-danger" onclick="deleteFlight(${f.id},'${esc(f.flight_number)}')">删除</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ── Flight Modal ── */
let flightModalMode = 'create';

function openFlightModal(id = null) {
  flightModalMode = id ? 'edit' : 'create';
  document.getElementById('flight-modal-title').textContent = id ? '编辑航班' : '新增航班';
  clearFlightForm();
  if (id) {
    api(`/api/flights/${id}`).then(f => {
      document.getElementById('flight-id').value = f.id;
      document.getElementById('f-flight_number').value = f.flight_number;
      document.getElementById('f-airline').value       = f.airline;
      document.getElementById('f-origin').value        = f.origin;
      document.getElementById('f-destination').value   = f.destination;
      document.getElementById('f-departure_time').value = toLocalInput(f.departure_time);
      document.getElementById('f-arrival_time').value   = toLocalInput(f.arrival_time);
      document.getElementById('f-aircraft_type').value  = f.aircraft_type || '';
      document.getElementById('f-status').value         = f.status;
      document.getElementById('f-remarks').value        = f.remarks || '';
    }).catch(e => showToast('加载航班失败: ' + e.message, 'error'));
  }
  document.getElementById('flight-modal-overlay').classList.add('open');
}

function closeFlightModal() {
  document.getElementById('flight-modal-overlay').classList.remove('open');
}

function clearFlightForm() {
  document.getElementById('flight-id').value = '';
  ['f-flight_number','f-airline','f-origin','f-destination','f-aircraft_type','f-remarks'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-departure_time').value = '';
  document.getElementById('f-arrival_time').value   = '';
  document.getElementById('f-status').value = 'scheduled';
}

async function submitFlightForm(e) {
  e.preventDefault();
  const id = document.getElementById('flight-id').value;
  const body = {
    flight_number: document.getElementById('f-flight_number').value.trim(),
    airline:       document.getElementById('f-airline').value.trim(),
    origin:        document.getElementById('f-origin').value.trim(),
    destination:   document.getElementById('f-destination').value.trim(),
    departure_time: document.getElementById('f-departure_time').value,
    arrival_time:   document.getElementById('f-arrival_time').value,
    aircraft_type:  document.getElementById('f-aircraft_type').value.trim(),
    status:         document.getElementById('f-status').value,
    remarks:        document.getElementById('f-remarks').value.trim(),
  };
  try {
    if (id) {
      await api(`/api/flights/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('航班已更新', 'success');
    } else {
      await api('/api/flights', { method: 'POST', body: JSON.stringify(body) });
      showToast('航班已创建', 'success');
    }
    closeFlightModal();
    loadFlights();
  } catch (err) { showToast('保存失败: ' + err.message, 'error'); }
}

async function deleteFlight(id, num) {
  if (!confirm(`确认删除航班 ${num}？相关任务将一并删除。`)) return;
  try {
    await api(`/api/flights/${id}`, { method: 'DELETE' });
    showToast('航班已删除', 'success');
    loadFlights();
  } catch (e) { showToast('删除失败: ' + e.message, 'error'); }
}

/* ── Detail Modal ── */
async function openDetailModal(id) {
  try {
    const f = await api(`/api/flights/${id}`);
    document.getElementById('detail-modal-title').textContent = `航班详情 — ${f.flight_number}`;
    const body = document.getElementById('detail-modal-body');
    body.innerHTML = `
      <div class="detail-section">
        <h3>基本信息</h3>
        <div class="detail-grid">
          <div class="detail-item"><label>航班号</label><div class="val">${esc(f.flight_number)}</div></div>
          <div class="detail-item"><label>航空公司</label><div class="val">${esc(f.airline)}</div></div>
          <div class="detail-item"><label>机型</label><div class="val">${esc(f.aircraft_type||'—')}</div></div>
          <div class="detail-item"><label>出发地</label><div class="val">${esc(f.origin)}</div></div>
          <div class="detail-item"><label>目的地</label><div class="val">${esc(f.destination)}</div></div>
          <div class="detail-item"><label>状态</label><div class="val"><span class="badge badge-${f.status}">${FLIGHT_STATUS_LABELS[f.status]}</span></div></div>
          <div class="detail-item"><label>起飞时间</label><div class="val">${fmtDT(f.departure_time)}</div></div>
          <div class="detail-item"><label>到达时间</label><div class="val">${fmtDT(f.arrival_time)}</div></div>
          <div class="detail-item"><label>备注</label><div class="val">${esc(f.remarks||'—')}</div></div>
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-tasks-header">
          <h3>关联任务 (${f.tasks.length})</h3>
          <button class="btn btn-sm btn-primary" onclick="openTaskModalForFlight(${f.id})">+ 新增任务</button>
        </div>
        ${f.tasks.length ? `
        <table class="table">
          <thead><tr><th>标题</th><th>类别</th><th>优先级</th><th>状态</th><th>负责人</th><th>操作</th></tr></thead>
          <tbody>
            ${f.tasks.map(t => `<tr>
              <td>${esc(t.title)}</td>
              <td><span class="badge badge-${t.category}">${CATEGORY_LABELS[t.category]||t.category}</span></td>
              <td><span class="badge badge-${t.priority}">${PRIORITY_LABELS[t.priority]||t.priority}</span></td>
              <td><span class="badge badge-${t.status}">${TASK_STATUS_LABELS[t.status]||t.status}</span></td>
              <td>${esc(t.assigned_to||'—')}</td>
              <td><div class="action-btns">
                <button class="btn btn-sm btn-ghost" onclick="openTaskModal(${t.id})">编辑</button>
                <button class="btn btn-sm btn-danger" onclick="deleteTask(${t.id})">删除</button>
              </div></td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<div style="padding:16px;color:var(--gray-400);text-align:center">暂无任务</div>'}
      </div>`;
    document.getElementById('detail-modal-overlay').classList.add('open');
  } catch (e) { showToast('加载详情失败: ' + e.message, 'error'); }
}

function closeDetailModal() {
  document.getElementById('detail-modal-overlay').classList.remove('open');
}

function openTaskModalForFlight(flightId) {
  closeDetailModal();
  openTaskModal(null, flightId);
}

/* ══════════════════════════════════════════════════════
   TASKS
══════════════════════════════════════════════════════ */
let taskSearchTimer;
function debounceTaskSearch() {
  clearTimeout(taskSearchTimer);
  taskSearchTimer = setTimeout(loadTasks, 300);
}

async function loadTasks() {
  const q        = document.getElementById('task-search').value.trim();
  const status   = document.getElementById('task-status-filter').value;
  const priority = document.getElementById('task-priority-filter').value;
  const category = document.getElementById('task-category-filter').value;
  const params   = new URLSearchParams();
  if (q)        params.set('q', q);
  if (status)   params.set('status', status);
  if (priority) params.set('priority', priority);
  if (category) params.set('category', category);
  try {
    const tasks = await api(`/api/tasks?${params}`);
    renderTasksTable(tasks);
  } catch (e) { showToast('加载任务失败: ' + e.message, 'error'); }
}

function renderTasksTable(tasks) {
  const tbody = document.getElementById('tasks-tbody');
  const empty = document.getElementById('tasks-empty');
  if (!tasks.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = tasks.map(t => `<tr>
    <td><strong>${esc(t.flight_number)}</strong></td>
    <td>${esc(t.title)}</td>
    <td><span class="badge badge-${t.category}">${CATEGORY_LABELS[t.category]||t.category}</span></td>
    <td><span class="badge badge-${t.priority}">${PRIORITY_LABELS[t.priority]||t.priority}</span></td>
    <td>
      <select class="select-input" style="padding:3px 6px;font-size:12px"
        onchange="quickUpdateTaskStatus(${t.id}, this.value)">
        ${Object.entries(TASK_STATUS_LABELS).map(([v, l]) =>
          `<option value="${v}"${v === t.status ? ' selected' : ''}>${l}</option>`
        ).join('')}
      </select>
    </td>
    <td>${esc(t.assigned_to||'—')}</td>
    <td style="white-space:nowrap">${t.due_time ? fmtDT(t.due_time) : '—'}</td>
    <td>
      <div class="action-btns">
        <button class="btn btn-sm btn-ghost" onclick="openTaskModal(${t.id})">编辑</button>
        <button class="btn btn-sm btn-danger" onclick="deleteTask(${t.id})">删除</button>
      </div>
    </td>
  </tr>`).join('');
}

async function quickUpdateTaskStatus(id, status) {
  try {
    await api(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    showToast('状态已更新', 'success');
  } catch (e) { showToast('更新失败: ' + e.message, 'error'); loadTasks(); }
}

/* ── Task Modal ── */
let allFlights = [];

async function openTaskModal(id = null, presetFlightId = null) {
  document.getElementById('task-modal-title').textContent = id ? '编辑任务' : '新增任务';
  clearTaskForm();

  // Load flights for select
  try {
    allFlights = await api('/api/flights');
    const sel = document.getElementById('t-flight_id');
    sel.innerHTML = allFlights.map(f =>
      `<option value="${f.id}">${f.flight_number} — ${f.airline}</option>`
    ).join('');
    if (presetFlightId) sel.value = presetFlightId;
  } catch (e) { /* ignore */ }

  if (id) {
    try {
      const t = await api(`/api/tasks/${id}`);
      document.getElementById('task-id').value       = t.id;
      document.getElementById('t-flight_id').value   = t.flight_id;
      document.getElementById('t-title').value        = t.title;
      document.getElementById('t-description').value  = t.description || '';
      document.getElementById('t-category').value     = t.category;
      document.getElementById('t-priority').value     = t.priority;
      document.getElementById('t-status').value       = t.status;
      document.getElementById('t-assigned_to').value  = t.assigned_to || '';
      document.getElementById('t-due_time').value     = t.due_time ? toLocalInput(t.due_time) : '';
    } catch (e) { showToast('加载任务失败: ' + e.message, 'error'); return; }
  }

  document.getElementById('task-modal-overlay').classList.add('open');
}

function closeTaskModal() {
  document.getElementById('task-modal-overlay').classList.remove('open');
}

function clearTaskForm() {
  document.getElementById('task-id').value       = '';
  document.getElementById('t-title').value        = '';
  document.getElementById('t-description').value  = '';
  document.getElementById('t-assigned_to').value  = '';
  document.getElementById('t-due_time').value     = '';
  document.getElementById('t-category').value     = 'general';
  document.getElementById('t-priority').value     = 'normal';
  document.getElementById('t-status').value       = 'pending';
}

async function submitTaskForm(e) {
  e.preventDefault();
  const id = document.getElementById('task-id').value;
  const body = {
    flight_id:   parseInt(document.getElementById('t-flight_id').value),
    title:       document.getElementById('t-title').value.trim(),
    description: document.getElementById('t-description').value.trim(),
    category:    document.getElementById('t-category').value,
    priority:    document.getElementById('t-priority').value,
    status:      document.getElementById('t-status').value,
    assigned_to: document.getElementById('t-assigned_to').value.trim(),
    due_time:    document.getElementById('t-due_time').value || null,
  };
  try {
    if (id) {
      await api(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('任务已更新', 'success');
    } else {
      await api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
      showToast('任务已创建', 'success');
    }
    closeTaskModal();
    if (currentPage === 'tasks') loadTasks();
  } catch (err) { showToast('保存失败: ' + err.message, 'error'); }
}

async function deleteTask(id) {
  if (!confirm('确认删除该任务？')) return;
  try {
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
    showToast('任务已删除', 'success');
    if (currentPage === 'tasks') loadTasks();
  } catch (e) { showToast('删除失败: ' + e.message, 'error'); }
}

/* ── Utilities ──────────────────────────────────────── */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDT(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} `
         + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return iso; }
}

function toLocalInput(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T`
         + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

/* ── Init ───────────────────────────────────────────── */
loadDashboard();
