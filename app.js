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
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3b2lhZnV0aW9ta3dnb2V4cnZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MDAxOTMsImV4cCI6MjA4NDQ3NjE5M30.-PTz5nH_KQUHsIYapg-EtHjvOJoV9NODxruPs3yXtOQ';
let supabaseClient = null;

// ... (existing code)

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
    username: null,
    scannedDates: {} // { [id]: 'YYYY-MM-DD' } - Tracks last scan date per location
};

// DOM Elements
const elCurrentElevation = document.getElementById('current-elevation');
const elTotalSteps = document.getElementById('total-steps');
const elRemaining = document.getElementById('remaining-elevation');
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

// --- Utility Functions ---

/**
 * Generate consistent color from username using hash
 */
function getUserColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 65%, 55%)`;
}

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

    // 2. Once-per-day Check (Global - only 1 scan per day total)
    const todayStr = new Date().toLocaleDateString('ja-JP'); // e.g., '2026/1/27'
    if (state.lastScanDate === todayStr) {
        showNotification('本日はすでに記録済みです（翌日0時にリセット）', 'warning');
        return;
    }

    // Update state
    state.totalSteps += steps;
    state.lastReadId = id;
    state.lastReadTimestamp = now;

    // Record today's scan date (for 1-per-day restriction)
    state.lastScanDate = todayStr;

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

/**
 * Load all climbers from the database table
 */
async function loadAllClimbers() {
    if (!supabaseClient) return;

    try {
        const { data, error } = await supabaseClient
            .from('climbers')
            .select('*')
            .order('total_steps', { ascending: false });

        if (error) {
            console.error('Failed to load climbers:', error);
            return;
        }

        // Render all climbers on the mountain
        renderVisualizerFromTable(data || []);
    } catch (e) {
        console.error('Load climbers exception:', e);
    }
}

async function initSupabase() {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else if (typeof createClient !== 'undefined') {
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    if (!supabaseClient) {
        console.error('Supabase client not initialized');
        return;
    }

    // Subscribe to online presence and database changes
    const channel = supabaseClient.channel('climbers_room');

    channel
        // Presence only for online counter
        .on('presence', { event: 'sync' }, () => {
            const newState = channel.presenceState();
            const count = Object.keys(newState).length;
            elOnlineCount.textContent = count;
            elOnlineCounter.classList.remove('hidden');
        })
        // Listen to database changes for avatar updates
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'climbers' },
            (payload) => {
                console.log('New climber:', payload);
                loadAllClimbers();
            }
        )
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'climbers' },
            (payload) => {
                console.log('Climber updated:', payload);
                loadAllClimbers();
            }
        )
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                // Track presence for online counter
                await channel.track({
                    user: state.username,
                    elevation: calculateElevation(state.totalSteps),
                    last_updated: new Date().toISOString()
                });

                // Load all climbers from table on initial connection
                await loadAllClimbers();
            }
        });

    // Sync current user to database
    syncLocation();
}

async function syncLocation() {
    if (!supabaseClient || !state.username) return;

    try {
        const { error } = await supabaseClient
            .from('climbers')
            .upsert({
                username: state.username,
                total_steps: state.totalSteps,
                station: getCurrentStation(calculateElevation(state.totalSteps)),
                last_updated: new Date().toISOString()
            }, { onConflict: 'username' });

        if (error) console.error('Sync error:', error);

        // Update presence if connected
        const channel = supabaseClient.channel('climbers_room');
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

function renderStationMarkers() {
    const markersContainer = document.getElementById('station-markers');
    if (!markersContainer) return;

    markersContainer.innerHTML = '';

    STATIONS.forEach(station => {
        const pct = (station.elevation / GOAL_ELEVATION) * 100;
        const marker = document.createElement('div');
        marker.className = 'station-marker';
        marker.style.bottom = `${pct}%`;
        marker.textContent = station.name;
        markersContainer.appendChild(marker);
    });
}

/**
 * Render climbers from database table data
 * Optimized for large user counts: shows top N climbers + always self
 */
const MAX_AVATAR_DISPLAY = 50; // Max avatars to show (excluding self if not in top N)

function renderVisualizerFromTable(climbersData) {
    elClimbersVisualizer.innerHTML = '';

    // Optimization: Limit to top N users + ensure self is always included
    let displayData = climbersData.slice(0, MAX_AVATAR_DISPLAY);

    // Check if self is in the display list
    const selfInList = displayData.some(c => c.username === state.username);
    if (!selfInList && state.username) {
        // Find self in full data and add to display
        const selfData = climbersData.find(c => c.username === state.username);
        if (selfData) {
            displayData.push(selfData);
        }
    }

    displayData.forEach(climber => {
        const elevation = (climber.total_steps * STEP_HEIGHT);
        const pct = Math.min(100, Math.max(0, (elevation / GOAL_ELEVATION) * 100));
        const isSelf = climber.username === state.username;

        // Slope-following logic: drift and narrowing
        const drift = Math.sin(pct * 0.15) * 40;
        const narrowing = 1 - (pct / 100);
        const leftPosition = 50 + (drift * narrowing);

        const avatar = document.createElement('div');
        avatar.className = `climber-avatar tooltip ${isSelf ? 'self' : ''}`;
        avatar.style.bottom = `${pct}%`;
        avatar.style.left = `${leftPosition}%`;
        avatar.style.backgroundColor = getUserColor(climber.username);
        avatar.setAttribute('data-tip', `${climber.username} (${elevation.toFixed(1)}m)`);

        const initial = climber.username.charAt(0).toUpperCase();
        avatar.textContent = initial;

        const nameLabel = document.createElement('div');
        nameLabel.className = 'climber-name';
        nameLabel.textContent = climber.username;
        avatar.appendChild(nameLabel);

        elClimbersVisualizer.appendChild(avatar);
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

// renderSelfAvatar removed - now handled by renderVisualizerFromTable

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
    renderStationMarkers(); // Render mountain route markers

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

    // Admin Mode Check
    checkAdminMode();
}

// --- Ranking Functions ---

const elRankingBtn = document.getElementById('ranking-btn');
const elRankingModal = document.getElementById('ranking_modal');
const elRankingList = document.getElementById('ranking-list');

async function loadRanking() {
    if (!supabaseClient) {
        elRankingList.innerHTML = '<li class="text-gray-400 text-center text-xs py-2">接続エラー</li>';
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('climbers')
            .select('username, total_steps')
            .order('total_steps', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Ranking fetch error:', error);
            elRankingList.innerHTML = '<li class="text-red-400 text-center text-xs py-2">データ取得エラー</li>';
            return;
        }

        if (!data || data.length === 0) {
            elRankingList.innerHTML = '<li class="text-gray-400 text-center text-xs py-2">まだ登山者がいません</li>';
            return;
        }

        elRankingList.innerHTML = data.map((climber, index) => {
            const elevation = (climber.total_steps * STEP_HEIGHT).toFixed(1);
            const isSelf = climber.username === state.username;
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            return `
                <li class="flex justify-between items-center p-2 rounded ${isSelf ? 'bg-amber-100 border-2 border-amber-400 font-bold' : 'bg-white/40'}">
                    <span class="flex items-center gap-2">
                        <span class="w-8 text-center">${medal}</span>
                        <span>${climber.username}</span>
                    </span>
                    <span class="text-blue-600 number-font">${elevation}m</span>
                </li>
            `;
        }).join('');
    } catch (e) {
        console.error('Ranking exception:', e);
        elRankingList.innerHTML = '<li class="text-red-400 text-center text-xs py-2">エラーが発生しました</li>';
    }
}

if (elRankingBtn) {
    elRankingBtn.addEventListener('click', () => {
        elRankingModal.showModal();
        loadRanking();
    });
}

// --- Admin Functions ---

const elAdminModal = document.getElementById('admin_modal');
const elAdminUserList = document.getElementById('admin-user-list');
const elAdminTargetUser = document.getElementById('admin-target-user');
const elAdminAddSteps = document.getElementById('admin-add-steps');
const elAdminAddStepsBtn = document.getElementById('admin-add-steps-btn');
const elAdminResetAllBtn = document.getElementById('admin-reset-all-btn');

let isAdminMode = false;

function checkAdminMode() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'admin') {
        isAdminMode = true;
        // Show admin button in UI (e.g., add a floating button)
        const adminBtn = document.createElement('button');
        adminBtn.id = 'admin-open-btn';
        adminBtn.className = 'fixed bottom-4 right-4 btn btn-circle btn-warning shadow-lg z-50';
        adminBtn.textContent = '🔧';
        adminBtn.addEventListener('click', () => {
            elAdminModal.showModal();
            loadAdminUserList();
        });
        document.body.appendChild(adminBtn);
    }
}

async function loadAdminUserList() {
    if (!supabaseClient) {
        elAdminUserList.innerHTML = '<li class="text-gray-400 text-center text-xs py-2">接続エラー</li>';
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('climbers')
            .select('*')
            .order('total_steps', { ascending: false });

        if (error) {
            console.error('Admin user list error:', error);
            elAdminUserList.innerHTML = '<li class="text-red-400 text-center text-xs py-2">データ取得エラー</li>';
            return;
        }

        if (!data || data.length === 0) {
            elAdminUserList.innerHTML = '<li class="text-gray-400 text-center text-xs py-2">登録ユーザーなし</li>';
            return;
        }

        elAdminUserList.innerHTML = data.map(climber => {
            const elevation = (climber.total_steps * STEP_HEIGHT).toFixed(1);
            return `
                <li class="flex justify-between items-center p-1 bg-white/40 rounded text-xs">
                    <span>${climber.username} (${elevation}m, ${climber.total_steps}段)</span>
                    <button class="btn btn-xs btn-error" onclick="deleteClimber('${climber.username}')">削除</button>
                </li>
            `;
        }).join('');
    } catch (e) {
        console.error('Admin user list exception:', e);
        elAdminUserList.innerHTML = '<li class="text-red-400 text-center text-xs py-2">エラーが発生しました</li>';
    }
}

async function deleteClimber(username) {
    if (!confirm(`${username} を削除しますか？`)) return;

    if (!supabaseClient) {
        alert('接続エラー');
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('climbers')
            .delete()
            .eq('username', username);

        if (error) {
            console.error('Delete error:', error);
            alert('削除に失敗しました: ' + error.message);
            return;
        }

        showNotification(`${username} を削除しました`, 'success');
        loadAdminUserList();
        loadAllClimbers();
    } catch (e) {
        console.error('Delete exception:', e);
        alert('削除中にエラーが発生しました');
    }
}

async function addStepsToUser(username, steps) {
    if (!supabaseClient) {
        alert('接続エラー');
        return;
    }

    try {
        // First get current steps
        const { data: existing, error: fetchError } = await supabaseClient
            .from('climbers')
            .select('total_steps')
            .eq('username', username)
            .single();

        if (fetchError) {
            console.error('Fetch error:', fetchError);
            alert('ユーザーが見つかりません: ' + username);
            return;
        }

        const newSteps = (existing?.total_steps || 0) + steps;

        const { error } = await supabaseClient
            .from('climbers')
            .update({
                total_steps: newSteps,
                station: getCurrentStation(newSteps * STEP_HEIGHT),
                last_updated: new Date().toISOString()
            })
            .eq('username', username);

        if (error) {
            console.error('Update error:', error);
            alert('更新に失敗しました: ' + error.message);
            return;
        }

        showNotification(`${username} に ${steps}段 を付与しました (計: ${newSteps}段)`, 'success');
        loadAdminUserList();
        loadAllClimbers();
    } catch (e) {
        console.error('Add steps exception:', e);
        alert('段数付与中にエラーが発生しました');
    }
}

async function resetAllClimbers() {
    if (!confirm('本当に全ユーザーデータを削除しますか？この操作は元に戻せません！')) return;
    if (!confirm('再度確認：すべてのユーザーの登山記録がリセットされます。続行しますか？')) return;

    if (!supabaseClient) {
        alert('接続エラー');
        return;
    }

    try {
        // Delete all rows (Supabase requires a filter, so we use 'total_steps >= 0')
        const { error } = await supabaseClient
            .from('climbers')
            .delete()
            .gte('total_steps', 0);

        if (error) {
            console.error('Reset all error:', error);
            alert('リセットに失敗しました: ' + error.message);
            return;
        }

        showNotification('全ユーザーデータをリセットしました', 'success');
        loadAdminUserList();
        loadAllClimbers();
    } catch (e) {
        console.error('Reset all exception:', e);
        alert('リセット中にエラーが発生しました');
    }
}

// Admin Event Listeners
if (elAdminAddStepsBtn) {
    elAdminAddStepsBtn.addEventListener('click', () => {
        const username = elAdminTargetUser.value.trim();
        const steps = parseInt(elAdminAddSteps.value, 10);
        if (!username) {
            alert('ユーザー名を入力してください');
            return;
        }
        if (isNaN(steps) || steps <= 0) {
            alert('有効な段数を入力してください');
            return;
        }
        addStepsToUser(username, steps);
    });
}

if (elAdminResetAllBtn) {
    elAdminResetAllBtn.addEventListener('click', resetAllClimbers);
}

// Start
init();
