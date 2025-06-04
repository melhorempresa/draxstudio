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
const MAP_CENTER_X = canvas.width / 2;
const MAP_CENTER_Y = canvas.height * 0.3; // Centro da órbita do dragão, um pouco acima do meio

let player;
let dragon;
let playerProjectiles = [];
let dragonProjectiles = [];
let keys = {};
let score = 0;
let currentWave = 1;
let gameOver = false;
let waveTransition = false;

// Power-ups
let powerUps = [];
let randomPowerUpSpawnTimer = 0;
const RANDOM_POWERUP_SPAWN_INTERVAL = 60; // Checar a cada segundo (60 ticks)
const POWERUP_TYPES = { SHIELD: 'shield', RAPID_FIRE: 'rapid_fire', HEALTH_PACK: 'health_pack', DAMAGE_BOOST: 'damage_boost' };
const POWERUP_DURATION = 300; // 5 segundos de duração para power-ups temporários (60fps * 5s)


function generateWaveSettings(waveNum) {
    const settings = {};

    // Configurações do Dragão
    settings.dragonHealth = 100 + Math.pow(waveNum, 1.8) * 10 + (waveNum > 10 ? (waveNum - 10) * 25 : 0);
    settings.dragonAttackInterval = Math.max(25, 100 - waveNum * 2.7 - (waveNum > 15 ? (waveNum - 15) * 1.2 : 0) );
    settings.dragonMoveSpeedBase = Math.min(3.0, 0.7 + waveNum * 0.06 + (waveNum > 10 ? (waveNum-10) * 0.025 : 0) );
    settings.projectileSpeedMultiplier = 1 + waveNum * 0.045 + (waveNum > 10 ? (waveNum - 10) * 0.012 : 0); // Afeta projéteis do dragão
    settings.numProjectiles = 1 + Math.floor(waveNum / 3.5);
    if (waveNum > 18) settings.numProjectiles += Math.floor((waveNum - 18) / 4.5);
    settings.numProjectiles = Math.min(6, settings.numProjectiles);
    settings.laserChance = Math.min(0.6, 0.05 + waveNum * 0.018);
    settings.tripleAttackChance = Math.min(0.65, 0.05 + waveNum * 0.022);
    settings.circlingChance = Math.min(0.55, 0.1 + waveNum * 0.012);
    settings.circlingDuration = 240 + waveNum * 6;

    // Configurações do Jogador (projéteis e cadência)
    settings.playerProjectileSpeed = 7 + waveNum * 0.18;
    settings.playerShootCooldown = Math.max(2, 18 - waveNum * 0.55); // Cooldown mínimo 2

    settings.playerProjectileBaseWidth = 5;
    settings.playerProjectileBaseHeight = 10;
    settings.playerProjectileWidth = settings.playerProjectileBaseWidth + Math.floor(waveNum / 4.5);
    settings.playerProjectileHeight = settings.playerProjectileBaseHeight + Math.floor(waveNum / 2.5);
    settings.playerProjectileWidth = Math.min(18, settings.playerProjectileWidth);
    settings.playerProjectileHeight = Math.min(35, settings.playerProjectileHeight);

    const playerProjectileColors = ['cyan', 'lightskyblue', 'white', 'yellow', 'gold', 'lightcoral', 'violet'];
    settings.playerProjectileColor = playerProjectileColors[Math.min(playerProjectileColors.length - 1, Math.floor((waveNum-1) / 3.5))];

    settings.playerEmpoweredShotChance = Math.min(0.35, 0.02 + waveNum * 0.008);
    settings.playerEmpoweredShotSizeMultiplier = 1.6;

    // Configurações de Power-up
    settings.powerUpDropChanceOnDefeat = Math.min(0.80, 0.12 + waveNum * 0.022);
    settings.randomPowerUpSpawnChancePerSecond = Math.min(0.06, 0.006 + waveNum * 0.0012);

    return settings;
}


// Entidades do Jogo
class GameObject {
    constructor(x, y, width, height, color) {
        this.x = x; this.y = y; this.width = width; this.height = height; this.color = color;
    }
    draw() { ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y, this.width, this.height); }
}

