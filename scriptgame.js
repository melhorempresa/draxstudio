const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elementos da UI
const playerHealthUI = document.getElementById('playerHealth');
const dragonHealthUI = document.getElementById('dragonHealth');
const waveUI = document.getElementById('wave');
const scoreUI = document.getElementById('score');
const gameOverScreen = document.getElementById('gameOverScreen');
const victoryScreen = document.getElementById('victoryScreen');

// Configurações do Jogo
canvas.width = 800;
canvas.height = 600;

let player;
let dragon;
let playerProjectiles = [];
let dragonProjectiles = [];
let keys = {};
let score = 0;
let currentWave = 1;
let gameOver = false;
let waveTransition = false;

// --- NOVA SEÇÃO: POWER-UPS ---
let powerUps = [];
let randomPowerUpSpawnTimer = 0;
const RANDOM_POWERUP_SPAWN_INTERVAL = 60; // Checar a cada segundo (60 ticks)

const POWERUP_TYPES = {
    SHIELD: 'shield',
    RAPID_FIRE: 'rapid_fire',
    HEALTH_PACK: 'health_pack',
    DAMAGE_BOOST: 'damage_boost'
};
const POWERUP_DURATION = 300; // 5 segundos de duração para power-ups temporários (60fps * 5s)
// --- FIM DA NOVA SEÇÃO: POWER-UPS ---


// --- REMOVIDO: waveSettings e MAX_WAVES ---
// const waveSettings = { ... };
// const MAX_WAVES = Object.keys(waveSettings).length;


// --- NOVA FUNÇÃO: Geração Dinâmica de Configurações de Onda ---
function generateWaveSettings(waveNum) {
    const settings = {};

    settings.dragonHealth = 100 + Math.pow(waveNum, 1.8) * 10 + (waveNum > 10 ? (waveNum - 10) * 20 : 0);
    settings.dragonAttackInterval = Math.max(30, 100 - waveNum * 2.5 - (waveNum > 15 ? (waveNum - 15) * 1 : 0) );
    settings.dragonMoveSpeedBase = Math.min(2.5, 0.7 + waveNum * 0.05 + (waveNum > 10 ? (waveNum-10) * 0.02 : 0) );
    settings.projectileSpeedMultiplier = 1 + waveNum * 0.04 + (waveNum > 10 ? (waveNum - 10) * 0.01 : 0);
    settings.numProjectiles = 1 + Math.floor(waveNum / 4);
    if (waveNum > 20) settings.numProjectiles += Math.floor((waveNum - 20) / 5);
    settings.numProjectiles = Math.min(5, settings.numProjectiles);
    settings.laserChance = Math.min(0.5, 0.05 + waveNum * 0.015);
    settings.tripleAttackChance = Math.min(0.6, 0.05 + waveNum * 0.02);
    settings.circlingChance = Math.min(0.5, 0.1 + waveNum * 0.01);
    settings.circlingDuration = 240 + waveNum * 5;

    settings.playerProjectileSpeed = 7 + waveNum * 0.15;
    settings.playerShootCooldown = Math.max(5, 20 - waveNum * 0.4);

    settings.powerUpDropChanceOnDefeat = Math.min(0.75, 0.1 + waveNum * 0.02);
    settings.randomPowerUpSpawnChancePerSecond = Math.min(0.05, 0.005 + waveNum * 0.001);

    return settings;
}
// --- FIM DA NOVA FUNÇÃO ---


// Entidades do Jogo
class GameObject {
    constructor(x, y, width, height, color) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

// --- NOVA CLASSE: PowerUp ---
class PowerUp extends GameObject {
    constructor(x, y, type) {
        let width = 25, height = 25, color = 'yellow';
        let symbol = "?"; // Símbolo padrão
        switch (type) {
            case POWERUP_TYPES.SHIELD: color = 'rgba(0, 191, 255, 0.8)'; symbol = "S"; break; // Azul claro
            case POWERUP_TYPES.RAPID_FIRE: color = 'rgba(50, 205, 50, 0.8)'; symbol = "R"; break; // Verde limão
            case POWERUP_TYPES.HEALTH_PACK: color = 'rgba(255, 105, 180, 0.8)'; symbol = "H"; break; // Rosa choque
            case POWERUP_TYPES.DAMAGE_BOOST: color = 'rgba(255, 69, 0, 0.8)'; symbol = "D"; break; // Laranja avermelhado
        }
        super(x, y, width, height, color);
        this.type = type;
        this.symbol = symbol;
        this.fallSpeed = 1.5;
        this.lifeSpan = 600; // 10 segundos
    }

