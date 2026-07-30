(function () {
  const SESSION_KEY = 'session';
  const DB_KEY = 'users';
  const TIMER_STATE_KEY = 'nexus-focus-timer-state';
  
  const timerDisplay = document.getElementById('timerDisplay');
  const timerStatus = document.getElementById('timerStatus');
  const startButton = document.getElementById('startTimer');
  const pauseButton = document.getElementById('pauseTimer');
  const resetButton = document.getElementById('resetTimer');
  const customMinutesInput = document.getElementById('customMinutes');

  const sessionEmail = localStorage.getItem(SESSION_KEY);
  const database = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
  const currentUser = sessionEmail ? database[sessionEmail] : null;

  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  let totalSeconds = 25 * 60;
  if (customMinutesInput) {
    totalSeconds = (parseInt(customMinutesInput.value, 10) || 25) * 60;
  }
  let remainingSeconds = totalSeconds;
  let timerId = null;
  let isRunning = false;

  function saveTimerState() {
    if (isRunning) {
      localStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
        isRunning: true,
        totalSeconds: totalSeconds,
        endTime: Date.now() + remainingSeconds * 1000
      }));
    } else {
      localStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
        isRunning: false,
        totalSeconds: totalSeconds,
        pausedRemainingSeconds: remainingSeconds
      }));
    }
  }

  function clearTimerState() {
    localStorage.removeItem(TIMER_STATE_KEY);
  }

  function renderTimer() {
    const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
    const seconds = String(remainingSeconds % 60).padStart(2, '0');
    timerDisplay.textContent = `${minutes}:${seconds}`;
    timerStatus.textContent = isRunning ? 'Deep work in progress' : remainingSeconds === totalSeconds ? 'Ready to focus' : 'Paused';
  }

  function tick() {
    if (!isRunning) return;
    if (remainingSeconds <= 0) {
      clearInterval(timerId);
      isRunning = false;
      timerStatus.textContent = 'Session complete 🎉';
      if (customMinutesInput) {
        customMinutesInput.disabled = false;
      }

      // Log Focus Activity
      const focusMins = customMinutesInput ? (parseInt(customMinutesInput.value, 10) || 25) : 25;
      if (sessionEmail && database[sessionEmail]) {
        const user = database[sessionEmail];
        if (!user.activity) user.activity = [];
        user.activity.unshift({
          id: `act-focus-${Date.now()}`,
          text: `Completed a ${focusMins}-minute Focus Sprint! ⏱️`,
          time: 'Just now',
          createdAt: new Date().toISOString()
        });
        database[sessionEmail] = user;
        localStorage.setItem(DB_KEY, JSON.stringify(database));
        window.dispatchEvent(new CustomEvent('nexus:tasks-updated'));
      }

      clearTimerState();
      return;
    }

    remainingSeconds -= 1;
    saveTimerState();
    renderTimer();
  }

  function startTimer() {
    if (isRunning) return;
    if (customMinutesInput) {
      customMinutesInput.disabled = true;
    }
    isRunning = true;
    saveTimerState();
    timerId = setInterval(tick, 1000);
    renderTimer();
  }

  function pauseTimer() {
    isRunning = false;
    clearInterval(timerId);
    if (customMinutesInput) {
      customMinutesInput.disabled = false;
    }
    saveTimerState();
    renderTimer();
  }

  function resetTimer() {
    isRunning = false;
    clearInterval(timerId);
    clearTimerState();
    if (customMinutesInput) {
      customMinutesInput.disabled = false;
      const mins = Math.max(1, parseInt(customMinutesInput.value, 10) || 25);
      totalSeconds = mins * 60;
    }
    remainingSeconds = totalSeconds;
    renderTimer();
  }

  function loadTimerState() {
    try {
      const saved = JSON.parse(localStorage.getItem(TIMER_STATE_KEY));
      if (!saved) return;
      
      totalSeconds = saved.totalSeconds || 25 * 60;
      if (customMinutesInput) {
        customMinutesInput.value = totalSeconds / 60;
      }
      
      if (saved.isRunning) {
        const remaining = Math.round((saved.endTime - Date.now()) / 1000);
        if (remaining > 0) {
          remainingSeconds = remaining;
          isRunning = true;
          if (customMinutesInput) {
            customMinutesInput.disabled = true;
          }
          timerId = setInterval(tick, 1000);
        } else {
          remainingSeconds = 0;
          isRunning = false;
          timerStatus.textContent = 'Session complete';
          clearTimerState();
        }
      } else {
        remainingSeconds = saved.pausedRemainingSeconds || totalSeconds;
      }
    } catch (e) {
      console.error('Failed to load timer state:', e);
    }
  }

  customMinutesInput?.addEventListener('change', () => {
    if (isRunning) return;
    const mins = Math.max(1, parseInt(customMinutesInput.value, 10) || 25);
    customMinutesInput.value = mins;
    totalSeconds = mins * 60;
    remainingSeconds = totalSeconds;
    renderTimer();
  });

  startButton?.addEventListener('click', startTimer);
  pauseButton?.addEventListener('click', pauseTimer);
  resetButton?.addEventListener('click', resetTimer);

  loadTimerState();
  renderTimer();
})();
