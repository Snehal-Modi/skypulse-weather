/**
 * SkyPulse — script.js
 * Real-Time Weather Monitoring System
 *
 * Features:
 * - OpenWeatherMap API integration (current + 5-day forecast)
 * - Temperature unit conversion (°C / °F / K)
 * - Dark / Light theme toggle
 * - Geolocation support
 * - Recent searches (localStorage)
 * - Dynamic weather backgrounds
 * - Chart.js temperature & humidity charts
 * - Error handling + loading spinner
 */

'use strict';

/* ══════════════════════════════════════
   ▌ CONFIGURATION
   ══════════════════════════════════════ */

// 🔑 Replace with your actual OpenWeatherMap API key
// Get a free key at: https://openweathermap.org/api
const API_KEY = 'd7b1d6d0eec042dba3a54658a7e1bd62';

const API_BASE  = 'https://api.openweathermap.org/data/2.5';
const ICON_BASE = 'https://openweathermap.org/img/wn';
const MAX_RECENT = 6;

/* ══════════════════════════════════════
   ▌ STATE
   ══════════════════════════════════════ */

let state = {
  unit: 'metric',          // 'metric' | 'imperial' | 'kelvin'
  theme: 'dark',           // 'dark' | 'light'
  currentData: null,       // raw current weather object
  forecastData: null,      // raw forecast object
  activeChart: 'avg',      // 'avg' | 'max' | 'min'
  charts: {},              // Chart.js instances
};

/* ══════════════════════════════════════
   ▌ DOM REFERENCES
   ══════════════════════════════════════ */

const $ = id => document.getElementById(id);

const dom = {
  bgLayer:        $('bgLayer'),
  searchInput:    $('searchInput'),
  searchBtn:      $('searchBtn'),
  geoBtn:         $('geoBtn'),
  recentSearches: $('recentSearches'),
  dashboard:      $('dashboard'),
  loading:        $('loadingSpinner'),
  errorBanner:    $('errorBanner'),
  errorMsg:       $('errorMsg'),
  themeToggle:    $('themeToggle'),
  themeIcon:      $('themeIcon'),
  clockTime:      $('clockTime'),
  clockDate:      $('clockDate'),
  // Current weather
  cityName:    $('cityName'),
  cityCountry: $('cityCountry'),
  weatherDesc: $('weatherDesc'),
  weatherIcon: $('weatherIcon'),
  currentTemp: $('currentTemp'),
  tempUnit:    $('tempUnit'),
  feelsLike:   $('feelsLike'),
  humidity:    $('humidity'),
  windSpeed:   $('windSpeed'),
  pressure:    $('pressure'),
  visibility:  $('visibility'),
  sunrise:     $('sunrise'),
  sunset:      $('sunset'),
  tempMin:     $('tempMin'),
  tempMax:     $('tempMax'),
  clouds:      $('clouds'),
  alertBody:   $('alertBody'),
  // Forecast
  forecastRow: $('forecastRow'),
};

/* ══════════════════════════════════════
   ▌ INITIALISATION
   ══════════════════════════════════════ */

function init() {
  loadTheme();
  startClock();
  bindEvents();
  loadRecentSearchesUI();

  // Auto-load last searched city
  const recent = getRecentSearches();
  if (recent.length > 0) {
    fetchWeather(recent[0]);
  }
}

/* ══════════════════════════════════════
   ▌ CLOCK
   ══════════════════════════════════════ */

function startClock() {
  const tick = () => {
    const now = new Date();
    dom.clockTime.textContent = now.toLocaleTimeString('en-US', { hour12: false });
    dom.clockDate.textContent = now.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  };
  tick();
  setInterval(tick, 1000);
}

/* ══════════════════════════════════════
   ▌ EVENT BINDING
   ══════════════════════════════════════ */