    update() {
        this.y += this.fallSpeed;
        this.lifeSpan--;
        if (this.lifeSpan <= 0 || this.y > canvas.height + this.height) { // Checa se saiu da tela por baixo também
            return false;
        }
        this.draw();
        // Desenhar símbolo
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.symbol, this.x + this.width / 2, this.y + this.height / 2);
        return true;
    }
}
// --- FIM DA NOVA CLASSE: PowerUp ---


class Player extends GameObject {
    constructor(x, y, width, height, color, speed, health) {
        super(x, y, width, height, color);
        this.speed = speed;
        this.health = health;
        this.maxHealth = 100; // Max health pode ser aumentado ou não por power-ups (design choice)
        this.currentShootCooldown = 20;
        this.currentProjectileSpeed = 7;
        this.projectileDamage = 10; // Dano base do projétil
        this.shootTimer = 0;

        // --- ADICIONADO: Estados e Timers de Power-up ---
        this.isShielded = false;
        this.shieldTimer = 0;
        this.rapidFireActive = false;
        this.rapidFireTimer = 0;
        this.damageBoostActive = false;
        this.damageBoostTimer = 0;
        // --- FIM DAS ADIÇÕES DE POWER-UP ---
    }

    update(settings) {
        if (this.shootTimer > 0) this.shootTimer--;

        // --- ADICIONADO: Atualizar timers de power-ups ---
        this.updatePowerUpTimers();
        // --- FIM DAS ADIÇÕES DE POWER-UP ---

        // Ajustar stats com base na onda e power-ups
        this.currentShootCooldown = settings.playerShootCooldown;
        if (this.rapidFireActive) {
            this.currentShootCooldown = Math.max(3, this.currentShootCooldown / 2); // Cadência dobrada, mínimo 3 ticks
        }
        this.currentProjectileSpeed = settings.playerProjectileSpeed;
        this.projectileDamage = this.damageBoostActive ? 20 : 10; // Dano dobrado com boost

        // Movimento
        if ((keys['ArrowLeft'] || keys['KeyA']) && this.x > 0) this.x -= this.speed;
        if ((keys['ArrowRight'] || keys['KeyD']) && this.x < canvas.width - this.width) this.x += this.speed;
        if ((keys['ArrowUp'] || keys['KeyW']) && this.y > canvas.height * 0.5) this.y -= this.speed;
        if ((keys['ArrowDown'] || keys['KeyS']) && this.y < canvas.height - this.height - 10) this.y += this.speed;

        if (keys['Space'] && this.shootTimer === 0) {
            this.shoot();
            this.shootTimer = this.currentShootCooldown;
        }
        this.draw();
        // --- ADICIONADO: Desenhar escudo se ativo ---
        if (this.isShielded) {
            this.drawShield();
        }
        // --- FIM DAS ADIÇÕES DE POWER-UP ---
    }

    // --- NOVOS MÉTODOS PARA POWER-UPS ---
    updatePowerUpTimers() {
        if (this.shieldTimer > 0) {
            this.shieldTimer--;
            if (this.shieldTimer === 0) this.isShielded = false;
        }
        if (this.rapidFireTimer > 0) {
            this.rapidFireTimer--;
            if (this.rapidFireTimer === 0) this.rapidFireActive = false;
        }
        if (this.damageBoostTimer > 0) {
            this.damageBoostTimer--;
            if (this.damageBoostTimer === 0) this.damageBoostActive = false;
        }
    }

