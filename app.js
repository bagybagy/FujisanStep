/**
 * FujisanStep App Logic
 */

// Constants
const GOAL_ELEVATION = 3776; // m
const STEP_HEIGHT = 0.2; // m
const GOAL_STEPS = GOAL_ELEVATION / STEP_HEIGHT; // 18880 steps
const COOLDOWN_MS = 3000; // 3 seconds (Configurable)
const STORAGE_KEY = 'fujisan_data';
// Supabase Config
const SUPABASE_URL = 'https://awoiafutiomkwgoexrvd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PQZ2J-tDcP0DJxqg7bLTSw_zJ1biFvR';
let supabase = null;

// Stations (m)
const STATIONS = [
    { name: '山頂', elevation: 3776 },
    { name: '8合目', elevation: 3100 },
    { name: '5合目', elevation: 2300 },
    { name: '1合目', elevation: 400 },
    { name: 'スタート', elevation: 0 }
];

// Background Gradients (CSS)
const BG_GRADIENTS = {
    '山頂': 'linear-gradient(135deg, #FFD700 0%, #FDB931 100%)', // Gold
    '8合目': 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)', // Sunset
    '5合目': 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', // Forest
    '1合目': 'linear-gradient(135deg, #2980b9 0%, #6dd5fa 100%)', // Blue/Sky
    'スタート': 'linear-gradient(135deg, #a8c0ff 0%, #3f2b96 100%)' // Default
};

// Audio Context
let audioCtx = null;

// State
let state = {
    totalSteps: 0,
    lastReadId: null,
    lastReadTimestamp: 0,
    history: [],
    username: null
};

// DOM Elements
const elCurrentElevation = document.getElementById('current-elevation');
const elTotalSteps = document.getElementById('total-steps');
const elRemaining = document.getElementById('remaining-elevation');
const elProgressBar = document.getElementById('progress-bar');
const elCurrentStation = document.getElementById('current-station');
const elHistoryList = document.getElementById('history-list');
const elResetBtn = document.getElementById('reset-btn');
const elNotificationArea = document.getElementById('notification-area');
// Supabase UI
const elOnlineCounter = document.getElementById('online-counter');
const elOnlineCount = document.getElementById('online-count');
const elClimbersVisualizer = document.getElementById('climbers-visualizer');
const elModal = document.getElementById('username_modal');
const elUsernameInput = document.getElementById('username-input');
const elUsernameSubmit = document.getElementById('username-submit');
const elUsernameSkip = document.getElementById('username-skip');

// --- Core Logic ---

function loadState() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            state = JSON.parse(stored);
        } catch (e) {
            console.error('Failed to parse state', e);
        }
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function calculateElevation(steps) {
    return (steps * STEP_HEIGHT).toFixed(1);
}

function getCurrentStation(elevation) {
    for (const station of STATIONS) {
        if (elevation >= station.elevation) {
            return station.name;
        }
    }
    return 'スタート';
}

function showNotification(msg, type = 'info') {
    const div = document.createElement('div');
    div.className = `alert alert-${type} text-xs py-1 px-2 shadow-lg flex justify-center`;
    div.innerHTML = `<span>${msg}</span>`;
    elNotificationArea.innerHTML = '';
    elNotificationArea.appendChild(div);

    setTimeout(() => {
        div.remove();
    }, 4000);
}

function playSuccessSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        oscillator.frequency.exponentialRampToValueAtTime(1046.5, audioCtx.currentTime + 0.1); // C6

        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
        console.warn('Audio play failed', e);
    }
}

function triggerEffects(isNewStation, stationName) {
    // 1. Vibration
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

    // 2. Sound
    playSuccessSound();

    // 3. Confetti (if new station reached)
    if (isNewStation && typeof confetti !== 'undefined') {
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min, max) => Math.random() * (max - min) + min;

        const interval = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
        }, 250);

        showNotification(`${stationName}に到達しました！おめでとうございます！`, 'success');
    }
}

function addSteps(id, steps) {
    const now = Date.now();

    // 1. Cooldown Check
    if (now - state.lastReadTimestamp < COOLDOWN_MS) {
        showNotification(`クールタイム中です。あと${Math.ceil((COOLDOWN_MS - (now - state.lastReadTimestamp)) / 1000)}秒お待ちください`, 'warning');
        return;
    }

    // 2. Duplicate ID Check (Only updates timestamp if same ID? Or ignore? Spec says "ignore logic")
    // Implementation Plan: "Ignore if same ID as last time"
    // However, if the user moved (A -> B -> A), it should count.
    // So logic is: if (id === lastReadId) ignore.
    if (id === state.lastReadId) {
        showNotification('同じ場所での連続読み取りはできません', 'error');
        return;
    }

    // Update state
    state.totalSteps += steps;
    state.lastReadId = id;
    state.lastReadTimestamp = now;

    // Add history
    state.history.unshift({
        timestamp: now,
        id: id,
        gainedSteps: steps
    });
    if (state.history.length > 50) state.history.pop(); // Limit history

    // Check for station change
    const oldElevation = calculateElevation(state.totalSteps - steps);
    const newElevation = calculateElevation(state.totalSteps);
    const oldStation = getCurrentStation(oldElevation);
    const newStation = getCurrentStation(newElevation);
    const isNewStation = (newStation !== oldStation) && (newElevation > oldElevation);

    saveState();
    renderUI();
    showNotification(`${steps}段上りました！ ナイスクライム！`, 'success');

    // Trigger Effects
    triggerEffects(isNewStation, newStation);

    // Sync to backend
    syncLocation();
}

// --- Backend / Realtime Logic ---

