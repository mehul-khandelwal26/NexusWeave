(function () {
  const SESSION_KEY = 'session';
  const DB_KEY = 'users';
  const timerDisplay = document.getElementById('timerDisplay');
  const timerStatus = document.getElementById('timerStatus');
  const startButton = document.getElementById('startTimer');
  const pauseButton = document.getElementById('pauseTimer');
  const resetButton = document.getElementById('resetTimer');

  const sessionEmail = localStorage.getItem(SESSION_KEY);
  const database = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
  const currentUser = sessionEmail ? database[sessionEmail] : null;

  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  let totalSeconds = 25 * 60;
  let remainingSeconds = totalSeconds;
  let timerId = null;
  let isRunning = false;

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
      timerStatus.textContent = 'Session complete';
      return;
    }

    remainingSeconds -= 1;
    renderTimer();
  }

  function startTimer() {
    if (isRunning) return;
    isRunning = true;
    timerId = setInterval(tick, 1000);
    renderTimer();
  }

  function pauseTimer() {
    isRunning = false;
    clearInterval(timerId);
    renderTimer();
  }

  function resetTimer() {
    isRunning = false;
    clearInterval(timerId);
    remainingSeconds = totalSeconds;
    renderTimer();
  }

  startButton?.addEventListener('click', startTimer);
  pauseButton?.addEventListener('click', pauseTimer);
  resetButton?.addEventListener('click', resetTimer);

  renderTimer();
})();