    drawShield() {
        ctx.strokeStyle = 'rgba(0, 220, 255, 0.6)'; // Cor mais vibrante
        ctx.lineWidth = 4;
        ctx.beginPath();
        // Escudo um pouco maior e pulsante (simples)
        const pulse = Math.sin(Date.now() / 200) * 2; // Leve pulsação
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width * 0.7 + pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
    }

    activatePowerUp(type) {
        switch (type) {
            case POWERUP_TYPES.SHIELD:
                this.isShielded = true;
                this.shieldTimer = POWERUP_DURATION * 1.2; // Escudo dura até ser atingido ou 20% mais
                break;
            case POWERUP_TYPES.RAPID_FIRE:
                this.rapidFireActive = true;
                this.rapidFireTimer = POWERUP_DURATION;
                break;
            case POWERUP_TYPES.HEALTH_PACK:
                this.health = Math.min(this.maxHealth, this.health + 30); // Cura 30
                updateUI();
                break;
            case POWERUP_TYPES.DAMAGE_BOOST:
                this.damageBoostActive = true;
                this.damageBoostTimer = POWERUP_DURATION;
                break;
        }
    }
    // --- FIM DOS NOVOS MÉTODOS PARA POWER-UPS ---

    shoot() {
        const projectile = new Projectile(
            this.x + this.width / 2 - 2.5, this.y,
            5, 10, this.damageBoostActive ? 'orangered' : 'cyan', // Projétil muda de cor com damage boost
            this.currentProjectileSpeed, 'player'
        );
        playerProjectiles.push(projectile);
    }

    takeDamage(amount) {
        // --- MODIFICADO: Lógica do escudo ---
        if (this.isShielded) {
            this.isShielded = false;
            this.shieldTimer = 0;
            // TODO: Adicionar som de escudo quebrando
            return;
        }
        // --- FIM DA MODIFICAÇÃO ---
        this.health -= amount;
        updateUI();
        if (this.health <= 0) {
            this.health = 0;
            triggerGameOver();
        }
    }
}


class Dragon extends GameObject {
    constructor(x, y, width, height, color, health, attackIntervalBase, moveSpeedBase) {
        super(x, y, width, height, color);
        this.health = health;
        this.maxHealth = health;
        this.attackIntervalBase = attackIntervalBase;
        this.attackTimer = this.attackIntervalBase;
        this.moveSpeedBase = moveSpeedBase;
        this.moveDirection = 1;
        this.moveRange = { minX: 30, maxX: canvas.width - this.width - 30 };
        this.isCircling = false;
        this.circlingTimer = 0;
        this.circlingCheckInterval = 300;
        this.circlingCheckTimer = Math.random() * this.circlingCheckInterval;
        this.orbitAngle = 0;
        this.orbitRadius = 180;
        this.orbitSpeed = 0.015;
        this.targetYDuringCircling = 100;
    }

    update(settings, playerRef) {
        this.handleCirclingState(settings, playerRef);
        if (!this.isCircling) {
            const currentMoveSpeed = this.moveSpeedBase * settings.projectileSpeedMultiplier;
            this.x += currentMoveSpeed * this.moveDirection;
            if (this.x <= this.moveRange.minX && this.moveDirection === -1) { this.moveDirection = 1; this.x = this.moveRange.minX; }
            else if (this.x >= this.moveRange.maxX && this.moveDirection === 1) { this.moveDirection = -1; this.x = this.moveRange.maxX; }
            if (this.y !== 30) { this.y += (30 - this.y) * 0.1; }
        } else {
            this.orbitAngle += this.orbitSpeed * settings.projectileSpeedMultiplier;
            const targetX = playerRef.x + playerRef.width / 2 + this.orbitRadius * Math.cos(this.orbitAngle) - this.width / 2;
            const targetY = this.targetYDuringCircling + (this.orbitRadius / 2) * Math.sin(this.orbitAngle * 2) - this.height / 2;
            this.x += (targetX - this.x) * 0.05;
            this.y += (targetY - this.y) * 0.05;
            this.y = Math.max(10, Math.min(this.y, canvas.height * 0.45 - this.height));
        }
        this.attackTimer--;
        if (this.attackTimer <= 0) {
            this.performAttack(settings, playerRef);
            this.attackTimer = settings.dragonAttackInterval / (this.isCircling ? 1.25 : 1); // Ataque 25% mais rápido ao circular
        }
        this.draw();
    }

