/* ============================================================
   NexusWeave — Interactive Calendar Date & Clock Time Picker
   Supports: Calendar Date Selection, Locked/Unlocked Time Selector,
             Circular Clock Hour -> Minute step picker, and Reminder pairing.
   ============================================================ */

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.NexusDateTimePicker = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => api.initAll());
  } else {
    api.initAll();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Global Modal Elements Injection
  let calendarModal = null;
  let clockModal = null;

  function ensureModalsExist() {
    if (calendarModal && clockModal) return;

    // 1. Calendar Modal
    calendarModal = document.createElement('div');
    calendarModal.id = 'nexusCalendarModal';
    calendarModal.className = 'dt-picker-modal';
    calendarModal.innerHTML = `
      <div class="dt-picker-card">
        <div class="dt-picker-head">
          <span class="dt-picker-title">📅 Select Date</span>
          <button type="button" class="dt-picker-nav-btn" data-close-cal>×</button>
        </div>
        <div class="cal-month-nav">
          <button type="button" class="dt-picker-nav-btn" id="calPrevMonth">‹</button>
          <span class="cal-month-label" id="calMonthYearLabel">August 2026</span>
          <button type="button" class="dt-picker-nav-btn" id="calNextMonth">›</button>
        </div>
        <div class="cal-weekdays">
          <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
        </div>
        <div class="cal-days-grid" id="calDaysGrid"></div>
        <div class="dt-picker-actions">
          <button type="button" class="ghost-btn" id="calTodayBtn" style="font-size:0.8rem;padding:0.3rem 0.7rem;">Today</button>
          <button type="button" class="primary-btn" id="calConfirmBtn" style="font-size:0.8rem;padding:0.3rem 0.7rem;">Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(calendarModal);

    // 2. Clock Modal
    clockModal = document.createElement('div');
    clockModal.id = 'nexusClockModal';
    clockModal.className = 'dt-picker-modal';
    clockModal.innerHTML = `
      <div class="dt-picker-card">
        <div class="dt-picker-head">
          <span class="dt-picker-title">⏰ Select Time</span>
          <button type="button" class="dt-picker-nav-btn" data-close-clock>×</button>
        </div>
        <div class="clock-picker-container">
          <div class="clock-display-banner">
            <span class="clock-time-val" id="clockDisplayVal">09:00</span>
            <div class="clock-ampm-toggle">
              <button type="button" class="ampm-btn active" id="ampmAM">AM</button>
              <button type="button" class="ampm-btn" id="ampmPM">PM</button>
            </div>
          </div>
          <div class="clock-step-header">
            <span class="clock-step-title" id="clockStepTitle">Step 1: Pick Hour</span>
            <button type="button" class="ghost-btn hidden" id="clockBackToHour" style="font-size:0.75rem;padding:0.15rem 0.5rem;">← Hour</button>
          </div>
          <div class="clock-face" id="clockFace">
            <div class="clock-center-dot"></div>
            <div class="clock-hand" id="clockHand" style="transform: rotate(270deg);"></div>
            <div id="clockNumbersGroup"></div>
          </div>
        </div>
        <div class="dt-picker-actions">
          <button type="button" class="ghost-btn" id="clockClearBtn" style="font-size:0.8rem;padding:0.3rem 0.7rem;">Clear</button>
          <button type="button" class="primary-btn" id="clockConfirmBtn" style="font-size:0.8rem;padding:0.3rem 0.7rem;">Confirm Time</button>
        </div>
      </div>
    `;
    document.body.appendChild(clockModal);
  }

  /* ─────────────────────────────────────────────
     CALENDAR CONTROLLER
  ───────────────────────────────────────────── */
  let activeDatePickerInstance = null;
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();

  function openCalendar(instance) {
    ensureModalsExist();
    activeDatePickerInstance = instance;

    const initialDate = instance.selectedDate ? new Date(instance.selectedDate) : new Date();
    viewYear = initialDate.getFullYear();
    viewMonth = initialDate.getMonth();

    renderCalendarGrid();

    calendarModal.classList.add('is-open');

    // Bind Close & Nav Handlers
    calendarModal.querySelector('[data-close-cal]').onclick = closeCalendar;
    document.getElementById('calPrevMonth').onclick = () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderCalendarGrid();
    };
    document.getElementById('calNextMonth').onclick = () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderCalendarGrid();
    };
    document.getElementById('calTodayBtn').onclick = () => {
      const today = new Date();
      viewYear = today.getFullYear();
      viewMonth = today.getMonth();
      selectDate(today.getFullYear(), today.getMonth(), today.getDate());
    };
    document.getElementById('calConfirmBtn').onclick = closeCalendar;
  }

  function closeCalendar() {
    if (calendarModal) calendarModal.classList.remove('is-open');
  }

  function renderCalendarGrid() {
    const label = document.getElementById('calMonthYearLabel');
    const grid = document.getElementById('calDaysGrid');
    if (!label || !grid) return;

    label.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === viewYear && today.getMonth() === viewMonth;
    const selected = activeDatePickerInstance?.selectedDate ? new Date(activeDatePickerInstance.selectedDate) : null;

    let cellsHTML = '';

    // Previous month padding days
    for (let i = firstDay - 1; i >= 0; i--) {
      cellsHTML += `<div class="cal-day-cell other-month">${prevMonthDays - i}</div>`;
    }

    // Days of month
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = isCurrentMonth && today.getDate() === d;
      const isSel = selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === d;

      let classes = ['cal-day-cell'];
      if (isToday) classes.push('today');
      if (isSel) classes.push('selected');

      cellsHTML += `<div class="${classes.join(' ')}" data-day="${d}">${d}</div>`;
    }

    grid.innerHTML = cellsHTML;

    grid.querySelectorAll('[data-day]').forEach(cell => {
      cell.onclick = () => {
        const day = parseInt(cell.dataset.day, 10);
        selectDate(viewYear, viewMonth, day);
      };
    });
  }

  function selectDate(year, month, day) {
    const dateObj = new Date(year, month, day);
    const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    if (activeDatePickerInstance) {
      activeDatePickerInstance.setDate(isoDate, dateObj);
    }
    renderCalendarGrid();
  }

  /* ─────────────────────────────────────────────
     CLOCK TIME PICKER CONTROLLER
  ───────────────────────────────────────────── */
  let activeTimePickerInstance = null;
  let clockStep = 'hour'; // 'hour' | 'minute'
  let selectedHour = 9; // 1-12
  let selectedMinute = 0; // 0-59
  let selectedAmPm = 'AM';

  function openClock(instance) {
    ensureModalsExist();
    activeTimePickerInstance = instance;

    // Parse existing time if available (format "HH:MM AM/PM" or "HH:MM")
    if (instance.selectedTime) {
      const parts = instance.selectedTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (parts) {
        let h = parseInt(parts[1], 10);
        selectedMinute = parseInt(parts[2], 10);
        if (parts[3]) {
          selectedAmPm = parts[3].toUpperCase();
          selectedHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
        } else {
          selectedAmPm = h >= 12 ? 'PM' : 'AM';
          selectedHour = h % 12 === 0 ? 12 : h % 12;
        }
      }
    }

    clockStep = 'hour';
    renderClockFace();

    clockModal.classList.add('is-open');

    // Event Listeners
    clockModal.querySelector('[data-close-clock]').onclick = closeClock;
    document.getElementById('ampmAM').onclick = () => { setAmPm('AM'); };
    document.getElementById('ampmPM').onclick = () => { setAmPm('PM'); };
    document.getElementById('clockBackToHour').onclick = () => {
      clockStep = 'hour';
      renderClockFace();
    };
    document.getElementById('clockClearBtn').onclick = () => {
      if (activeTimePickerInstance) activeTimePickerInstance.clearTime();
      closeClock();
    };
    document.getElementById('clockConfirmBtn').onclick = () => {
      confirmTimeSelection();
      closeClock();
    };
  }

  function closeClock() {
    if (clockModal) clockModal.classList.remove('is-open');
  }

  function setAmPm(ampm) {
    selectedAmPm = ampm;
    document.getElementById('ampmAM').className = `ampm-btn ${ampm === 'AM' ? 'active' : ''}`;
    document.getElementById('ampmPM').className = `ampm-btn ${ampm === 'PM' ? 'active' : ''}`;
    updateClockDisplay();
  }

  function updateClockDisplay() {
    const display = document.getElementById('clockDisplayVal');
    if (!display) return;
    const hStr = String(selectedHour).padStart(2, '0');
    const mStr = String(selectedMinute).padStart(2, '0');
    display.textContent = `${hStr}:${mStr}`;
  }

  function renderClockFace() {
    updateClockDisplay();

    const titleEl = document.getElementById('clockStepTitle');
    const backBtn = document.getElementById('clockBackToHour');
    const hand = document.getElementById('clockHand');
    const group = document.getElementById('clockNumbersGroup');

    if (clockStep === 'hour') {
      titleEl.textContent = 'Step 1: Pick Hour (1-12)';
      backBtn.classList.add('hidden');

      // Hand Angle for Hours (30deg per hour, 12 = 0deg)
      const angle = (selectedHour % 12) * 30;
      hand.style.transform = `rotate(${angle}deg)`;

      // Render 12 numbers in circle (radius ~82px)
      let numHTML = '';
      const radius = 82;
      const center = 110; // center of 220px box

      for (let h = 1; h <= 12; h++) {
        const deg = (h % 12) * 30;
        const rad = (deg - 90) * (Math.PI / 180);
        const x = Math.round(center + radius * Math.cos(rad) - 16);
        const y = Math.round(center + radius * Math.sin(rad) - 16);

        const isSel = selectedHour === h;
        numHTML += `<div class="clock-num ${isSel ? 'selected' : ''}" style="left:${x}px;top:${y}px;" data-hour="${h}">${h}</div>`;
      }

      group.innerHTML = numHTML;

      group.querySelectorAll('[data-hour]').forEach(num => {
        num.onclick = () => {
          selectedHour = parseInt(num.dataset.hour, 10);
          updateClockDisplay();
          // Transition smoothly to Minute Selection!
          clockStep = 'minute';
          renderClockFace();
        };
      });

    } else {
      titleEl.textContent = 'Step 2: Pick Minute';
      backBtn.classList.remove('hidden');

      // Hand Angle for Minutes (6deg per minute)
      const angle = selectedMinute * 6;
      hand.style.transform = `rotate(${angle}deg)`;

      let numHTML = '';
      const radius = 82;
      const center = 110;

      // Show 5-minute intervals (00, 05, 10 ... 55)
      for (let i = 0; i < 12; i++) {
        const m = i * 5;
        const deg = i * 30;
        const rad = (deg - 90) * (Math.PI / 180);
        const x = Math.round(center + radius * Math.cos(rad) - 16);
        const y = Math.round(center + radius * Math.sin(rad) - 16);

        const isSel = Math.floor(selectedMinute / 5) * 5 === m;
        const mStr = String(m).padStart(2, '0');
        numHTML += `<div class="clock-num ${isSel ? 'selected' : ''}" style="left:${x}px;top:${y}px;" data-minute="${m}">${mStr}</div>`;
      }

      group.innerHTML = numHTML;

      group.querySelectorAll('[data-minute]').forEach(num => {
        num.onclick = () => {
          selectedMinute = parseInt(num.dataset.minute, 10);
          updateClockDisplay();
          confirmTimeSelection();
          closeClock();
        };
      });
    }
  }

  function confirmTimeSelection() {
    const hStr = String(selectedHour).padStart(2, '0');
    const mStr = String(selectedMinute).padStart(2, '0');
    const formatted = `${hStr}:${mStr} ${selectedAmPm}`;
    
    // ISO 24h format for hidden form values
    let h24 = selectedHour;
    if (selectedAmPm === 'PM' && h24 < 12) h24 += 12;
    if (selectedAmPm === 'AM' && h24 === 12) h24 = 0;
    const isoTime = `${String(h24).padStart(2, '0')}:${mStr}`;

    if (activeTimePickerInstance) {
      activeTimePickerInstance.setTime(formatted, isoTime);
    }
  }

  /* ─────────────────────────────────────────────
     DATETIME PICKER WIDGET INSTANCE
  ───────────────────────────────────────────── */
  class DateTimePickerPair {
    constructor(config) {
      this.dateInputId = config.dateInputId;
      this.timeInputId = config.timeInputId;
      this.label = config.label || 'Date';
      this.icon = config.icon || '📅';

      this.dateInput = document.getElementById(this.dateInputId);
      this.timeInput = document.getElementById(this.timeInputId);

      this.selectedDate = '';
      this.selectedTime = '';
      this.selectedTimeIso = '';

      this.initUI();
    }

    initUI() {
      if (!this.dateInput || !this.timeInput) return;

      // Hide default raw inputs and replace with custom buttons
      this.dateInput.style.display = 'none';
      this.timeInput.style.display = 'none';

      let container = this.dateInput.closest('.field') || this.dateInput.parentElement;

      // Create Custom Trigger Container
      const triggerGroup = document.createElement('div');
      triggerGroup.className = 'datetime-picker-group';
      triggerGroup.innerHTML = `
        <div class="datetime-field-box">
          <button type="button" class="datetime-trigger-btn date-trigger" id="${this.dateInputId}_btn">
            <span class="trigger-icon">📅</span>
            <span class="trigger-text">Select Date</span>
            <span class="trigger-clear hidden" title="Clear Date">×</span>
          </button>
        </div>
        <div class="datetime-field-box">
          <button type="button" class="datetime-trigger-btn time-trigger is-locked" id="${this.timeInputId}_btn" disabled title="Select date first to unlock time">
            <span class="trigger-icon">🔒</span>
            <span class="trigger-text">Time Locked</span>
            <span class="trigger-clear hidden" title="Clear Time">×</span>
          </button>
        </div>
      `;

      container.appendChild(triggerGroup);

      this.dateBtn = document.getElementById(`${this.dateInputId}_btn`);
      this.timeBtn = document.getElementById(`${this.timeInputId}_btn`);

      // Bind Clicks
      this.dateBtn.onclick = (e) => {
        if (e.target.classList.contains('trigger-clear')) {
          this.clearDate();
          return;
        }
        openCalendar(this);
      };

      this.timeBtn.onclick = (e) => {
        if (e.target.classList.contains('trigger-clear')) {
          this.clearTime();
          return;
        }
        if (!this.selectedDate) return;
        openClock(this);
      };

      // Restore initial values if inputs already have text
      if (this.dateInput.value) {
        this.setDate(this.dateInput.value, new Date(this.dateInput.value));
      }
      if (this.timeInput.value) {
        this.setTime(this.timeInput.value, this.timeInput.value);
      }

      // Bind Form Reset Event Listener
      if (this.dateInput.form) {
        this.dateInput.form.addEventListener('reset', () => {
          setTimeout(() => this.reset(), 0);
        });
      }
    }

    reset() {
      this.clearDate();
    }

    setDate(isoDate, dateObj) {
      this.selectedDate = isoDate;
      this.dateInput.value = isoDate;
      this.dateInput.dispatchEvent(new Event('change', { bubbles: true }));

      const dayStr = DAY_NAMES[dateObj.getDay()];
      const monthStr = MONTH_NAMES[dateObj.getMonth()].slice(0, 3);
      const formattedDate = `${dayStr}, ${monthStr} ${dateObj.getDate()}`;

      const textEl = this.dateBtn.querySelector('.trigger-text');
      const clearEl = this.dateBtn.querySelector('.trigger-clear');
      textEl.textContent = formattedDate;
      clearEl.classList.remove('hidden');

      // Unlock Time Button!
      this.timeBtn.disabled = false;
      this.timeBtn.classList.remove('is-locked');
      this.timeBtn.title = 'Select Time';
      const timeIcon = this.timeBtn.querySelector('.trigger-icon');
      const timeText = this.timeBtn.querySelector('.trigger-text');

      if (!this.selectedTime) {
        timeIcon.textContent = '⏰';
        timeText.textContent = 'Select Time';
      }
    }

    clearDate() {
      this.selectedDate = '';
      this.dateInput.value = '';

      const textEl = this.dateBtn.querySelector('.trigger-text');
      const clearEl = this.dateBtn.querySelector('.trigger-clear');
      if (textEl) textEl.textContent = 'Select Date';
      if (clearEl) clearEl.classList.add('hidden');

      // Lock Time Button again!
      this.clearTime();
      if (this.timeBtn) {
        this.timeBtn.disabled = true;
        this.timeBtn.classList.add('is-locked');
        this.timeBtn.title = 'Select date first to unlock time';

        const timeIcon = this.timeBtn.querySelector('.trigger-icon');
        const timeText = this.timeBtn.querySelector('.trigger-text');
        if (timeIcon) timeIcon.textContent = '🔒';
        if (timeText) timeText.textContent = 'Time Locked';
      }
    }

    setTime(formattedTime, isoTime) {
      this.selectedTime = formattedTime;
      this.selectedTimeIso = isoTime;
      this.timeInput.value = isoTime || formattedTime;

      const textEl = this.timeBtn.querySelector('.trigger-text');
      const clearEl = this.timeBtn.querySelector('.trigger-clear');
      if (textEl) textEl.textContent = formattedTime;
      if (clearEl) clearEl.classList.remove('hidden');
    }

    clearTime() {
      this.selectedTime = '';
      this.selectedTimeIso = '';
      this.timeInput.value = '';

      const textEl = this.timeBtn.querySelector('.trigger-text');
      const clearEl = this.timeBtn.querySelector('.trigger-clear');
      if (textEl) textEl.textContent = this.selectedDate ? 'Select Time' : 'Time Locked';
      if (clearEl) clearEl.classList.add('hidden');
    }
  }

  const activePairs = [];

  /* ─────────────────────────────────────────────
     AUTOMATIC BINDER FOR ALL FORMS
  ───────────────────────────────────────────── */
  function initAll() {
    // 1. create.html Deadline Pair
    if (document.getElementById('task-deadline-date') && document.getElementById('task-deadline-time')) {
      activePairs.push(new DateTimePickerPair({
        dateInputId: 'task-deadline-date',
        timeInputId: 'task-deadline-time',
        label: 'Deadline'
      }));
    }

    // 2. create.html Reminder Pair
    if (document.getElementById('task-reminder-date') && document.getElementById('task-reminder-time')) {
      activePairs.push(new DateTimePickerPair({
        dateInputId: 'task-reminder-date',
        timeInputId: 'task-reminder-time',
        label: 'Reminder'
      }));
    }

    // 3. tasks.html & board.html Task Modal (taskDueDate & taskReminderDate)
    if (document.getElementById('taskDueDate')) {
      let dueTimeInput = document.getElementById('taskDueTime');
      if (!dueTimeInput) {
        dueTimeInput = document.createElement('input');
        dueTimeInput.id = 'taskDueTime';
        dueTimeInput.type = 'hidden';
        document.getElementById('taskDueDate').parentElement.appendChild(dueTimeInput);
      }

      activePairs.push(new DateTimePickerPair({
        dateInputId: 'taskDueDate',
        timeInputId: 'taskDueTime',
        label: 'Due Date'
      }));
    }

    if (document.getElementById('taskReminderDate')) {
      let reminderTimeInput = document.getElementById('taskReminderTime');
      if (!reminderTimeInput) {
        reminderTimeInput = document.createElement('input');
        reminderTimeInput.id = 'taskReminderTime';
        reminderTimeInput.type = 'hidden';
        document.getElementById('taskReminderDate').parentElement.appendChild(reminderTimeInput);
      }

      activePairs.push(new DateTimePickerPair({
        dateInputId: 'taskReminderDate',
        timeInputId: 'taskReminderTime',
        label: 'Reminder'
      }));
    }
  }

  function resetAll() {
    activePairs.forEach(pair => pair.reset());
  }

  function resetForm(form) {
    if (!form) return;
    form.reset();
    activePairs.forEach(pair => {
      if (pair.dateInput && pair.dateInput.form === form) {
        pair.reset();
      }
    });
  }

  return {
    initAll,
    resetAll,
    resetForm,
    DateTimePickerPair
  };
});
