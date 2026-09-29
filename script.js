// Bottle Shooter uses a canvas for the scenery, targets, and hit effects.
const canvas = document.querySelector('#rangeCanvas');
const context = canvas.getContext('2d');
const crosshair = document.querySelector('#crosshair');

const ui = {
    score: document.querySelector('#scoreValue'),
    combo: document.querySelector('#comboValue'),
    time: document.querySelector('#timeValue'),
    timeBar: document.querySelector('#timeBar'),
    ammo: document.querySelector('#ammoValue'),
    ammoPips: document.querySelector('#ammoPips'),
    bestSide: document.querySelector('#bestScoreSide'),
    menu: document.querySelector('#menuOverlay'),
    pause: document.querySelector('#pauseOverlay'),
    gameOver: document.querySelector('#gameOverOverlay'),
    dialog: document.querySelector('#dialogOverlay'),
    fire: document.querySelector('#fireButton'),
    reload: document.querySelector('#reloadButton'),
    feedback: document.querySelector('#shotFeedback')
};

const difficultySettings = {
    easy: { targetScale: 1.22, speed: 0, targetCount: 5, spawnEvery: 1.1, label: 'Chai lớn, đứng yên' },
    normal: { targetScale: 1, speed: 0.06, targetCount: 6, spawnEvery: 0.9, label: 'Mục tiêu di chuyển' },
    hard: { targetScale: 0.78, speed: 0.12, targetCount: 7, spawnEvery: 0.7, label: 'Mục tiêu nhỏ, nhanh' }
};

const targetTypes = [
    { name: 'CHAI THỦY TINH', points: 100, color: '#8db4a0', shape: 'bottle', width: 0.9, height: 1.05 },
    { name: 'CHAI NƯỚC', points: 100, color: '#86b8c1', shape: 'bottle', width: 0.82, height: 1.12 },
    { name: 'LỌ NHỎ', points: 150, color: '#b5aa80', shape: 'small', width: 0.66, height: 0.8 },
    { name: 'CHAI LỚN', points: 100, color: '#b8a274', shape: 'large', width: 1.12, height: 1.12 },
    { name: 'LON', points: 100, color: '#c97b58', shape: 'can', width: 0.82, height: 0.9 },
    { name: 'BIA TRÒN', points: 100, color: '#eee5cb', shape: 'target', width: 0.86, height: 0.86 }
];

const state = {
    screen: 'menu', difficulty: 'easy', score: 0, combo: 1, bestCombo: 1,
    shots: 0, hits: 0, ammo: 10, maxAmmo: 10, elapsedTime: 0,
    targets: [], particles: [], aim: { x: 0.5, y: 0.55 },
    lastFrame: 0, spawnTimer: 0, reloadTimer: 0, reloading: false,
    soundEnabled: true, quality: 'high', audio: null, width: 0, height: 0, pixelRatio: 1,
    flashTimer: 0, lastPointer: null,
    scenerySeed: 1
};

let bestRecord = loadRecord();
ui.bestSide.textContent = formatScore(bestRecord.score);

function formatScore(score) {
    return String(score).padStart(4, '0');
}

function loadRecord() {
    try {
        const record = JSON.parse(localStorage.getItem('bottleShooterRecord'));
        return { score: record?.score || 0, accuracy: record?.accuracy || 0, combo: record?.combo || 1 };
    } catch {
        return { score: 0, accuracy: 0, combo: 1 };
    }
}

function saveRecord() {
    if (state.score > bestRecord.score || state.hits > 0) {
        bestRecord = {
            score: Math.max(state.score, bestRecord.score),
            accuracy: Math.max(state.shots ? Math.round(state.hits / state.shots * 100) : 0, bestRecord.accuracy),
            combo: Math.max(state.bestCombo, bestRecord.combo)
        };
        try {
            localStorage.setItem('bottleShooterRecord', JSON.stringify(bestRecord));
        } catch { /* The game still works when browser storage is unavailable. */ }
    }
    ui.bestSide.textContent = formatScore(bestRecord.score);
}

