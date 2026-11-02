
const $ = id => document.getElementById(id);
const $$ = selector => document.querySelectorAll(selector);

const KEY = 'biostep-demo-2026';

// Parámetros iniciales
const defaults = {
  weight: 70,
  stride: 70,
  goal: 6000,
  alpha: 0.75,
  beta: 0.18,
  r: 0.12,
  c: 0.11,
  threshold: 0.65
};

// Escenarios de simulación
const scenarios = {
  normal: {
    name: 'Caminata normal',
    left: 50,
    load: 0.45,
    cadence: 105
  },
  izquierda: {
    name: 'Sobrecarga izquierda',
    left: 77,
    load: 0.72,
    cadence: 95
  },
  derecha: {
    name: 'Sobrecarga derecha',
    left: 23,
    load: 0.72,
    cadence: 95
  },
  intenso: {
    name: 'Ejercicio intenso',
    left: 64,
    load: 0.87,
    cadence: 155
  },
  descanso: {
    name: 'Descanso',
    left: 50,
    load: 0,
    cadence: 0
  }
};

const clamp = (n, min, max) =>
  Math.min(max, Math.max(min, n));

const format = n =>
  Math.floor(n).toLocaleString('es-PE');

const clock = sec =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

// Recuperar datos del navegador
let saved = {};

try {
  saved = JSON.parse(localStorage.getItem(KEY)) || {};
} catch (e) {}

let cfg = {
  ...defaults,
  ...(saved.cfg || {})
};

let state = {
  running: false,
  scenario: saved.scenario || 'normal',
  seconds: saved.seconds || 0,
  steps: saved.steps || 0,
  stress: saved.stress || 0,
  freshness: saved.freshness ?? 1,
  left: saved.left ?? 50,
  alerts: saved.alerts || [],
  history: saved.history || [],
  lastAlert: {}
};

if (!scenarios[state.scenario]) {
  state.scenario = 'normal';
}

let timer = null;

let series = [{
  stress: state.stress,
  freshness: state.freshness
}];

// GUARDAR DATOS
function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      ...state,
      running: false,
      cfg
    }));
  } catch (e) {}
}

// MENSAJES EMERGENTES
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    $('toast').classList.remove('show');
  }, 2800);
}

// NAVEGACIÓN ENTRE INTERFACES
function goTo(page) {
  $$('.view').forEach(view => {
    view.classList.toggle('active', view.id === page);
  });

  $$('.nav').forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.page === page
    );
  });

  const label = document.querySelector(
    `.nav[data-page="${page}"]`
  );

  $('currentTitle').textContent = label
    ? label.textContent.trim()
    : 'BioStep';

  $('sidebar').classList.remove('open');
  window.scrollTo(0, 0);
  drawCharts();
}

$$('[data-page]').forEach(button => {
  button.addEventListener('click', () => {
    goTo(button.dataset.page);
  });
});

$('menuBtn').addEventListener('click', () => {
  $('sidebar').classList.toggle('open');
});

// SISTEMA DE ALERTAS
function addAlert(type, message) {
  if (
    state.lastAlert[type] !== undefined &&
    state.seconds - state.lastAlert[type] < 90
  ) {
    return;
  }

  state.lastAlert[type] = state.seconds;

  state.alerts.unshift({
    time: clock(state.seconds),
    message
  });

  state.alerts = state.alerts.slice(0, 50);

  toast('⚠ ' + message);
}