class PowerUp extends GameObject {
    constructor(x, y, type) {
        let width = 25, height = 25, color = 'yellow', symbol = "?";
        switch (type) {
            case POWERUP_TYPES.SHIELD: color = 'rgba(0, 191, 255, 0.9)'; symbol = "S"; break;
            case POWERUP_TYPES.RAPID_FIRE: color = 'rgba(50, 205, 50, 0.9)'; symbol = "R"; break;
            case POWERUP_TYPES.HEALTH_PACK: color = 'rgba(255, 105, 180, 0.9)'; symbol = "H"; break;
            case POWERUP_TYPES.DAMAGE_BOOST: color = 'rgba(255, 69, 0, 0.9)'; symbol = "D"; break;
        }
        super(x, y, width, height, color);
        this.type = type; this.symbol = symbol; this.fallSpeed = 1.5; this.lifeSpan = 720; // Dura 12s
    }
    update() {
        this.y += this.fallSpeed; this.lifeSpan--;
        if (this.lifeSpan <= 0 || this.y > canvas.height + this.height) return false;
        this.draw();
        // Desenha o símbolo com uma pequena sombra para destaque
        ctx.fillStyle = 'black'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.symbol, this.x + this.width / 2, this.y + this.height / 2 + 1);
        ctx.fillStyle = 'white';
        ctx.fillText(this.symbol, this.x + this.width / 2, this.y + this.height / 2);
        return true;
    }
}

class Player extends GameObject {
    constructor(x, y, width, height, color, speed, health) {
        super(x, y, width, height, color);
        this.speed = speed; this.health = health; this.maxHealth = 100;
        this.currentShootCooldown = 20; this.currentProjectileSpeed = 7; this.projectileDamage = 10;
        this.shootTimer = 0; // Timer para auto-disparo
        this.isShielded = false; this.shieldTimer = 0;
        this.rapidFireActive = false; this.rapidFireTimer = 0;
        this.damageBoostActive = false; this.damageBoostTimer = 0;
    }
    update(settings) {
        // Movimento
        if ((keys['ArrowLeft'] || keys['KeyA']) && this.x > 0) this.x -= this.speed;
        if ((keys['ArrowRight'] || keys['KeyD']) && this.x < canvas.width - this.width) this.x += this.speed;
        if ((keys['ArrowUp'] || keys['KeyW']) && this.y > canvas.height * 0.55) this.y -= this.speed;
        if ((keys['ArrowDown'] || keys['KeyS']) && this.y < canvas.height - this.height - 5) this.y += this.speed;

        this.updatePowerUpTimers();

        // Ajustar stats com base na onda e power-ups
        this.currentShootCooldown = settings.playerShootCooldown;
        if (this.rapidFireActive) this.currentShootCooldown = Math.max(2, this.currentShootCooldown / 2.2);
        this.currentProjectileSpeed = settings.playerProjectileSpeed;
        this.projectileDamage = this.damageBoostActive ? 22 : 10;

        // Auto-disparo
        if (this.shootTimer > 0) this.shootTimer--;
        if (this.shootTimer === 0) {
            this.shoot(settings);
            this.shootTimer = this.currentShootCooldown;
        }
        this.draw();
        if (this.isShielded) this.drawShield();
    }
    updatePowerUpTimers() {
        if (this.shieldTimer > 0) { this.shieldTimer--; if (this.shieldTimer === 0) this.isShielded = false; }
        if (this.rapidFireTimer > 0) { this.rapidFireTimer--; if (this.rapidFireTimer === 0) this.rapidFireActive = false; }
        if (this.damageBoostTimer > 0) { this.damageBoostTimer--; if (this.damageBoostTimer === 0) this.damageBoostActive = false; }
    }
    drawShield() {
        ctx.strokeStyle = 'rgba(0, 220, 255, 0.7)'; ctx.lineWidth = 4; ctx.beginPath();
        const pulse = Math.sin(Date.now() / 180) * 2.5; // Leve pulsação
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width * 0.75 + pulse, 0, Math.PI * 2);
        ctx.stroke(); ctx.lineWidth = 1;
    }
    activatePowerUp(type) {
        switch (type) {
            case POWERUP_TYPES.SHIELD: this.isShielded = true; this.shieldTimer = POWERUP_DURATION * 1.3; break;
            case POWERUP_TYPES.RAPID_FIRE: this.rapidFireActive = true; this.rapidFireTimer = POWERUP_DURATION; break;
            case POWERUP_TYPES.HEALTH_PACK: this.health = Math.min(this.maxHealth, this.health + 35); updateUI(); break;
            case POWERUP_TYPES.DAMAGE_BOOST: this.damageBoostActive = true; this.damageBoostTimer = POWERUP_DURATION; break;
        }
    }
    shoot(settings) {
        let projWidth = settings.playerProjectileWidth;
        let projHeight = settings.playerProjectileHeight;
        let projColor = this.damageBoostActive ? 'orangered' : settings.playerProjectileColor;

        if (Math.random() < settings.playerEmpoweredShotChance) {
            projWidth *= settings.playerEmpoweredShotSizeMultiplier;
            projHeight *= settings.playerEmpoweredShotSizeMultiplier;
            if (!this.damageBoostActive) projColor = 'gold'; // Cor especial para tiro potente
        }
        playerProjectiles.push(new Projectile(this.x + this.width / 2 - projWidth / 2, this.y, projWidth, projHeight, projColor, this.currentProjectileSpeed, 'player'));
    }
    takeDamage(amount) {
        if (this.isShielded) { this.isShielded = false; this.shieldTimer = 0; return; }
        this.health -= amount; updateUI();
        if (this.health <= 0) { this.health = 0; triggerGameOver(); }
    }
}