    handleCirclingState(settings, playerRef) {
        if (this.isCircling) {
            this.circlingTimer--;
            if (this.circlingTimer <= 0) {
                this.isCircling = false;
                this.circlingCheckTimer = this.circlingCheckInterval;
            }
        } else {
            this.circlingCheckTimer--;
            if (this.circlingCheckTimer <= 0) {
                this.circlingCheckTimer = this.circlingCheckInterval;
                if (Math.random() < settings.circlingChance) {
                    this.isCircling = true;
                    this.circlingTimer = settings.circlingDuration;
                    this.orbitAngle = Math.atan2((playerRef.y + playerRef.height / 2) - (this.y + this.height / 2), (playerRef.x + playerRef.width / 2) - (this.x + this.width / 2)) + Math.PI;
                }
            }
        }
    }

    performAttack(settings, playerRef) {
        const roll = Math.random();
        if (roll < settings.tripleAttackChance) this.tripleAttack(settings, playerRef);
        else this.standardAttack(settings, playerRef);
    }

    fireProjectile(posX, posY, settings, isLaserOverride = false, targetPlayer = false, playerRef = null, fixedAngleDeg = null) {
        let pColor = 'orange', pWidth = 10, pHeight = 10, pBaseSpeed = 3, dx = 0, dy = 0;
        if (isLaserOverride || Math.random() < settings.laserChance) {
            pColor = 'red'; pWidth = 5; pHeight = 20; pBaseSpeed = 5;
        }
        const actualSpeed = pBaseSpeed * settings.projectileSpeedMultiplier;
        if (targetPlayer && playerRef) {
            const angleToPlayer = Math.atan2((playerRef.y + playerRef.height / 2) - (posY + pHeight / 2), (playerRef.x + playerRef.width / 2) - (posX + pWidth / 2));
            dx = Math.cos(angleToPlayer) * actualSpeed; dy = Math.sin(angleToPlayer) * actualSpeed;
        } else if (fixedAngleDeg !== null) {
            const angleRad = fixedAngleDeg * (Math.PI / 180);
            dx = Math.cos(angleRad) * actualSpeed; dy = Math.sin(angleRad) * actualSpeed;
        } else { dy = actualSpeed; }
        dragonProjectiles.push(new Projectile(posX - pWidth / 2, posY, pWidth, pHeight, pColor, actualSpeed, 'dragon', dx, dy));
    }

    standardAttack(settings, playerRef) {
        const shouldTarget = this.isCircling || Math.random() < 0.35; // Aumentei a chance de mirar
        for (let i = 0; i < settings.numProjectiles; i++) {
            setTimeout(() => {
                const projSpawnX = this.x + this.width / 2; const projSpawnY = this.y + this.height;
                this.fireProjectile(projSpawnX, projSpawnY, settings, false, shouldTarget, playerRef);
            }, i * 100); // Reduzi o delay
        }
    }

    tripleAttack(settings, playerRef) {
        const projSpawnX = this.x + this.width / 2; const projSpawnY = this.y + this.height;
        const spreadAngle = 15;
        this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90);
        this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90 - spreadAngle);
        this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90 + spreadAngle);
    }

    takeDamage(amount) { // amount é player.projectileDamage
        this.health -= amount;
        score += amount; // Score baseado no dano
        updateUI();
        if (this.health <= 0) {
            this.health = 0;
            score += 100 * currentWave;
            // --- ADICIONADO: Chance de dropar power-up ---
            const waveDefeatSettings = generateWaveSettings(currentWave);
            if (Math.random() < waveDefeatSettings.powerUpDropChanceOnDefeat) {
                spawnPowerUp(this.x + this.width / 2, this.y + this.height / 2);
            }
            // --- FIM DA ADIÇÃO ---
            nextWave();
        }
    }
}