async function initSupabase() {
    if (typeof supabase === 'undefined' && window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else if (typeof createClient !== 'undefined') {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    if (!supabase) {
        console.error('Supabase client not initialized');
        return;
    }

    // Subscribe to online presence / updates
    const channel = supabase.channel('climbers_room');

    channel
        .on('presence', { event: 'sync' }, () => {
            const newState = channel.presenceState();
            const count = Object.keys(newState).length;
            elOnlineCount.textContent = count;
            elOnlineCounter.classList.remove('hidden');
            renderVisualizer(newState);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({
                    user: state.username,
                    elevation: calculateElevation(state.totalSteps),
                    last_updated: new Date().toISOString()
                });
            }
        });

    // Also upsert to persistent table if needed, but Presence is good for "Online Now"
    // Spec says: "Realtime location sync". Presence satisfies "Online".
    // For persistent data (total steps leaderboard), we should use a Table.
    // Let's implement Table upsert too.
    syncLocation();
}

async function syncLocation() {
    if (!supabase || !state.username) return;

    try {
        const { error } = await supabase
            .from('climbers')
            .upsert({
                username: state.username,
                total_steps: state.totalSteps,
                station: getCurrentStation(calculateElevation(state.totalSteps)),
                last_updated: new Date().toISOString()
            }, { onConflict: 'username' });

        if (error) console.error('Sync error:', error);

        // Update presence if connected
        const channel = supabase.channel('climbers_room');
        channel.track({
            user: state.username,
            elevation: calculateElevation(state.totalSteps),
            last_updated: new Date().toISOString()
        });

    } catch (e) {
        console.error('Sync exception:', e);
    }
}

function checkUserAuth() {
    if (!state.username) {
        elModal.showModal();
    } else {
        initSupabase();
    }
}

function renderVisualizer(presenceState) {
    elClimbersVisualizer.innerHTML = '';

    Object.values(presenceState).forEach(users => {
        users.forEach(user => {
            // Skip invalid data or self (optional, maybe render self differently?)
            if (!user.user || user.elevation === undefined) return;
            if (user.user === state.username) return;

            const pct = Math.min(100, Math.max(0, (user.elevation / GOAL_ELEVATION) * 100));

            const dot = document.createElement('div');
            // Style: Yellow dot with tooltip
            dot.className = 'absolute top-0 w-2 h-3 bg-yellow-400 rounded-sm opacity-90 transform -translate-x-1/2 shadow-sm border border-white/50 cursor-help transition-all duration-300';
            dot.style.left = `${pct}%`;
            dot.title = `${user.user} (${user.elevation}m)`;

            elClimbersVisualizer.appendChild(dot);
        });
    });
}

// --- UI Logic ---

function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function renderUI() {
    const elevation = (state.totalSteps * STEP_HEIGHT);

    // Text updates
    elCurrentElevation.innerHTML = `${elevation.toFixed(1)}<span class="text-sm text-gray-400 font-normal ml-1">m</span>`;
    elTotalSteps.innerHTML = `${state.totalSteps.toLocaleString()}<span class="text-sm text-gray-400 font-normal ml-1">段</span>`;

    const remaining = Math.max(0, GOAL_ELEVATION - elevation);
    elRemaining.textContent = remaining.toFixed(1);

    // Progress
    const progress = Math.min(100, (elevation / GOAL_ELEVATION) * 100);
    elProgressBar.value = progress;

    const stationName = getCurrentStation(elevation);
    elCurrentStation.textContent = stationName;

    // Dynamic Background
    if (BG_GRADIENTS[stationName]) {
        document.body.style.background = BG_GRADIENTS[stationName];
    }

    // History
    if (state.history.length === 0) {
        elHistoryList.innerHTML = '<li class="text-gray-400 text-center text-xs py-2">まだ記録はありません</li>';
    } else {
        elHistoryList.innerHTML = state.history.slice(0, 10).map(h => `
            <li class="flex justify-between items-center bg-white/40 p-2 rounded">
                <span class="text-xs text-gray-500">${formatDate(h.timestamp)}</span>
                <span class="font-bold text-blue-600">+${h.gainedSteps}段</span>
            </li>
        `).join('');
    }
}

// --- Initialization ---

function init() {
    loadState();

    // URL Params Check
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const stepsStr = params.get('steps');

    if (id && stepsStr) {
        const steps = parseInt(stepsStr, 10);
        if (!isNaN(steps) && steps > 0) {
            addSteps(id, steps);

            // Rewrite URL handling logic to clean params so refresh doesn't trigger add again?
            // Actually spec didn't strictly say remove params, but standard practice prevents double submission on refresh
            // However, browser refresh often resubmits.
            // Our cooldown and ID check logic handles the protection.
            // So we leave it for now to verify logic.

            // Clean URL for better UX? 
            // window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    renderUI();

    // Event Listeners
    elResetBtn.addEventListener('click', () => {
        if (confirm('本当にデータをリセットしますか？')) {
            localStorage.removeItem(STORAGE_KEY);
            state = {
                totalSteps: 0,
                lastReadId: null,
                lastReadTimestamp: 0,
                history: []
            };
            window.location.search = ''; // Reload clean
        }
    });
    // Modal Events
    elUsernameSubmit.addEventListener('click', () => {
        const name = elUsernameInput.value.trim();
        if (name) {
            state.username = name;
            saveState();
            elModal.close();
            initSupabase();
            showNotification(`ようこそ、${name}さん！`, 'success');
        } else {
            alert('ニックネームを入力してください');
        }
    });

    elUsernameSkip.addEventListener('click', () => {
        elModal.close();
        showNotification('登録をスキップしました（ランキング等には参加できません）', 'info');
    });

    // Auth Check
    setTimeout(checkUserAuth, 500);
}

// Start
init();