// SIMULACIÓN PRINCIPAL
function step() {
  const mode = scenarios[state.scenario];

  // Cada segundo real equivale a diez segundos virtuales
  const dt = 10 / 60;

  state.seconds += 10;

  // Distribución del peso
  state.left = mode.cadence
    ? clamp(
        mode.left + Math.sin(state.seconds / 25) * 2,
        5,
        95
      )
    : 50;

  // Conteo de pasos
  state.steps += mode.cadence * dt;

  /*
    ECUACIÓN DIFERENCIAL 1

    dS/dt = alfa * |P - Pideal| - beta * S

    S = Estrés acumulado
    P = Presión simulada
    Pideal = Presión de referencia
  */

  // Durante el descanso no hay impacto activo
  const deviation = mode.cadence
    ? Math.abs(mode.load - 0.45) +
      Math.abs(state.left - 50) / 100
    : 0;

  // Aproximación por el método de Euler
  state.stress = clamp(
    state.stress + dt * (
      cfg.alpha * deviation -
      cfg.beta * state.stress
    ),
    0,
    3
  );

  /*
    ECUACIÓN DIFERENCIAL 2

    dF/dt = r(1 - F) - cP

    F = Frescura muscular
    r = Recuperación natural
    c = Desgaste muscular
    P = Carga aplicada
  */

  state.freshness = clamp(
    state.freshness + dt * (
      cfg.r * (1 - state.freshness) -
      cfg.c * mode.load
    ),
    0,
    1
  );

  // DETECCIÓN DE ANOMALÍAS

  if (Math.abs(state.left - 50) >= 18) {
    addAlert(
      'presion',
      'Presión desigual entre ambos pies.'
    );
  }

  if (state.stress >= cfg.threshold) {
    addAlert(
      'estres',
      'Estrés postural por encima del umbral.'
    );
  }

  if (state.freshness <= 0.3) {
    addAlert(
      'fatiga',
      'Nivel de frescura muscular bajo.'
    );
  }

  // GUARDAR HISTORIAL
  state.history.unshift({
    time: clock(state.seconds),
    mode: mode.name,
    left: Math.round(state.left),
    stress: state.stress.toFixed(3),
    freshness: state.freshness.toFixed(3)
  });

  state.history = state.history.slice(0, 200);

  // DATOS PARA LOS GRÁFICOS
  series.push({
    stress: state.stress,
    freshness: state.freshness
  });

  series = series.slice(-70);

  store();
  render();
}

// INICIAR O PAUSAR SIMULACIÓN
function toggle() {
  state.running = !state.running;

  clearInterval(timer);

  if (state.running) {
    timer = setInterval(step, 1000);
    toast('Simulación iniciada.');
  } else {
    toast('Simulación pausada.');
  }

  render();
}

// REINICIAR DATOS
function reset() {
  clearInterval(timer);
  timer = null;

  Object.assign(state, {
    running: false,
    seconds: 0,
    steps: 0,
    stress: 0,
    freshness: 1,
    left: 50,
    alerts: [],
    history: [],
    lastAlert: {}
  });

  series = [{
    stress: 0,
    freshness: 1
  }];

  store();
  render();
  toast('Sesión reiniciada.');
}

// BOTONES PARA INICIAR Y DETENER
[
  'topToggle',
  'startBtn',
  'activityToggle'
].forEach(id => {
  $(id).addEventListener('click', toggle);
});

// BOTONES PARA REINICIAR
[
  'resetBtn',
  'activityReset'
].forEach(id => {
  $(id).addEventListener('click', reset);
});

// CAMBIAR TIPO DE PISADA
$('scenario').addEventListener('change', e => {
  state.scenario = e.target.value;

  state.left = scenarios[state.scenario].left;
  state.lastAlert = {};

  store();
  render();

  toast('Escenario cambiado.');
});