function resizeCanvas() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    state.width = bounds.width;
    state.height = bounds.height;
    state.pixelRatio = state.quality === 'standard' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * state.pixelRatio);
    canvas.height = Math.round(bounds.height * state.pixelRatio);
    context.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
    drawScene(0);
}

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function addTarget() {
    const settings = difficultySettings[state.difficulty];
    const type = targetTypes[Math.floor(Math.random() * targetTypes.length)];
    const depth = randomBetween(0.72, 1.2);
    state.targets.push({
        type, x: randomBetween(0.19, 0.81), y: randomBetween(0.4, 0.69),
        depth, direction: Math.random() > 0.5 ? 1 : -1,
        speed: settings.speed * randomBetween(0.55, 1.35),
        phase: Math.random() * Math.PI * 2, wobble: randomBetween(0.01, 0.035),
        alive: true
    });
}

function startGame() {
    const settings = difficultySettings[state.difficulty];
    state.screen = 'playing';
    state.score = 0;
    state.combo = 1;
    state.bestCombo = 1;
    state.shots = 0;
    state.hits = 0;
    state.ammo = state.maxAmmo;
    state.elapsedTime = 0;
    state.spawnTimer = 0;
    state.reloadTimer = 0;
    state.reloading = false;
    state.targets = [];
    state.particles = [];
    for (let i = 0; i < settings.targetCount; i++) addTarget();
    ui.menu.classList.add('hidden');
    ui.pause.classList.add('hidden');
    ui.gameOver.classList.add('hidden');
    ui.dialog.classList.add('hidden');
    updateHud();
    sound('start');
    canvas.focus();
}

function finishGame() {
    if (state.screen !== 'playing' && state.screen !== 'paused') return;
    state.screen = 'gameover';
    state.reloading = false;
    ui.pause.classList.add('hidden');
    saveRecord();
    document.querySelector('#finalScore').textContent = formatScore(state.score);
    document.querySelector('#finalAccuracy').textContent = `${state.shots ? Math.round(state.hits / state.shots * 100) : 0}%`;
    document.querySelector('#finalCombo').textContent = `×${state.bestCombo}`;
    ui.gameOver.classList.remove('hidden');
    sound('gameover');
}

function updateHud() {
    ui.score.textContent = formatScore(state.score);
    ui.combo.textContent = `LIÊN TIẾP ×${state.combo}`;
    const elapsedSeconds = Math.floor(state.elapsedTime);
    const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    const seconds = String(elapsedSeconds % 60).padStart(2, '0');
    ui.time.textContent = `${minutes}:${seconds}`;
    ui.timeBar.style.transform = 'scaleX(1)';
    ui.ammo.innerHTML = `${state.ammo} <small>/ ${state.maxAmmo}</small>`;
    ui.ammoPips.innerHTML = Array.from({ length: state.maxAmmo }, (_, index) => `<i class="${index >= state.ammo ? 'empty' : ''}"></i>`).join('');
    ui.reload.disabled = state.screen !== 'playing' || state.reloading || state.ammo === state.maxAmmo;
    ui.reload.classList.toggle('is-reloading', state.reloading);
}

function startReload() {
    if (state.screen !== 'playing' || state.reloading || state.ammo === state.maxAmmo) return;
    state.reloading = true;
    state.reloadTimer = 1.25;
    ui.reload.disabled = true;
    ui.reload.innerHTML = '<span class="reload-symbol">↻</span> ĐANG NẠP';
    sound('reload');
}