class Dragon extends GameObject {
    constructor(x, y, width, height, color, health, attackIntervalBase, moveSpeedBase) {
        super(x, y, width, height, color);
        this.health = health; this.maxHealth = health;
        this.attackIntervalBase = attackIntervalBase; this.attackTimer = this.attackIntervalBase;
        this.moveSpeedBase = moveSpeedBase; this.moveDirection = 1;
        this.moveRange = { minX: 20, maxX: canvas.width - this.width - 20 };
        this.isCircling = false; this.circlingTimer = 0;
        this.circlingCheckInterval = 270;
        this.circlingCheckTimer = Math.random() * this.circlingCheckInterval;
        this.orbitAngle = Math.random() * Math.PI * 2;
        this.orbitRadius = canvas.width * 0.3; // Raio da órbita em relação à largura do mapa
        this.orbitSpeed = 0.012;
        this.targetYDuringCircling = MAP_CENTER_Y; // Y fixo para órbita ao redor do centro
    }

    update(settings, playerRef) { // playerRef ainda é útil para mirar os projéteis
        this.handleCirclingState(settings);

        if (!this.isCircling) {
            // Movimento horizontal padrão
            const currentMoveSpeed = this.moveSpeedBase * settings.projectileSpeedMultiplier;
            this.x += currentMoveSpeed * this.moveDirection;
            if (this.x <= this.moveRange.minX && this.moveDirection === -1) { this.moveDirection = 1; this.x = this.moveRange.minX; }
            else if (this.x >= this.moveRange.maxX && this.moveDirection === 1) { this.moveDirection = -1; this.x = this.moveRange.maxX; }
            if (Math.abs(this.y - 30) > 1) { this.y += (30 - this.y) * 0.08; } // Suavemente volta para Y=30
        } else {
            // Órbita ao redor do centro do mapa (MAP_CENTER_X, MAP_CENTER_Y)
            this.orbitAngle += this.orbitSpeed * settings.projectileSpeedMultiplier;
            const targetX = MAP_CENTER_X + this.orbitRadius * Math.cos(this.orbitAngle) - this.width / 2;
            const targetY = this.targetYDuringCircling + (this.orbitRadius * 0.2) * Math.sin(this.orbitAngle * 2.5) - this.height / 2;

            this.x += (targetX - this.x) * 0.06;
            this.y += (targetY - this.y) * 0.06;
            this.y = Math.max(10, Math.min(this.y, canvas.height * 0.5 - this.height));
        }

        this.attackTimer--;
        if (this.attackTimer <= 0) {
            this.performAttack(settings, playerRef); // playerRef usado para mira
            this.attackTimer = settings.dragonAttackInterval / (this.isCircling ? 1.3 : 1);
        }
        this.draw();
    }