// ACTUALIZACIÓN DE INTERFACES
function render() {
  const mode = scenarios[state.scenario];

  const left = Math.round(state.left);
  const right = 100 - left;

  const score = clamp(
    100 - Math.abs(left - 50) * 2,
    0,
    100
  );

  // Estimaciones simplificadas
  const calories = state.steps * cfg.weight * 0.0005;
  const distance = state.steps * cfg.stride / 100000;

  const situation =
    state.stress >= cfg.threshold
      ? 'Estrés elevado'
      : Math.abs(left - 50) >= 18
        ? 'Desequilibrio'
        : 'Normal';

  const txt = (id, value) => {
    $(id).textContent = value;
  };

  // PANEL PRINCIPAL
  txt('sSteps', format(state.steps));
  txt('sCalories', calories.toFixed(1));
  txt('sBalance', score);
  txt('sStress', state.stress.toFixed(3));

  txt('homeLeft', left + '%');
  txt('homeRight', right + '%');

  $('homeBar').style.width = left + '%';

  txt(
    'homeMessage',
    situation === 'Normal'
      ? '✓ La pisada se encuentra equilibrada.'
      : '⚠ ' + situation + '. Revisa el escenario.'
  );

  // ANÁLISIS DE PISADA
  txt('footLeft', left + '%');
  txt('footRight', right + '%');

  txt('asymmetry', Math.abs(left - right) + '%');
  txt('pressure', mode.load.toFixed(2));

  txt(
    'cadence',
    mode.cadence + ' pasos/min'
  );

  txt('walkingState', situation);

  $('walkingState').className =
    situation === 'Normal' ? 'good' : 'bad';

  txt(
    'footAdvice',
    situation === 'Normal'
      ? 'La distribución de carga es estable en este escenario.'
      : 'Se ha detectado una condición de sobrecarga simulada.'
  );

  // SENSORES VIRTUALES
  $$('.sensor').forEach((sensor, i) => {
    const pressure =
      (i < 3 ? left : right) +
      (i % 3 === 0 ? 12 : i % 3 === 2 ? -12 : 0);

    sensor.className =
      'sensor ' +
      (i % 3 === 0
        ? 'toe'
        : i % 3 === 1
          ? 'middle'
          : 'heel') +
      (pressure > 68
        ? ' high'
        : pressure > 48
          ? ' medium'
          : '');
  });

  // ACTIVIDAD FÍSICA
  txt('aSteps', format(state.steps));
  txt('aCalories', calories.toFixed(1));
  txt('aDistance', distance.toFixed(2));
  txt('aTime', clock(state.seconds));

  txt(
    'goalText',
    format(state.steps) +
    ' / ' +
    format(cfg.goal) +
    ' pasos'
  );

  const completed = clamp(
    state.steps / cfg.goal * 100,
    0,
    100
  );

  $('goalBar').style.width = completed + '%';

  txt(
    'goalPercent',
    Math.round(completed) + '% completado'
  );

  txt(
    'sessionStatus',
    state.running
      ? 'Sesión simulada en marcha.'
      : 'La simulación está detenida.'
  );

  // MODELOS MATEMÁTICOS
  txt('mStress', state.stress.toFixed(3));
  txt('mFresh', state.freshness.toFixed(3));

  // ALERTAS
  txt('alertCount', state.alerts.length);
  txt('alertStress', state.stress.toFixed(3));
  txt('alertFresh', state.freshness.toFixed(3));
  txt('alertStatus', situation);

  // ESTADO DE LOS BOTONES
  txt(
    'topToggle',
    state.running ? 'Ⅱ Pausar' : '▶ Iniciar'
  );

  txt(
    'startBtn',
    state.running
      ? 'Ⅱ Pausar simulación'
      : '▶ Iniciar simulación'
  );

  txt(
    'activityToggle',
    state.running
      ? 'Ⅱ Pausar sesión'
      : '▶ Iniciar sesión'
  );

  $('scenario').value = state.scenario;

  renderAlerts();
  renderHistory();
  drawCharts();
}

// MOSTRAR ALERTAS
function renderAlerts() {
  const box = $('alertList');
  box.innerHTML = '';

  if (!state.alerts.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Todavía no hay alertas.';
    box.append(p);
    return;
  }

  state.alerts.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'alert-item';

    const strong = document.createElement('strong');
    strong.textContent = '⚠ ' + entry.message;

    const small = document.createElement('small');
    small.textContent =
      'Tiempo de sesión: ' + entry.time;

    div.append(strong, small);
    box.append(div);
  });
}

// MOSTRAR HISTORIAL
function renderHistory() {
  const body = $('historyTable');
  body.innerHTML = '';

  if (!state.history.length) {
    body.innerHTML =
      '<tr><td colspan="6">Aún no hay datos.</td></tr>';
    return;
  }

  state.history.slice(0, 12).forEach(row => {
    const tr = document.createElement('tr');

    [
      row.time,
      row.mode,
      row.left + '%',
      (100 - row.left) + '%',
      row.stress,
      row.freshness
    ].forEach(value => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    });

    body.append(tr);
  });
}