function fire() {
    if (state.screen !== 'playing' || state.reloading) return;
    if (state.ammo <= 0) {
        startReload();
        return;
    }
    state.ammo--;
    state.shots++;
    state.flashTimer = .09;
    canvas.classList.remove('muzzle-flash');
    void canvas.offsetWidth;
    canvas.classList.add('muzzle-flash');
    crosshair.classList.remove('kick');
    void crosshair.offsetWidth;
    crosshair.classList.add('kick');
    window.setTimeout(() => crosshair.classList.remove('kick'), 100);
    sound('shot');

    const settings = difficultySettings[state.difficulty];
    const hitTarget = [...state.targets].reverse().find((target) => {
        const size = getTargetSize(target);
        const x = target.x * state.width;
        const y = target.y * state.height;
        return Math.hypot(state.aim.x * state.width - x, state.aim.y * state.height - y) < size.radius * 1.08;
    });

    if (hitTarget) {
        state.hits++;
        state.combo++;
        state.bestCombo = Math.max(state.bestCombo, state.combo);
        const isSpecial = Math.hypot(state.aim.x * state.width - hitTarget.x * state.width, state.aim.y * state.height - hitTarget.y * state.height) < getTargetSize(hitTarget).radius * 0.23;
        const points = (isSpecial ? 200 : hitTarget.type.points) * Math.max(1, state.combo - 1);
        state.score += points;
        makeBreakEffect(hitTarget, points);
        state.targets = state.targets.filter((target) => target !== hitTarget);
        showFeedback(`+${points}`, hitTarget.x, hitTarget.y);
        sound('hit');
        if (state.combo > 2) sound('combo');
        state.spawnTimer = Math.min(state.spawnTimer, settings.spawnEvery * 0.45);
    } else {
        state.combo = 1;
        makeMissEffect();
        sound('miss');
        showFeedback('TRƯỢT', state.aim.x, state.aim.y);
    }
    updateHud();
}

function showFeedback(text, x, y) {
    ui.feedback.textContent = text;
    ui.feedback.style.left = `${x * 100}%`;
    ui.feedback.style.top = `${y * 100}%`;
    ui.feedback.classList.remove('show');
    void ui.feedback.offsetWidth;
    ui.feedback.classList.add('show');
}

function getTargetSize(target) {
    const settings = difficultySettings[state.difficulty];
    const perspective = (0.56 + target.depth * 0.43) * settings.targetScale;
    const scale = Math.min(state.width, state.height) * 0.12 * perspective;
    return { width: scale * target.type.width, height: scale * target.type.height, radius: scale * Math.max(target.type.width, target.type.height) * 0.56 };
}

function makeBreakEffect(target, points) {
    const size = getTargetSize(target);
    for (let i = 0; i < 22; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = randomBetween(35, 150);
        state.particles.push({
            x: target.x * state.width, y: target.y * state.height,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 45,
            life: randomBetween(.45, 1), maxLife: 1,
            size: randomBetween(2, Math.max(3, size.width * .15)),
            color: target.type.shape === 'target' ? '#f1e4c8' : target.type.color,
            rotation: Math.random() * 6, spin: randomBetween(-9, 9)
        });
    }
}

function makeMissEffect() {
    for (let i = 0; i < 5; i++) {
        state.particles.push({ x: state.aim.x * state.width, y: state.aim.y * state.height, vx: randomBetween(-18, 18), vy: randomBetween(-35, -8), life: .45, maxLife: .45, size: randomBetween(3, 7), color: '#eee9d9', rotation: 0, spin: 0, smoke: true });
    }
}