    handleCirclingState(settings) {
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
        const shouldTarget = this.isCircling || Math.random() < 0.4;
        for (let i = 0; i < settings.numProjectiles; i++) {
            setTimeout(() => {
                const projSpawnX = this.x + this.width / 2; const projSpawnY = this.y + this.height;
                this.fireProjectile(projSpawnX, projSpawnY, settings, false, shouldTarget, playerRef);
            }, i * 90);
        }
    }

    tripleAttack(settings, playerRef) {
        const projSpawnX = this.x + this.width / 2; const projSpawnY = this.y + this.height;
        const spreadAngle = 18;
        this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90);
        setTimeout(() => this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90 - spreadAngle), 50);
        setTimeout(() => this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90 + spreadAngle), 100);
    }

    takeDamage(amount) {
        this.health -= amount; score += amount; updateUI();
        if (this.health <= 0) {
            this.health = 0; score += 100 * currentWave;
            const waveDefeatSettings = generateWaveSettings(currentWave);
            if (Math.random() < waveDefeatSettings.powerUpDropChanceOnDefeat) {
                spawnPowerUp(this.x + this.width / 2, this.y + this.height / 2);
            }
            nextWave();
        }
    }
}

class Projectile extends GameObject {
    constructor(x, y, width, height, color, speed, owner, dx = 0, dy = 0) {
        super(x, y, width, height, color);
        this.speed = speed; this.owner = owner; this.dx = dx; this.dy = dy;
        if (this.owner === 'player') { this.dy = -this.speed; this.dx = 0; }
        else { if (dx === 0 && dy === 0) { this.dy = this.speed; this.dx = 0; } }
    }
    update() { this.x += this.dx; this.y += this.dy; this.draw(); }
}

function spawnPowerUp(x, y, specificType = null) {
    let type;
    if (specificType) type = specificType;
    else { const typeKeys = Object.values(POWERUP_TYPES); type = typeKeys[Math.floor(Math.random() * typeKeys.length)]; }
    powerUps.push(new PowerUp(x, y, type));
}
function handleRandomPowerUpSpawns(settings) {
    randomPowerUpSpawnTimer--;
    if (randomPowerUpSpawnTimer <= 0) {
        randomPowerUpSpawnTimer = RANDOM_POWERUP_SPAWN_INTERVAL;
        if (Math.random() < settings.randomPowerUpSpawnChancePerSecond) {
            const spawnX = Math.random() * (canvas.width - 60) + 30; // Evita spawn muito nas bordas
            spawnPowerUp(spawnX, -30); // Começa um pouco acima da tela
        }
    }
}

function initGame() {
    gameOver = false; waveTransition = false; score = 0; currentWave = 1;
    playerProjectiles = []; dragonProjectiles = []; powerUps = []; keys = {};
    randomPowerUpSpawnTimer = Math.floor(Math.random() * RANDOM_POWERUP_SPAWN_INTERVAL); // Início aleatório do timer de spawn
    gameOverScreen.style.display = 'none'; victoryScreen.style.display = 'none';
    const initialSettings = generateWaveSettings(currentWave);
    player = new Player(canvas.width / 2 - 25, canvas.height - 70, 50, 30, 'lime', 7, 100);
    player.currentShootCooldown = initialSettings.playerShootCooldown;
    player.currentProjectileSpeed = initialSettings.playerProjectileSpeed;
    player.maxHealth = 100; player.health = player.maxHealth; player.shootTimer = 0;
    // Resetar estados de power-up do jogador
    player.isShielded = false; player.shieldTimer = 0;
    player.rapidFireActive = false; player.rapidFireTimer = 0;
    player.damageBoostActive = false; player.damageBoostTimer = 0;
    setupWave(currentWave); updateUI(); gameLoop();
}

