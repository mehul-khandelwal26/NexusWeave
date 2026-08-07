/* ============================================================
   NexusWeave — Calendar System JavaScript Logic
   Supports: Global centered modal overlay (openGlobalCalendarModal),
             Full-month grid rendering, month navigation (< and >),
             Today date highlight, backend deadline count indicators,
             Date click task detail modal, past date validation (time travel prevention),
             and pre-filled task creation with Project dropdown selector.
   ============================================================ */

(function () {
  const api = window.NexusAPI;
  if (!api) return;

  const currentUser = api.getMe();
  if (!currentUser) return;

  let today = new Date();
  let currentYear = today.getFullYear();
  let currentMonth = today.getMonth(); // 0-indexed (0=Jan, 11=Dec)

  let calendarTasks = [];
  let countsByDate = {};
  let selectedDateKey = '';

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function formatZero(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function getDateKey(y, m, d) {
    return `${y}-${formatZero(m + 1)}-${formatZero(d)}`;
  }

  function esc(s) {
    if (typeof AppHelpers !== 'undefined' && AppHelpers.escapeHTML) {
      return AppHelpers.escapeHTML(s);
    }
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function loadCalendarData() {
    const res = await api.fetchCalendarTasks(currentYear, currentMonth + 1);
    if (res && res.success) {
      calendarTasks = res.tasks || [];
      countsByDate = res.countsByDate || {};
    } else {
      calendarTasks = [];
      countsByDate = {};
    }
    renderCalendar();
  }

  function renderCalendar() {
    const monthTitle = document.getElementById('calendarMonthTitle');
    if (monthTitle) {
      monthTitle.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
    }

    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    const dayHeadersHtml = `
      <div class="calendar-day-header">Sun</div>
      <div class="calendar-day-header">Mon</div>
      <div class="calendar-day-header">Tue</div>
      <div class="calendar-day-header">Wed</div>
      <div class="calendar-day-header">Thu</div>
      <div class="calendar-day-header">Fri</div>
      <div class="calendar-day-header">Sat</div>
    `;

    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const todayKey = `${today.getFullYear()}-${formatZero(today.getMonth() + 1)}-${formatZero(today.getDate())}`;

    let cellsHtml = '';

    // Prev month padding cells
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDay = daysInPrevMonth - i;
      const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYearIdx = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateKey = getDateKey(prevYearIdx, prevMonthIdx, prevDay);
      const isPast = dateKey < todayKey;
      cellsHtml += `
        <div class="calendar-cell is-outside-month ${isPast ? 'is-past-date' : ''}" data-date="${dateKey}">
          <div class="calendar-cell-top">
            <span class="calendar-day-num">${prevDay}</span>
          </div>
        </div>
      `;
    }

    // Current month cells
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = getDateKey(currentYear, currentMonth, day);
      const isToday = dateKey === todayKey;
      const isPast = dateKey < todayKey;
      const deadlineCount = countsByDate[dateKey] || 0;

      let badgeHtml = '';
      if (deadlineCount > 0) {
        badgeHtml = `
          <div class="deadline-badge-container">
            <span class="deadline-pill ${deadlineCount > 2 ? 'has-urgent' : ''}">
              📌 ${deadlineCount} ${deadlineCount === 1 ? 'task' : 'tasks'}
            </span>
          </div>
        `;
      }

      cellsHtml += `
        <div class="calendar-cell ${isToday ? 'is-today' : ''} ${isPast ? 'is-past-date' : ''}" data-date="${dateKey}">
          <div class="calendar-cell-top">
            <span class="calendar-day-num">${day}</span>
          </div>
          ${badgeHtml}
        </div>
      `;
    }

    // Next month padding cells
    const totalCellsSoFar = firstDayIndex + daysInMonth;
    const remainingCells = (42 - totalCellsSoFar) % 7 === 0 && totalCellsSoFar > 35 ? 0 : 35 - totalCellsSoFar;
    const nextCellsCount = remainingCells > 0 ? remainingCells : (42 - totalCellsSoFar);

    for (let day = 1; day <= nextCellsCount; day++) {
      const nextMonthIdx = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYearIdx = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateKey = getDateKey(nextYearIdx, nextMonthIdx, day);
      const isPast = dateKey < todayKey;
      cellsHtml += `
        <div class="calendar-cell is-outside-month ${isPast ? 'is-past-date' : ''}" data-date="${dateKey}">
          <div class="calendar-cell-top">
            <span class="calendar-day-num">${day}</span>
          </div>
        </div>
      `;
    }

    grid.innerHTML = dayHeadersHtml + cellsHtml;

    grid.querySelectorAll('.calendar-cell').forEach((cell) => {
      cell.addEventListener('click', () => {
        const dateKey = cell.dataset.date;
        if (dateKey) {
          openDateTasksModal(dateKey);
        }
      });
    });
  }

  /* ── Date Click Task List Modal with Past Date Validation ── */
  function openDateTasksModal(dateKey) {
    selectedDateKey = dateKey;
    const modal = document.getElementById('dateTasksModal');
    const titleEl = document.getElementById('dateModalTitle');
    const listEl = document.getElementById('dateTasksList');
    const openCreateBtn = document.getElementById('openCalendarCreateModalBtn');
    const footerEl = modal ? modal.querySelector('.task-modal-footer') : null;

    if (!modal || !listEl) return;

    const [y, m, d] = dateKey.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const formattedDate = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    if (titleEl) {
      titleEl.textContent = `Tasks Due on ${formattedDate}`;
    }

    modal.classList.remove('hidden');

    const todayStr = getDateKey(today.getFullYear(), today.getMonth(), today.getDate());
    const isPastDate = dateKey < todayStr;

    // Requirement 3: Past Date Validation (Time Travel Prevention)
    if (isPastDate) {
      if (openCreateBtn) openCreateBtn.classList.add('hidden');
      let notice = modal.querySelector('.past-date-notice');
      if (!notice && footerEl) {
        notice = document.createElement('span');
        notice.className = 'past-date-notice';
        notice.innerHTML = '⚠️ Cannot add tasks to past dates.';
        footerEl.prepend(notice);
      } else if (notice) {
        notice.classList.remove('hidden');
      }
    } else {
      if (openCreateBtn) openCreateBtn.classList.remove('hidden');
      const notice = modal.querySelector('.past-date-notice');
      if (notice) notice.classList.add('hidden');
    }

    const tasksOnDate = calendarTasks.filter((t) => {
      if (!t.dueDate) return false;
      return t.dueDate.startsWith(dateKey);
    });

    if (!tasksOnDate.length) {
      listEl.innerHTML = `<div class="empty-inline" style="padding: 2rem 1rem; text-align: center; color: var(--text-muted);">No tasks due on this date.${isPastDate ? '' : ' Click below to add a task!'}</div>`;
      return;
    }

    listEl.innerHTML = tasksOnDate.map((t) => {
      const priorityClass = t.priority === 'High' ? 'priority-high' : t.priority === 'Low' ? 'priority-low' : 'priority-medium';
      return `
        <div class="calendar-task-card">
          <div class="task-info-left">
            <strong>${esc(t.title)}</strong>
            ${t.description ? `<p>${esc(t.description)}</p>` : ''}
          </div>
          <div class="task-badges-right">
            <span class="badge ${priorityClass}">${esc(t.priority || 'Medium')}</span>
            <span class="badge" style="background: rgba(255,255,255,0.08); border: 1px solid var(--border);">${esc(t.status || 'Todo')}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ── Populate Projects Dropdown in Task Creation Modal ── */
  async function populateProjectsDropdown() {
    const projSelect = document.getElementById('newTaskProjectId');
    if (!projSelect) return;
    projSelect.innerHTML = `<option value="">No Project (General)</option>`;

    try {
      const userData = await api.getUserData();
      if (userData && Array.isArray(userData.projects) && userData.projects.length > 0) {
        userData.projects.forEach((p) => {
          const opt = document.createElement('option');
          opt.value = p.id || p._id;
          opt.textContent = p.name;
          projSelect.appendChild(opt);
        });
      }
    } catch (_) { /* optional fallback */ }
  }

  /* ── Setup Event Handlers using Global Document Event Delegation ── */
  let eventsInitialized = false;

  function initCalendarEvents() {
    if (eventsInitialized) return;
    eventsInitialized = true;

    document.addEventListener('click', (e) => {
      // 1. Prev Month Button
      const prevBtn = e.target.closest('#prevMonthBtn');
      if (prevBtn) {
        if (currentMonth === 0) {
          currentMonth = 11;
          currentYear--;
        } else {
          currentMonth--;
        }
        loadCalendarData();
        return;
      }

      // 2. Next Month Button
      const nextBtn = e.target.closest('#nextMonthBtn');
      if (nextBtn) {
        if (currentMonth === 11) {
          currentMonth = 0;
          currentYear++;
        } else {
          currentMonth++;
        }
        loadCalendarData();
        return;
      }

      // 3. Today Jump Button
      const todayBtn = e.target.closest('#todayJumpBtn');
      if (todayBtn) {
        today = new Date();
        currentYear = today.getFullYear();
        currentMonth = today.getMonth();
        loadCalendarData();
        return;
      }

      // 4. Close Date Tasks Modal (X Button)
      const closeDateBtn = e.target.closest('#closeDateTasksModal');
      if (closeDateBtn) {
        const dateModal = document.getElementById('dateTasksModal');
        if (dateModal) dateModal.classList.add('hidden');
        return;
      }

      // 5. Open Task Creation Modal (+ Add Task Button)
      const openCreateBtn = e.target.closest('#openCalendarCreateModalBtn');
      if (openCreateBtn) {
        const dateModal = document.getElementById('dateTasksModal');
        if (dateModal) dateModal.classList.add('hidden');
        openCalendarCreateModal();
        return;
      }

      // 6. Close Task Creation Modal (X / Cancel Buttons)
      const closeCreateBtn = e.target.closest('#closeCalendarCreateModal, #cancelCalendarCreateBtn');
      if (closeCreateBtn) {
        const createModal = document.getElementById('calendarCreateTaskModal');
        if (createModal) createModal.classList.add('hidden');
        return;
      }

      // 7. Close Global Calendar Modal (X Button)
      const closeGlobalBtn = e.target.closest('#closeCalendarGlobalModal');
      if (closeGlobalBtn) {
        const globalModal = document.getElementById('calendarGlobalModal');
        if (globalModal) globalModal.classList.add('hidden');
        return;
      }
    });

    // Delegated Form Submit Handler for #calendarTaskForm
    document.addEventListener('submit', async (e) => {
      if (e.target && e.target.id === 'calendarTaskForm') {
        e.preventDefault();
        const titleInput = document.getElementById('newTaskTitle');
        const dueDateInput = document.getElementById('newTaskDueDate');
        const projSelect = document.getElementById('newTaskProjectId');
        const priorityInput = document.getElementById('newTaskPriority');
        const statusInput = document.getElementById('newTaskStatus');
        const descInput = document.getElementById('newTaskDesc');

        const title = titleInput ? titleInput.value.trim() : '';
        const dueDate = dueDateInput ? dueDateInput.value : '';
        const projectId = projSelect ? projSelect.value : null;
        const priority = priorityInput ? priorityInput.value : 'Medium';
        const status = statusInput ? statusInput.value : 'Todo';
        const description = descInput ? descInput.value.trim() : '';

        if (!title || !dueDate) {
          alert('Please enter a task title and deadline date.');
          return;
        }

        const todayStr = getDateKey(today.getFullYear(), today.getMonth(), today.getDate());
        if (dueDate < todayStr) {
          alert('Cannot create tasks with a deadline in the past.');
          return;
        }

        const res = await api.createTask({
          title,
          dueDate,
          projectId: projectId || null,
          priority,
          status,
          description,
          assignedUserEmail: currentUser.email
        });

        if (res && res.success) {
          if (window.NexusNotify) {
            window.NexusNotify.add({ icon: '📅', text: `Task "${title}" created for ${dueDate}!`, type: 'success' });
          }
          const createModal = document.getElementById('calendarCreateTaskModal');
          if (createModal) createModal.classList.add('hidden');
          e.target.reset();
          loadCalendarData();
        } else {
          alert(res ? (res.error || 'Failed to create task') : 'Failed to create task.');
        }
      }
    });
  }

  function openCalendarCreateModal() {
    const createModal = document.getElementById('calendarCreateTaskModal');
    const dueDateInput = document.getElementById('newTaskDueDate');
    if (!createModal) return;

    if (dueDateInput && selectedDateKey) {
      dueDateInput.value = selectedDateKey;
    } else if (dueDateInput) {
      dueDateInput.value = getDateKey(today.getFullYear(), today.getMonth(), today.getDate());
    }

    populateProjectsDropdown();
    createModal.classList.remove('hidden');
  }

  // Global Function to Open Calendar Modal over any page
  window.openGlobalCalendarModal = function () {
    initCalendarEvents();
    const modal = document.getElementById('calendarGlobalModal');
    if (modal) {
      modal.classList.remove('hidden');
      loadCalendarData();
    }
  };

  // Immediate Initialization if DOM is already ready (dynamic script injection), or on DOMContentLoaded
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initCalendarEvents();
    loadCalendarData();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      initCalendarEvents();
      loadCalendarData();
    });
  }
})();