class Projectile extends GameObject {
    constructor(x, y, width, height, color, speed, owner, dx = 0, dy = 0) {
        super(x, y, width, height, color);
        this.speed = speed;
        this.owner = owner;
        this.dx = dx;
        this.dy = dy;
        if (this.owner === 'player') { this.dy = -this.speed; this.dx = 0; }
        else { if (dx === 0 && dy === 0) { this.dy = this.speed; this.dx = 0; } }
    }
    update() {
        this.x += this.dx; this.y += this.dy; this.draw();
    }
}

// --- NOVAS FUNÇÕES: Spawn de Power-ups ---
function spawnPowerUp(x, y, specificType = null) {
    let type;
    if (specificType) {
        type = specificType;
    } else {
        const typeKeys = Object.values(POWERUP_TYPES);
        type = typeKeys[Math.floor(Math.random() * typeKeys.length)];
    }
    const powerUp = new PowerUp(x, y, type);
    powerUps.push(powerUp);
}

function handleRandomPowerUpSpawns(settings) {
    randomPowerUpSpawnTimer--;
    if (randomPowerUpSpawnTimer <= 0) {
        randomPowerUpSpawnTimer = RANDOM_POWERUP_SPAWN_INTERVAL;
        if (Math.random() < settings.randomPowerUpSpawnChancePerSecond) {
            const spawnX = Math.random() * (canvas.width - 50) + 25; // Evita spawn muito nas bordas
            spawnPowerUp(spawnX, -30);
        }
    }
}
// --- FIM DAS NOVAS FUNÇÕES ---


// Funções do Jogo
function initGame() {
    gameOver = false;
    waveTransition = false;
    score = 0;
    currentWave = 1;
    playerProjectiles = [];
    dragonProjectiles = [];
    // --- ADICIONADO: Limpar power-ups e resetar timer ---
    powerUps = [];
    randomPowerUpSpawnTimer = Math.floor(Math.random() * RANDOM_POWERUP_SPAWN_INTERVAL);
    // --- FIM DA ADIÇÃO ---
    keys = {};

    gameOverScreen.style.display = 'none';
    victoryScreen.style.display = 'none';

    const initialSettings = generateWaveSettings(currentWave); // Usa a nova função
    player = new Player(canvas.width / 2 - 25, canvas.height - 70, 50, 30, 'lime', 7, 100);
    player.currentShootCooldown = initialSettings.playerShootCooldown;
    player.currentProjectileSpeed = initialSettings.playerProjectileSpeed;
    player.maxHealth = 100;
    player.health = player.maxHealth;
    // Resetar estados de power-up do jogador
    player.isShielded = false; player.shieldTimer = 0;
    player.rapidFireActive = false; player.rapidFireTimer = 0;
    player.damageBoostActive = false; player.damageBoostTimer = 0;


    setupWave(currentWave);
    updateUI();
    gameLoop();
}

function setupWave(waveNum) {
    const settings = generateWaveSettings(waveNum); // Usa a nova função

    dragon = new Dragon(
        canvas.width / 2 - 50, 30, 100, 80, 'purple',
        settings.dragonHealth,
        settings.dragonAttackInterval,
        settings.dragonMoveSpeedBase
    );
    dragon.attackTimer = settings.dragonAttackInterval;

    // --- MODIFICADO: Lógica de cura entre ondas ---
    if (waveNum > 1) {
        player.health = Math.min(player.maxHealth, player.health + Math.floor(player.maxHealth * 0.20)); // Recupera 20%
        updateUI();
    }
    // --- FIM DA MODIFICAÇÃO ---

    playerProjectiles = [];
    dragonProjectiles = [];
    // Decisão de design: Limpar power-ups não coletados entre as ondas? Por enquanto, não.
    // if (waveNum > 1) powerUps = [];
    updateUI();
}