function drawScene(delta) {
    const width = state.width;
    const height = state.height;
    if (!width || !height) return;
    context.clearRect(0, 0, width, height);

    // Layered silhouettes make a simple outdoor range feel deep without external images.
    const sky = context.createLinearGradient(0, 0, 0, height * .76);
    sky.addColorStop(0, '#92b7b2');
    sky.addColorStop(.62, '#d7d7b9');
    sky.addColorStop(1, '#e4d8ad');
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);
    drawSun(width * .79, height * .2, Math.min(width, height) * .047);
    drawMountainLayer(width, height, height * .39, '#8ba69a', 13, .055);
    drawMountainLayer(width, height, height * .47, '#708d7b', 17, .075);

    const groundStart = height * .59;
    const ground = context.createLinearGradient(0, groundStart, 0, height);
    ground.addColorStop(0, '#a1aa78');
    ground.addColorStop(.25, '#7f9267');
    ground.addColorStop(1, '#425b47');
    context.fillStyle = ground;
    context.fillRect(0, groundStart, width, height - groundStart);
    drawTreeLine(width, height, groundStart);
    drawGroundLines(width, height, groundStart);

    const tableY = height * .755;
    drawBench(width, tableY);
    state.targets.forEach((target) => drawTarget(target));
    state.particles.forEach((particle) => drawParticle(particle));
    drawWeapon(width, height);
}

function drawSun(x, y, radius) {
    const halo = context.createRadialGradient(x, y, radius * .2, x, y, radius * 2.5);
    halo.addColorStop(0, 'rgba(255,246,207,.82)');
    halo.addColorStop(1, 'rgba(255,246,207,0)');
    context.fillStyle = halo;
    context.fillRect(x - radius * 2.5, y - radius * 2.5, radius * 5, radius * 5);
    context.beginPath();
    context.arc(x, y, radius * .43, 0, Math.PI * 2);
    context.fillStyle = 'rgba(255,244,202,.83)';
    context.fill();
}

function drawMountainLayer(width, height, base, color, count, variation) {
    context.beginPath();
    context.moveTo(0, height);
    context.lineTo(0, base);
    for (let i = 0; i <= count; i++) {
        const x = width * i / count;
        const peak = base - Math.sin(i * 12.9898 + count) * height * variation - height * variation * .4;
        context.lineTo(x, peak);
    }
    context.lineTo(width, height);
    context.closePath();
    context.fillStyle = color;
    context.fill();
}

function drawTreeLine(width, height, groundStart) {
    for (let i = 0; i < 16; i++) {
        const x = width * i / 15;
        const y = groundStart + height * (.025 + Math.sin(i * 17) * .025);
        const size = height * (.025 + (i % 4) * .004);
        context.fillStyle = i % 2 ? '#536f55' : '#637b58';
        context.beginPath();
        context.moveTo(x - size, y + size * 1.4);
        context.lineTo(x, y - size);
        context.lineTo(x + size, y + size * 1.4);
        context.fill();
    }
}

function drawGroundLines(width, height, groundStart) {
    context.save();
    context.strokeStyle = 'rgba(230,224,174,.12)';
    context.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
        const y = groundStart + (height - groundStart) * (i / 7) ** 1.7;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y + Math.sin(i) * 5);
        context.stroke();
    }
    context.restore();
}