function setupWave(waveNum) {
    const settings = generateWaveSettings(waveNum);
    dragon = new Dragon(canvas.width / 2 - 50, 30, 100, 80, 'purple', settings.dragonHealth, settings.dragonAttackInterval, settings.dragonMoveSpeedBase);
    dragon.attackTimer = settings.dragonAttackInterval;
    if (waveNum > 1) { player.health = Math.min(player.maxHealth, player.health + Math.floor(player.maxHealth * 0.22)); updateUI(); } // Recupera 22% da vida
    playerProjectiles = []; dragonProjectiles = [];
    updateUI();
}

function nextWave() {
    currentWave++; waveTransition = true;
    victoryScreen.innerHTML = `<h2>Onda ${currentWave - 1} Concluída!</h2><p>Preparando Onda ${currentWave}...</p>`;
    victoryScreen.style.display = 'block';
    setTimeout(() => {
        victoryScreen.style.display = 'none'; setupWave(currentWave); waveTransition = false; if (!gameOver) gameLoop();
    }, 2200); // Transição entre ondas um pouco mais rápida
}

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
        if (dragon && p.x < dragon.x + dragon.width && p.x + p.width > dragon.x && p.y < dragon.y + dragon.height && p.y + p.height > dragon.y) {
            dragon.takeDamage(player.projectileDamage); playerProjectiles.splice(i, 1);
        }
    }
    // Projéteis do Dragão vs Jogador
    for (let i = dragonProjectiles.length - 1; i >= 0; i--) {
        const p = dragonProjectiles[i];
        if (player.x < p.x + p.width && player.x + player.width > p.x && player.y < p.y + p.height && player.y + player.height > p.y) {
            player.takeDamage(18); dragonProjectiles.splice(i, 1); // Dano do projétil do dragão
        }
    }
    // Jogador vs Power-ups
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const pu = powerUps[i];
        if (player.x < pu.x + pu.width && player.x + player.width > pu.x && player.y < pu.y + pu.height && player.y + player.height > pu.y) {
            player.activatePowerUp(pu.type); powerUps.splice(i, 1);
        }
    }
}

function triggerGameOver() {
    gameOver = true;
    // Cria dinamicamente o conteúdo da tela de game over
    gameOverScreen.innerHTML = `
        <h2>Fim de Jogo!</h2>
        <p>Você sobreviveu até a Onda ${currentWave}.</p>
        <p>Sua pontuação: <span id="finalScoreOver">${score}</span></p>
        <button id="restartButtonOver">Jogar Novamente</button>
    `;
    document.getElementById('finalScoreOver').textContent = score; // Garante que o score seja atualizado
    gameOverScreen.style.display = 'block';
    document.getElementById('restartButtonOver').addEventListener('click', initGame); // Adiciona listener ao novo botão
}

function gameLoop() {
    if (gameOver || waveTransition) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const currentWaveSettings = generateWaveSettings(currentWave);
    player.update(currentWaveSettings);
    if (dragon) dragon.update(currentWaveSettings, player); // Passa player para mira dos projéteis do dragão
    powerUps = powerUps.filter(p => p.update()); // Atualiza e remove power-ups se necessário
    handleRandomPowerUpSpawns(currentWaveSettings); // Tenta spawnar power-ups aleatórios
    // Filtra e atualiza projéteis
    playerProjectiles = playerProjectiles.filter(p => p.y + p.height > 0 && p.y < canvas.height && p.x + p.width > 0 && p.x < canvas.width);
    playerProjectiles.forEach(p => p.update());
    dragonProjectiles = dragonProjectiles.filter(p => p.y + p.height > 0 && p.y < canvas.height && p.x + p.width > 0 && p.x < canvas.width);
    dragonProjectiles.forEach(p => p.update());
    checkCollisions(); updateUI(); requestAnimationFrame(gameLoop);
}

// Event Listeners
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    // Prevenir scroll da página com Espaço, Setas e WASD se o jogo estiver ativo
    if (!gameOver && (e.code === 'Space' || e.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code))) {
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// Iniciar o jogo
initGame();