function bindEvents() {
  // Search
  dom.searchBtn.addEventListener('click', handleSearch);
  dom.searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSearch();
  });

  // Show recent on focus
  dom.searchInput.addEventListener('focus', () => {
    const recent = getRecentSearches();
    if (recent.length > 0) loadRecentSearchesUI();
  });

  // Hide recent on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrapper')) {
      dom.recentSearches.style.display = 'none';
    }
  });

  // Geolocation
  dom.geoBtn.addEventListener('click', handleGeoLocation);

  // Unit switcher
  document.querySelectorAll('.unit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.unit = btn.dataset.unit;
      if (state.currentData) updateDisplayedTemperatures();
    });
  });

  // Theme toggle
  dom.themeToggle.addEventListener('click', toggleTheme);

  // Chart tabs
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeChart = tab.dataset.chart;
      if (state.forecastData) updateTempChart();
    });
  });
}

/* ══════════════════════════════════════
   ▌ SEARCH
   ══════════════════════════════════════ */

function handleSearch() {
  const city = dom.searchInput.value.trim();
  if (!city) return;
  dom.recentSearches.style.display = 'none';
  fetchWeather(city);
}

/* ══════════════════════════════════════
   ▌ GEOLOCATION
   ══════════════════════════════════════ */

function handleGeoLocation() {
  if (!navigator.geolocation) {
    showError('Geolocation is not supported by your browser.');
    return;
  }
  showLoading(true);
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      try {
        await fetchWeatherByCoords(lat, lon);
      } catch (err) {
        showError(err.message);
      } finally {
        showLoading(false);
      }
    },
    err => {
      showLoading(false);
      showError('Unable to retrieve location. Please allow location access.');
    }
  );
}

/* ══════════════════════════════════════
   ▌ API CALLS
   ══════════════════════════════════════ */

/**
 * Fetch weather data by city name.
 * @param {string} city
 */
async function fetchWeather(city) {
  showLoading(true);
  hideError();

  try {
    const [current, forecast] = await Promise.all([
      fetchCurrentWeather(city),
      fetchForecast(city),
    ]);

    state.currentData  = current;
    state.forecastData = forecast;

    renderCurrentWeather(current);
    renderForecast(forecast);
    renderCharts(forecast);
    saveRecentSearch(city);
    loadRecentSearchesUI();
    dom.dashboard.style.display = 'block';
    dom.searchInput.value = '';
  } catch (err) {
    showError(err.message || 'Failed to fetch weather data. Please try again.');
    dom.dashboard.style.display = 'none';
  } finally {
    showLoading(false);
  }
}

/**
 * Fetch weather by coordinates (geolocation).
 */
async function fetchWeatherByCoords(lat, lon) {
  const [current, forecast] = await Promise.all([
    apiFetch(`${API_BASE}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`),
    apiFetch(`${API_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`),
  ]);

  state.currentData  = current;
  state.forecastData = forecast;

  renderCurrentWeather(current);
  renderForecast(forecast);
  renderCharts(forecast);
  saveRecentSearch(current.name);
  loadRecentSearchesUI();
  dom.dashboard.style.display = 'block';
}

async function fetchCurrentWeather(city) {
  return apiFetch(
    `${API_BASE}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`
  );
}

async function fetchForecast(city) {
  return apiFetch(
    `${API_BASE}/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`
  );
}

/**
 * Generic API fetcher with error handling.
 */
async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) throw new Error('City not found. Please check the spelling and try again.');
    if (res.status === 401) throw new Error('Invalid API key. Please check your OpenWeatherMap API key.');
    if (res.status === 429) throw new Error('Too many requests. Please wait a moment and try again.');
    throw new Error(`API error (${res.status}). Please try again.`);
  }
  return res.json();
}

/* ══════════════════════════════════════
   ▌ RENDER: CURRENT WEATHER
   ══════════════════════════════════════ */