function drawBench(width, top) {
    const benchWidth = width * .64;
    const left = (width - benchWidth) / 2;
    const topThickness = Math.max(5, heightScale() * .025);
    context.fillStyle = 'rgba(35,49,37,.2)';
    context.beginPath();
    context.ellipse(width * .5, top + topThickness * 2.5, benchWidth * .59, topThickness * 1.8, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#755e43';
    context.fillRect(left, top, benchWidth, topThickness);
    context.fillStyle = '#997958';
    context.fillRect(left, top, benchWidth, topThickness * .35);
    context.fillStyle = '#5c4c3c';
    context.fillRect(left + benchWidth * .12, top + topThickness, topThickness * .62, heightScale() * .12);
    context.fillRect(left + benchWidth * .86, top + topThickness, topThickness * .62, heightScale() * .12);
}

function heightScale() { return state.height; }

function drawTarget(target) {
    const size = getTargetSize(target);
    const x = target.x * state.width;
    const y = target.y * state.height;
    const w = size.width;
    const h = size.height;
    context.save();
    context.translate(x, y);
    context.scale(w, h);
    context.fillStyle = 'rgba(34,44,35,.23)';
    context.beginPath();
    context.ellipse(0, .5, .43, .09, 0, 0, Math.PI * 2);
    context.fill();

    if (target.type.shape === 'target') {
        drawBullseye();
    } else if (target.type.shape === 'can') {
        drawCan(target.type.color);
    } else {
        drawBottle(target.type.color, target.type.shape === 'small');
    }
    context.restore();
}

function drawBottle(color, small) {
    const grad = context.createLinearGradient(-.45, 0, .45, 0);
    grad.addColorStop(0, '#4e665c');
    grad.addColorStop(.17, color);
    grad.addColorStop(.62, color);
    grad.addColorStop(1, '#53645a');
    context.fillStyle = grad;
    context.beginPath();
    context.moveTo(-.29, .43);
    context.lineTo(-.31, -.1);
    context.quadraticCurveTo(-.3, -.24, -.16, -.3);
    context.lineTo(-.12, -.42);
    context.lineTo(-.11, -.69);
    context.lineTo(-.07, -.73);
    context.lineTo(.07, -.73);
    context.lineTo(.11, -.69);
    context.lineTo(.12, -.42);
    context.lineTo(.16, -.3);
    context.quadraticCurveTo(.3, -.24, .31, -.1);
    context.lineTo(.29, .43);
    context.quadraticCurveTo(0, .5, -.29, .43);
    context.fill();
    context.fillStyle = '#ddcfaa';
    context.fillRect(-.13, -.78, .26, .08);
    context.fillStyle = small ? '#e3d6ad' : 'rgba(232,226,194,.75)';
    context.fillRect(-.2, -.08, .4, .22);
    context.fillStyle = 'rgba(255,255,230,.34)';
    context.fillRect(-.22, -.26, .035, .56);
    context.fillStyle = 'rgba(54,67,57,.24)';
    context.fillRect(.22, -.22, .04, .56);
}

function drawCan(color) {
    context.fillStyle = '#d7cfb4';
    context.beginPath();
    context.ellipse(0, -.43, .4, .1, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = color;
    context.fillRect(-.4, -.43, .8, .84);
    context.fillStyle = 'rgba(255,239,213,.5)';
    context.fillRect(-.34, -.4, .07, .76);
    context.fillStyle = '#756e59';
    context.beginPath();
    context.ellipse(0, .41, .4, .1, 0, 0, Math.PI * 2);
    context.fill();
}

function drawBullseye() {
    context.fillStyle = '#eee8d6';
    context.beginPath();
    context.arc(0, 0, .46, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ba6043';
    context.beginPath();
    context.arc(0, 0, .31, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#eee8d6';
    context.beginPath();
    context.arc(0, 0, .16, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ba6043';
    context.beginPath();
    context.arc(0, 0, .07, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#594d3a';
    context.fillRect(-.035, .43, .07, .48);
}

function drawParticle(particle) {
    context.save();
    context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    context.translate(particle.x, particle.y);
    context.rotate(particle.rotation);
    context.fillStyle = particle.color;
    if (particle.smoke) {
        context.beginPath();
        context.arc(0, 0, particle.size, 0, Math.PI * 2);
        context.fill();
    } else {
        context.beginPath();
        context.moveTo(-particle.size * .6, -particle.size * .5);
        context.lineTo(particle.size * .6, -particle.size * .2);
        context.lineTo(particle.size * .3, particle.size * .65);
        context.lineTo(-particle.size * .45, particle.size * .42);
        context.closePath();
        context.fill();
    }
    context.restore();
}

function drawWeapon(width, height) {
    const scale = Math.min(width / 600, height / 400);
    const centerX = width * .5;
    const baseY = height + height * .08;
    context.save();
    context.translate(centerX, baseY);
    context.scale(scale, scale);
    context.fillStyle = 'rgba(29,38,32,.4)';
    context.beginPath();
    context.moveTo(-145, 20); context.lineTo(-65, -52); context.lineTo(66, -52); context.lineTo(145, 20); context.closePath(); context.fill();
    context.fillStyle = '#303c36';
    context.beginPath();
    context.moveTo(-127, 20); context.lineTo(-54, -48); context.lineTo(54, -48); context.lineTo(127, 20); context.closePath(); context.fill();
    context.fillStyle = '#64756b';
    context.beginPath();
    context.moveTo(-47, -46); context.lineTo(-29, -80); context.lineTo(29, -80); context.lineTo(47, -46); context.closePath(); context.fill();
    context.fillStyle = '#1e2924';
    context.fillRect(-22, -86, 44, 10);
    context.fillStyle = '#bf714d';
    context.fillRect(-5, -84, 10, 4);
    if (state.flashTimer > 0) {
        const flashSize = 24 + Math.random() * 12;
        const glow = context.createRadialGradient(0, -91, 2, 0, -91, flashSize);
        glow.addColorStop(0, 'rgba(255,247,190,.95)');
        glow.addColorStop(.38, 'rgba(244,166,83,.74)');
        glow.addColorStop(1, 'rgba(244,166,83,0)');
        context.fillStyle = glow;
        context.beginPath();
        context.arc(0, -91, flashSize, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#fff3c4';
        context.beginPath();
        context.moveTo(0, -89);
        context.lineTo(-8, -114);
        context.lineTo(0, -107);
        context.lineTo(8, -114);
        context.closePath();
        context.fill();
    }
    context.restore();
}

function update(delta) {
    state.flashTimer = Math.max(0, state.flashTimer - delta);
    if (state.screen === 'playing') {
        state.elapsedTime += delta;
        const settings = difficultySettings[state.difficulty];
        state.spawnTimer += delta;
        if (state.targets.length < settings.targetCount && state.spawnTimer >= settings.spawnEvery) {
            state.spawnTimer = 0;
            addTarget();
        }
        state.targets.forEach((target) => {
            target.x += target.direction * target.speed * delta;
            if (target.x < .13 || target.x > .87) target.direction *= -1;
            target.y += Math.sin(performance.now() / 800 + target.phase) * target.wobble * delta;
        });
        if (state.reloading) {
            state.reloadTimer -= delta;
            if (state.reloadTimer <= 0) {
                state.ammo = state.maxAmmo;
                state.reloading = false;
                ui.reload.innerHTML = '<span class="reload-symbol">↻</span> NẠP ĐẠN <kbd>R</kbd>';
            }
        }
        updateHud();
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);
    state.particles.forEach((particle) => {
        particle.life -= delta;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vy += (particle.smoke ? -5 : 210) * delta;
        particle.rotation += particle.spin * delta;
    });
}

function animationFrame(time) {
    const delta = Math.min((time - (state.lastFrame || time)) / 1000, .05);
    state.lastFrame = time;
    update(delta);
    drawScene(delta);
    requestAnimationFrame(animationFrame);
}

function setAim(clientX, clientY) {
    const bounds = canvas.getBoundingClientRect();
    state.aim.x = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    state.aim.y = Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height));
    crosshair.style.left = `${state.aim.x * 100}%`;
    crosshair.style.top = `${state.aim.y * 100}%`;
}

function ensureAudio() {
    if (!state.audio) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) state.audio = new AudioContext();
    }
    if (state.audio?.state === 'suspended') state.audio.resume();
}

function tone(frequency, duration, type = 'sine', volume = .045, endFrequency = frequency) {
    if (!state.soundEnabled) return;
    ensureAudio();
    if (!state.audio) return;
    const oscillator = state.audio.createOscillator();
    const gain = state.audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, state.audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), state.audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, state.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, state.audio.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(state.audio.destination);
    oscillator.start();
    oscillator.stop(state.audio.currentTime + duration);
}

function sound(name) {
    if (!state.soundEnabled) return;
    if (name === 'shot' || name === 'miss') {
        tone(name === 'shot' ? 115 : 90, .12, 'triangle', .09, 42);
        tone(680, .035, 'square', .018, 160);
    } else if (name === 'hit') {
        tone(770, .16, 'sine', .06, 320);
        tone(1120, .12, 'triangle', .03, 590);
    } else if (name === 'reload') {
        tone(240, .12, 'square', .025, 370);
        window.setTimeout(() => tone(310, .11, 'square', .02, 220), 180);
    } else if (name === 'combo') {
        tone(620, .1, 'sine', .035, 820);
    } else if (name === 'gameover') {
        tone(300, .3, 'triangle', .04, 130);
    } else if (name === 'start') {
        tone(440, .14, 'sine', .025, 620);
    }
}

function pauseGame() {
    if (state.screen !== 'playing') return;
    state.screen = 'paused';
    ui.pause.classList.remove('hidden');
}

function openDialog(type) {
    const title = document.querySelector('#dialogTitle');
    const eyebrow = document.querySelector('#dialogEyebrow');
    const content = document.querySelector('#dialogContent');
    if (type === 'how') {
        eyebrow.textContent = 'HƯỚNG DẪN';
        title.innerHTML = 'Cách<br><em>chơi.</em>';
        content.innerHTML = '<p><strong>01 / NGẮM</strong> Trên điện thoại, kéo ngón tay để di chuyển tâm ngắm. Chạm vào màn hình để ngắm và bắn ngay.</p><p><strong>02 / BẮN</strong> Trên máy tính, di chuyển chuột để ngắm rồi nhấp để bắn. Bắn trúng chính giữa mục tiêu sẽ được thưởng thêm điểm.</p><p><strong>03 / GIỮ CHUỖI</strong> Mỗi lần bắn trúng sẽ kéo dài chuỗi liên tiếp. Bắn trượt làm chuỗi trở về ×1. Nhấn R hoặc NẠP ĐẠN khi hết đạn.</p><p><strong>ESC</strong> để tạm dừng. Hãy bắn hạ thật nhiều mục tiêu trước khi kết thúc lượt.</p>';
    } else if (type === 'settings') {
        eyebrow.textContent = 'TÙY CHỈNH TRƯỜNG BẮN';
        title.innerHTML = 'Tùy chỉnh<br><em>cài đặt.</em>';
        content.innerHTML = `<div class="setting-row"><label for="soundSetting">Âm thanh</label><input id="soundSetting" type="checkbox" ${state.soundEnabled ? 'checked' : ''}></div><div class="setting-row"><label for="mouseSensitivity">Độ nhạy chuột</label><input id="mouseSensitivity" type="range" min="50" max="150" value="100"></div><div class="setting-row"><label for="touchSensitivity">Độ nhạy cảm ứng</label><input id="touchSensitivity" type="range" min="50" max="150" value="100"></div><div class="setting-row"><label for="qualitySetting">Chất lượng đồ họa</label><select id="qualitySetting"><option value="high">Cao</option><option value="standard">Tiêu chuẩn</option></select></div>`;
        content.querySelector('#soundSetting').addEventListener('change', (event) => {
            state.soundEnabled = event.target.checked;
            document.body.classList.toggle('sound-muted', !state.soundEnabled);
        });
        content.querySelector('#mouseSensitivity').addEventListener('input', (event) => { canvas.dataset.mouseSensitivity = String(Number(event.target.value) / 100); });
        content.querySelector('#touchSensitivity').addEventListener('input', (event) => { canvas.dataset.touchSensitivity = String(Number(event.target.value) / 100); });
        content.querySelector('#qualitySetting').addEventListener('change', (event) => {
            state.quality = event.target.value;
            resizeCanvas();
        });
    } else {
        eyebrow.textContent = 'THÀNH TÍCH CỦA BẠN';
        title.innerHTML = 'Kỷ lục<br><em>cá nhân.</em>';
        content.innerHTML = `<div class="best-grid"><span>ĐIỂM CAO NHẤT</span><strong>${formatScore(bestRecord.score)}</strong><span>ĐỘ CHÍNH XÁC CAO NHẤT</span><strong>${bestRecord.accuracy}%</strong><span>CHUỖI DÀI NHẤT</span><strong>×${bestRecord.combo}</strong></div>`;
    }
    ui.dialog.classList.remove('hidden');
}

document.querySelector('#startButton').addEventListener('click', startGame);
document.querySelector('#playAgainButton').addEventListener('click', startGame);
document.querySelector('#pauseRestartButton').addEventListener('click', startGame);
document.querySelector('#endSessionButton').addEventListener('click', finishGame);
document.querySelector('#resumeButton').addEventListener('click', () => {
    state.screen = 'playing';
    ui.pause.classList.add('hidden');
});
document.querySelector('#fireButton').addEventListener('click', fire);
document.querySelector('#reloadButton').addEventListener('click', startReload);
document.querySelector('#pauseButton').addEventListener('click', pauseGame);
document.querySelector('#bestButton').addEventListener('click', () => openDialog('best'));
document.querySelector('#closeDialog').addEventListener('click', () => ui.dialog.classList.add('hidden'));
document.querySelector('#soundToggle').addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    document.body.classList.toggle('sound-muted', !state.soundEnabled);
});
document.querySelectorAll('[data-dialog]').forEach((button) => button.addEventListener('click', () => openDialog(button.dataset.dialog)));