// DIBUJAR GRÁFICOS EN CANVAS
function drawChart(id, model = false) {
  const canvas = $(id);
  const ctx = canvas.getContext('2d');

  const w = canvas.width;
  const h = canvas.height;
  const pad = 35;

  ctx.clearRect(0, 0, w, h);

  // Líneas horizontales
  ctx.strokeStyle = '#e8edf5';
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = 20 + i * (h - 45) / 4;

    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - 12, y);
    ctx.stroke();
  }

  const max = model
    ? Math.max(1, cfg.threshold * 1.4)
    : Math.max(
        0.9,
        cfg.threshold * 1.4,
        ...series.map(p => p.stress)
      );

  function line(key, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();

    series.forEach((p, i) => {
      const x =
        pad +
        i * (w - pad - 18) /
        Math.max(1, series.length - 1);

      const y =
        h - 25 -
        (p[key] / max) * (h - 45);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  }

  // Umbral de estrés
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = '#ffa87b';

  const y =
    h - 25 -
    cfg.threshold / max * (h - 45);

  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(w - 12, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Línea de estrés
  line('stress', '#1fc3ad');

  // Línea de frescura muscular
  if (model) {
    line('freshness', '#6874ee');
  }

  // Etiquetas
  ctx.font = '12px Arial';
  ctx.fillStyle = '#7e8ca1';

  ctx.fillText(
    'Umbral',
    w - 70,
    Math.max(14, y - 6)
  );

  ctx.fillText('Inicio', pad, h - 6);
  ctx.fillText('Tiempo →', w - 82, h - 6);
}

function drawCharts() {
  drawChart('chartHome');
  drawChart('chartModel', true);
}

// CARGAR CONFIGURACIÓN
function loadSettings() {
  const ids = {
    weight: 'weightInput',
    stride: 'strideInput',
    goal: 'goalInput',
    alpha: 'alphaInput',
    beta: 'betaInput',
    r: 'rInput',
    c: 'cInput',
    threshold: 'thresholdInput'
  };

  Object.entries(ids).forEach(([key, id]) => {
    $(id).value = cfg[key];
  });
}

// GUARDAR CONFIGURACIÓN
$('settingsForm').addEventListener('submit', e => {
  e.preventDefault();

  const ids = {
    weight: 'weightInput',
    stride: 'strideInput',
    goal: 'goalInput',
    alpha: 'alphaInput',
    beta: 'betaInput',
    r: 'rInput',
    c: 'cInput',
    threshold: 'thresholdInput'
  };

  Object.entries(ids).forEach(([key, id]) => {
    cfg[key] = Number($(id).value);
  });

  store();
  render();
  toast('Configuración guardada.');
});

// RESTAURAR PARÁMETROS
$('defaultsBtn').addEventListener('click', () => {
  cfg = { ...defaults };
  loadSettings();
  store();
  render();

  toast('Valores restaurados.');
});

// ELIMINAR ALERTAS
$('clearAlerts').addEventListener('click', () => {
  state.alerts = [];
  state.lastAlert = {};

  store();
  render();

  toast('Alertas eliminadas.');
});

// EXPORTAR DATOS A CSV PARA EXCEL
$('downloadBtn').addEventListener('click', () => {
  if (!state.history.length) {
    toast('No hay mediciones para exportar.');
    return;
  }

  const rows = [
    [
      'Tiempo',
      'Escenario',
      'Izquierdo',
      'Derecho',
      'Estres',
      'Frescura'
    ],
    ...state.history.slice().reverse().map(r => [
      r.time,
      r.mode,
      r.left,
      100 - r.left,
      r.stress,
      r.freshness
    ])
  ];

  const csv =
    '\ufeff' +
    rows.map(r => r.join(';')).join('\r\n');

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'BioStep_mediciones.csv';
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
});

// INICIALIZAR APLICACIÓN
loadSettings();
render();