function nextWave() {
    // --- REMOVIDA: Verificação de MAX_WAVES ---
    currentWave++;
    waveTransition = true;
    victoryScreen.innerHTML = `<h2>Onda ${currentWave - 1} Concluída!</h2><p>Preparando Onda ${currentWave}...</p>`;
    victoryScreen.style.display = 'block';

    setTimeout(() => {
        victoryScreen.style.display = 'none';
        setupWave(currentWave);
        waveTransition = false;
        if (!gameOver) gameLoop();
    }, 2500);
}

// --- REMOVIDA/COMENTADA: triggerGameWin() pois o jogo é infinito ---
/*
function triggerGameWin() {
    // ...
}
*/

function updateUI() {
    playerHealthUI.textContent = player.health;
    dragonHealthUI.textContent = dragon ? dragon.health : 'N/A';
    waveUI.textContent = currentWave;
    scoreUI.textContent = score;
}

function checkCollisions() {
    // Projéteis do jogador vs Dragão
    for (let i = playerProjectiles.length - 1; i >= 0; i--) {
        const p = playerProjectiles[i];
        if (dragon &&
            p.x < dragon.x + dragon.width && p.x + p.width > dragon.x &&
            p.y < dragon.y + dragon.height && p.y + p.height > dragon.y
        ) {
            dragon.takeDamage(player.projectileDamage); // Usa o dano atualizado do jogador
            playerProjectiles.splice(i, 1);
        }
    }

    // Projéteis do Dragão vs Jogador
    for (let i = dragonProjectiles.length - 1; i >= 0; i--) {
        const p = dragonProjectiles[i];
        if (
            player.x < p.x + p.width && player.x + player.width > p.x &&
            player.y < p.y + p.height && player.y + player.height > p.y
        ) {
            player.takeDamage(15); // Dano do projétil do dragão (pode ser dinâmico)
            dragonProjectiles.splice(i, 1);
        }
    }

    // --- ADICIONADO: Colisão Jogador vs Power-ups ---
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const pu = powerUps[i];
        if (
            player.x < pu.x + pu.width && player.x + player.width > pu.x &&
            player.y < pu.y + pu.height && player.y + player.height > pu.y
        ) {
            player.activatePowerUp(pu.type);
            powerUps.splice(i, 1);
            // TODO: Adicionar som de coleta
        }
    }
    // --- FIM DA ADIÇÃO ---
}

function triggerGameOver() {
    gameOver = true;
    gameOverScreen.innerHTML = `
        <h2>Fim de Jogo!</h2>
        <p>Você sobreviveu até a Onda ${currentWave}.</p>
        <p>Sua pontuação: <span id="finalScoreOver">${score}</span></p>
        <button id="restartButtonOver">Jogar Novamente</button>
    `;
    document.getElementById('finalScoreOver').textContent = score;
    gameOverScreen.style.display = 'block';
    document.getElementById('restartButtonOver').addEventListener('click', initGame);
}

// Game Loop
function gameLoop() {
    if (gameOver || waveTransition) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentWaveSettings = generateWaveSettings(currentWave); // Usa a nova função

    player.update(currentWaveSettings);
    if (dragon) dragon.update(currentWaveSettings, player);

    // --- ADICIONADO: Atualizar e desenhar Power-ups & Lidar com spawn aleatório ---
    powerUps = powerUps.filter(p => p.update());
    handleRandomPowerUpSpawns(currentWaveSettings);
    // --- FIM DA ADIÇÃO ---

    playerProjectiles = playerProjectiles.filter(p => p.y + p.height > 0 && p.y < canvas.height && p.x + p.width > 0 && p.x < canvas.width);
    playerProjectiles.forEach(p => p.update());
    dragonProjectiles = dragonProjectiles.filter(p => p.y + p.height > 0 && p.y < canvas.height && p.x + p.width > 0 && p.x < canvas.width);
    dragonProjectiles.forEach(p => p.update());

    checkCollisions();
    updateUI();
    requestAnimationFrame(gameLoop);
}

// Event Listeners
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (!gameOver && (e.code === 'Space' || e.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code))) {
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// Iniciar o jogo
initGame();