document.querySelectorAll('[data-difficulty]').forEach((button) => {
    button.addEventListener('click', () => {
        if (state.screen === 'playing') return;
        document.querySelectorAll('[data-difficulty]').forEach((option) => option.classList.toggle('active', option === button));
        state.difficulty = button.dataset.difficulty;
        document.querySelector('#difficultyNote').textContent = difficultySettings[state.difficulty].label;
        updateHud();
    });
});

canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;

    const bounds = canvas.getBoundingClientRect();
    const sensitivity = Number(canvas.dataset.mouseSensitivity || 1);
    if (!state.lastPointer || state.lastPointer.type !== 'mouse') {
        setAim(event.clientX, event.clientY);
    } else {
        state.aim.x += (event.clientX - state.lastPointer.x) / bounds.width * sensitivity;
        state.aim.y += (event.clientY - state.lastPointer.y) / bounds.height * sensitivity;
        state.aim.x = Math.max(0, Math.min(1, state.aim.x));
        state.aim.y = Math.max(0, Math.min(1, state.aim.y));
        crosshair.style.left = `${state.aim.x * 100}%`;
        crosshair.style.top = `${state.aim.y * 100}%`;
    }
    state.lastPointer = { x: event.clientX, y: event.clientY, type: 'mouse' };
});
canvas.addEventListener('pointerdown', (event) => {
    state.lastPointer = { x: event.clientX, y: event.clientY, type: event.pointerType };
    if (event.pointerType === 'touch') {
        canvas.setPointerCapture(event.pointerId);
        setAim(event.clientX, event.clientY);
        fire();
    } else if (event.button === 0) {
        setAim(event.clientX, event.clientY);
        fire();
    }
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'r') startReload();
    if (event.key === 'Escape') {
        if (!ui.dialog.classList.contains('hidden')) ui.dialog.classList.add('hidden');
        else if (state.screen === 'playing') pauseGame();
        else if (state.screen === 'paused') document.querySelector('#resumeButton').click();
    }
    if (event.code === 'Space' && state.screen === 'playing') {
        event.preventDefault();
        fire();
    }
});
window.addEventListener('resize', resizeCanvas);
if ('ResizeObserver' in window) {
    new ResizeObserver(resizeCanvas).observe(canvas);
}

resizeCanvas();
updateHud();
requestAnimationFrame(animationFrame);
