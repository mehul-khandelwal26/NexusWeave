/**
 * NexusWeave — Interactive Team Productivity & Focus ROI Calculator
 */

(function () {
  function updateCalculator() {
    const teamInput = document.getElementById('calcTeamSize');
    const sprintsInput = document.getElementById('calcFocusSprints');

    const teamVal = document.getElementById('calcTeamVal');
    const sprintsVal = document.getElementById('calcSprintsVal');

    const resultHours = document.getElementById('calcResultHours');
    const resultVelocity = document.getElementById('calcResultVelocity');
    const resultFriction = document.getElementById('calcResultFriction');

    if (!teamInput || !sprintsInput) return;

    const team = parseInt(teamInput.value, 10) || 10;
    const sprints = parseInt(sprintsInput.value, 10) || 4;

    if (teamVal) teamVal.textContent = team + (team === 1 ? ' Member' : ' Members');
    if (sprintsVal) sprintsVal.textContent = sprints + (sprints === 1 ? ' Sprint / Day' : ' Sprints / Day');

    // Calculations
    const hoursSavedMonth = Math.round(team * sprints * 0.42 * 21);
    const velocityBoost = Math.min(65, Math.round(20 + sprints * 4.5));
    const frictionDrop = Math.min(85, Math.round(35 + team * 0.5));

    if (resultHours) resultHours.textContent = hoursSavedMonth + ' Hours';
    if (resultVelocity) resultVelocity.textContent = '+' + velocityBoost + '%';
    if (resultFriction) resultFriction.textContent = '-' + frictionDrop + '%';
  }

  window.addEventListener('DOMContentLoaded', () => {
    const teamInput = document.getElementById('calcTeamSize');
    const sprintsInput = document.getElementById('calcFocusSprints');

    if (teamInput) teamInput.addEventListener('input', updateCalculator);
    if (sprintsInput) sprintsInput.addEventListener('input', updateCalculator);

    updateCalculator();
  });
})();