function renderCurrentWeather(data) {
  const { name, sys, weather, main, wind, visibility, clouds } = data;

  // City & condition
  dom.cityName.textContent    = name;
  dom.cityCountry.textContent = `${sys.country} · ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
  dom.weatherDesc.textContent = weather[0].description;
  dom.alertBody.textContent   = `${weather[0].description} · Feels ${main.feels_like.toFixed(1) < main.temp ? 'colder' : 'warmer'} than actual temperature.`;

  // Icon
  dom.weatherIcon.src = `${ICON_BASE}/${weather[0].icon}@2x.png`;
  dom.weatherIcon.alt = weather[0].description;

  // Temperatures (store in Celsius for conversion)
  state._tempC       = main.temp;
  state._feelsLikeC  = main.feels_like;
  state._tempMinC    = main.temp_min;
  state._tempMaxC    = main.temp_max;

  updateDisplayedTemperatures();

  // Other stats
  dom.humidity.textContent  = `${main.humidity}%`;
  dom.windSpeed.textContent = `${wind.speed} m/s`;
  dom.pressure.textContent  = `${main.pressure} hPa`;
  dom.visibility.textContent = visibility ? `${(visibility / 1000).toFixed(1)} km` : 'N/A';
  dom.clouds.textContent    = `${clouds.all}%`;

  // Sunrise / Sunset
  dom.sunrise.textContent = formatTime(sys.sunrise);
  dom.sunset.textContent  = formatTime(sys.sunset);

  // Dynamic background
  setWeatherBackground(weather[0].main);
}

/* ══════════════════════════════════════
   ▌ TEMPERATURE CONVERSION
   ══════════════════════════════════════ */

/**
 * Convert Celsius to the current unit.
 * @param {number} celsius
 * @returns {number}
 */
function convertTemp(celsius) {
  switch (state.unit) {
    case 'imperial': return (celsius * 9/5) + 32;
    case 'kelvin':   return celsius + 273.15;
    default:         return celsius;           // metric (°C)
  }
}

function unitLabel() {
  switch (state.unit) {
    case 'imperial': return '°F';
    case 'kelvin':   return 'K';
    default:         return '°C';
  }
}

function formatTemp(celsius, decimals = 1) {
  const val = convertTemp(celsius);
  return state.unit === 'kelvin'
    ? val.toFixed(decimals)
    : Math.round(val).toString();
}

function updateDisplayedTemperatures() {
  const label = unitLabel();
  dom.currentTemp.textContent = formatTemp(state._tempC, 0);
  dom.tempUnit.textContent    = label;
  dom.feelsLike.textContent   = `${formatTemp(state._feelsLikeC)}${label}`;
  dom.tempMin.textContent     = `${formatTemp(state._tempMinC)}${label}`;
  dom.tempMax.textContent     = `${formatTemp(state._tempMaxC)}${label}`;

  // Re-render forecast temp displays
  if (state.forecastData) renderForecastTemps();

  // Re-render charts
  if (state.forecastData) updateTempChart();
}

/* ══════════════════════════════════════
   ▌ RENDER: 5-DAY FORECAST
   ══════════════════════════════════════ */

function renderForecast(data) {
  // OWM free tier returns 3-hourly for 5 days; pick noon entry per day
  const daily = getDailyForecasts(data.list);
  dom.forecastRow.innerHTML = '';

  daily.forEach((day, i) => {
    const date    = new Date(day.dt * 1000);
    const dayName = i === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const icon    = `${ICON_BASE}/${day.weather[0].icon}@2x.png`;

    const card = document.createElement('div');
    card.className = 'col-6 col-md-4 col-lg';
    card.innerHTML = `
      <div class="glass-card forecast-card" data-index="${i}">
        <div class="forecast-day">${dayName}</div>
        <img class="forecast-icon" src="${icon}" alt="${day.weather[0].description}"/>
        <div class="forecast-desc">${day.weather[0].description}</div>
        <div class="forecast-temps">
          <span class="temp-max" data-max="${day._maxC}">${formatTemp(day._maxC)}${unitLabel()}</span>
          <span class="temp-min" data-min="${day._minC}">${formatTemp(day._minC)}${unitLabel()}</span>
        </div>
      </div>`;
    dom.forecastRow.appendChild(card);
  });
}

/** Update only forecast temperatures (no full re-render) */
function renderForecastTemps() {
  const label = unitLabel();
  document.querySelectorAll('.temp-max').forEach(el => {
    const c = parseFloat(el.dataset.max);
    el.textContent = `${formatTemp(c)}${label}`;
  });
  document.querySelectorAll('.temp-min').forEach(el => {
    const c = parseFloat(el.dataset.min);
    el.textContent = `${formatTemp(c)}${label}`;
  });
}

/**
 * Extract one representative entry per day from 3-hourly list.
 * Prefer the 12:00 UTC slot; fall back to last entry of the day.
 */
function getDailyForecasts(list) {
  const days = {};
  list.forEach(item => {
    const date = item.dt_txt.split(' ')[0];
    if (!days[date]) days[date] = [];
    days[date].push(item);
  });

  return Object.values(days).slice(0, 5).map(entries => {
    const noon = entries.find(e => e.dt_txt.includes('12:00:00')) || entries[Math.floor(entries.length / 2)];
    // Compute day min/max from all entries
    const temps = entries.map(e => e.main.temp);
    noon._minC = Math.min(...temps);
    noon._maxC = Math.max(...temps);
    return noon;
  });
}

/* ══════════════════════════════════════
   ▌ CHARTS
   ══════════════════════════════════════ */

const CHART_COLORS = {
  avg: { line: '#4fc3f7', fill: 'rgba(79,195,247,0.15)' },
  max: { line: '#ff7043', fill: 'rgba(255,112,67,0.15)' },
  min: { line: '#42a5f5', fill: 'rgba(66,165,245,0.15)' },
};

function renderCharts(forecast) {
  const daily = getDailyForecasts(forecast.list);

  // Destroy existing charts
  Object.values(state.charts).forEach(c => c?.destroy());

  // Shared data
  const labels = daily.map((d, i) => {
    if (i === 0) return 'Today';
    return new Date(d.dt * 1000).toLocaleDateString('en-US', { weekday: 'short' });
  });

  state._dailyData = daily;
  state._chartLabels = labels;

  // Temperature Chart
  buildTempChart(daily, labels);

  // Humidity Chart
  buildHumidityChart(daily, labels);
}

function buildTempChart(daily, labels) {
  const ctx = document.getElementById('tempChart')?.getContext('2d');
  if (!ctx) return;

  const chartKey = state.activeChart;
  const getData = key => {
    switch (key) {
      case 'max': return daily.map(d => parseFloat(formatTemp(d._maxC)));
      case 'min': return daily.map(d => parseFloat(formatTemp(d._minC)));
      default:    return daily.map(d => parseFloat(formatTemp((d._maxC + d._minC) / 2)));
    }
  };

  const color = CHART_COLORS[chartKey];
  const titleMap = { avg: 'Average Temperature', max: 'Maximum Temperature', min: 'Minimum Temperature' };

  if (state.charts.temp) state.charts.temp.destroy();

  state.charts.temp = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: titleMap[chartKey],
        data: getData(chartKey),
        borderColor: color.line,
        backgroundColor: color.fill,
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: color.line,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }],
    },
    options: chartOptions(`Temperature (${unitLabel()})`),
  });
}

function updateTempChart() {
  if (!state._dailyData || !state._chartLabels) return;
  buildTempChart(state._dailyData, state._chartLabels);
}

function buildHumidityChart(daily, labels) {
  const ctx = document.getElementById('humidityChart')?.getContext('2d');
  if (!ctx) return;

  if (state.charts.humidity) state.charts.humidity.destroy();

  state.charts.humidity = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Humidity (%)',
        data: daily.map(d => d.main.humidity),
        backgroundColor: 'rgba(79,195,247,0.55)',
        borderColor: '#4fc3f7',
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: chartOptions('Humidity (%)'),
  });
}

function chartOptions(yLabel) {
  const gridColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.06)';

  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        labels: {
          color: 'rgba(255,255,255,0.6)',
          font: { family: 'Space Grotesk', size: 11 },
          boxWidth: 12,
          padding: 12,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(8,12,20,0.9)',
        titleColor: '#f0f4ff',
        bodyColor: '#8a9bb8',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        cornerRadius: 10,
        padding: 10,
      },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: 'rgba(255,255,255,0.4)', font: { family: 'DM Mono', size: 11 } },
      },
      y: {
        grid: { color: gridColor },
        ticks: { color: 'rgba(255,255,255,0.4)', font: { family: 'DM Mono', size: 11 } },
        title: { display: true, text: yLabel, color: 'rgba(255,255,255,0.35)', font: { size: 10 } },
      },
    },
  };
}

/* ══════════════════════════════════════
   ▌ BACKGROUND
   ══════════════════════════════════════ */

const BG_MAP = {
  Clear:        'weather-clear',
  Clouds:       'weather-clouds',
  Rain:         'weather-rain',
  Drizzle:      'weather-rain',
  Thunderstorm: 'weather-thunderstorm',
  Snow:         'weather-snow',
  Mist:         'weather-mist',
  Smoke:        'weather-mist',
  Haze:         'weather-mist',
  Dust:         'weather-mist',
  Fog:          'weather-mist',
  Sand:         'weather-mist',
  Ash:          'weather-mist',
  Squall:       'weather-rain',
  Tornado:      'weather-thunderstorm',
};

function setWeatherBackground(condition) {
  dom.bgLayer.className = 'bg-layer';
  const cls = BG_MAP[condition];
  if (cls) dom.bgLayer.classList.add(cls);
}

/* ══════════════════════════════════════
   ▌ THEME
   ══════════════════════════════════════ */

function loadTheme() {
  const saved = localStorage.getItem('skypulse_theme') || 'dark';
  applyTheme(saved);
}

function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  dom.themeIcon.className = theme === 'dark' ? 'bi bi-moon-stars-fill' : 'bi bi-sun-fill';
  localStorage.setItem('skypulse_theme', theme);
}

/* ══════════════════════════════════════
   ▌ RECENT SEARCHES (localStorage)
   ══════════════════════════════════════ */

function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem('skypulse_recent')) || [];
  } catch { return []; }
}

function saveRecentSearch(city) {
  const formatted = city.trim();
  let recent = getRecentSearches().filter(c => c.toLowerCase() !== formatted.toLowerCase());
  recent.unshift(formatted);
  if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
  localStorage.setItem('skypulse_recent', JSON.stringify(recent));
}

function loadRecentSearchesUI() {
  const recent = getRecentSearches();
  const container = dom.recentSearches;

  if (recent.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.innerHTML = recent.map(city => `
    <div class="recent-item" data-city="${city}">
      <i class="bi bi-clock-history"></i>
      <span>${city}</span>
      <i class="bi bi-arrow-up-left ms-auto opacity-50"></i>
    </div>`).join('');

  container.style.display = 'block';

  container.querySelectorAll('.recent-item').forEach(item => {
    item.addEventListener('click', () => {
      fetchWeather(item.dataset.city);
      container.style.display = 'none';
    });
  });
}

/* ══════════════════════════════════════
   ▌ UTILITIES
   ══════════════════════════════════════ */

function formatTime(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function showLoading(show) {
  dom.loading.style.display = show ? 'flex' : 'none';
}

function showError(msg) {
  dom.errorMsg.textContent = msg;
  dom.errorBanner.style.display = 'flex';
  // Auto-hide after 6s
  setTimeout(() => { dom.errorBanner.style.display = 'none'; }, 6000);
}

function hideError() {
  dom.errorBanner.style.display = 'none';
}

/* ══════════════════════════════════════
   ▌ BOOTSTRAP
   ══════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', init);