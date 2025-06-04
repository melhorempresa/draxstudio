const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elementos da UI
const playerHealthUI = document.getElementById('playerHealth');
const dragonHealthUI = document.getElementById('dragonHealth');
const waveUI = document.getElementById('wave');
const scoreUI = document.getElementById('score');
const gameOverScreen = document.getElementById('gameOverScreen');
const victoryScreen = document.getElementById('victoryScreen');
// const finalScoreUI = document.getElementById('finalScore'); // Será recriado
// const restartButton = document.getElementById('restartButton'); // Será recriado

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

// Parâmetros de dificuldade por onda (COPIE A SEÇÃO waveSettings ATUALIZADA ACIMA AQUI)
const waveSettings = {
    1: { dragonHealth: 100, dragonAttackInterval: 100, dragonMoveSpeedBase: 0.7, projectileSpeedMultiplier: 1, numProjectiles: 1, laserChance: 0.05, tripleAttackChance: 0.05, circlingChance: 0.1, circlingDuration: 240, playerProjectileSpeed: 7, playerShootCooldown: 20 },
    2: { dragonHealth: 120, dragonAttackInterval: 85, dragonMoveSpeedBase: 0.8, projectileSpeedMultiplier: 1.1, numProjectiles: 1, laserChance: 0.1, tripleAttackChance: 0.1, circlingChance: 0.15, circlingDuration: 270, playerProjectileSpeed: 7.5, playerShootCooldown: 18 },
    3: { dragonHealth: 150, dragonAttackInterval: 70, dragonMoveSpeedBase: 0.9, projectileSpeedMultiplier: 1.2, numProjectiles: 2, laserChance: 0.15, tripleAttackChance: 0.2, circlingChance: 0.2, circlingDuration: 300, playerProjectileSpeed: 8, playerShootCooldown: 16 },
    4: { dragonHealth: 180, dragonAttackInterval: 60, dragonMoveSpeedBase: 1.0, projectileSpeedMultiplier: 1.3, numProjectiles: 2, laserChance: 0.25, tripleAttackChance: 0.3, circlingChance: 0.25, circlingDuration: 330, playerProjectileSpeed: 8.5, playerShootCooldown: 14 },
    5: { dragonHealth: 220, dragonAttackInterval: 50, dragonMoveSpeedBase: 1.1, projectileSpeedMultiplier: 1.4, numProjectiles: 3, laserChance: 0.35, tripleAttackChance: 0.4, circlingChance: 0.3, circlingDuration: 360, playerProjectileSpeed: 9, playerShootCooldown: 12 }
};
const MAX_WAVES = Object.keys(waveSettings).length;


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

class Player extends GameObject {
    constructor(x, y, width, height, color, speed, health) {
        super(x, y, width, height, color);
        this.speed = speed;
        this.health = health;
        this.maxHealth = health;
        this.currentShootCooldown = 20; // Será atualizado pela onda
        this.currentProjectileSpeed = 7; // Será atualizado pela onda
        this.shootTimer = 0;
    }

    update(settings) { // settings da onda atual
        if (this.shootTimer > 0) this.shootTimer--;

        this.currentShootCooldown = settings.playerShootCooldown;
        this.currentProjectileSpeed = settings.playerProjectileSpeed;

        // Movimento horizontal (Setas ou AD)
        if ((keys['ArrowLeft'] || keys['KeyA']) && this.x > 0) {
            this.x -= this.speed;
        }
        if ((keys['ArrowRight'] || keys['KeyD']) && this.x < canvas.width - this.width) {
            this.x += this.speed;
        }
        // Movimento Vertical (Setas ou WS) - limitado à metade inferior da tela
        if ((keys['ArrowUp'] || keys['KeyW']) && this.y > canvas.height * 0.5) {
            this.y -= this.speed;
        }
        if ((keys['ArrowDown'] || keys['KeyS']) && this.y < canvas.height - this.height - 10) {
            this.y += this.speed;
        }

        if (keys['Space'] && this.shootTimer === 0) {
            this.shoot();
            this.shootTimer = this.currentShootCooldown;
        }
        this.draw();
    }

    shoot() {
        const projectile = new Projectile(
            this.x + this.width / 2 - 2.5, this.y,
            5, 10, 'cyan', this.currentProjectileSpeed, 'player'
        );
        playerProjectiles.push(projectile);
    }

    takeDamage(amount) {
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

        // Para movimento circular
        this.isCircling = false;
        this.circlingTimer = 0;         // Duração do modo circular atual
        this.circlingCheckInterval = 300; // 5 segundos (5 * 60 FPS)
        this.circlingCheckTimer = Math.random() * this.circlingCheckInterval; // Início aleatório para não ser previsível
        this.orbitAngle = 0;
        this.orbitRadius = 180; // Raio da órbita ao redor do jogador
        this.orbitSpeed = 0.015; // Velocidade angular da órbita
        this.targetYDuringCircling = 100; // Posição Y média durante o círculo
    }

    update(settings, playerRef) {
        this.handleCirclingState(settings, playerRef);

        if (!this.isCircling) {
            // Movimento horizontal padrão
            const currentMoveSpeed = this.moveSpeedBase * settings.projectileSpeedMultiplier;
            this.x += currentMoveSpeed * this.moveDirection;
            if (this.x <= this.moveRange.minX && this.moveDirection === -1) {
                this.moveDirection = 1; this.x = this.moveRange.minX;
            } else if (this.x >= this.moveRange.maxX && this.moveDirection === 1) {
                this.moveDirection = -1; this.x = this.moveRange.maxX;
            }
            // Manter na posição Y padrão
            if (this.y !== 30) {
                this.y += (30 - this.y) * 0.1; // Suavemente volta para Y=30
            }

        } else {
            // Movimento Circular em torno do playerRef
            this.orbitAngle += this.orbitSpeed * settings.projectileSpeedMultiplier;
            const targetX = playerRef.x + playerRef.width / 2 + this.orbitRadius * Math.cos(this.orbitAngle) - this.width / 2;
            const targetY = this.targetYDuringCircling + (this.orbitRadius / 2) * Math.sin(this.orbitAngle * 2) - this.height / 2; // Adiciona um leve movimento vertical à órbita

            // Movimento suave para a posição orbital
            this.x += (targetX - this.x) * 0.05;
            this.y += (targetY - this.y) * 0.05;

            // Limitar Y para não sair muito da tela superior
            this.y = Math.max(10, Math.min(this.y, canvas.height * 0.45 - this.height));
        }

        this.attackTimer--;
        if (this.attackTimer <= 0) {
            this.performAttack(settings, playerRef);
            this.attackTimer = settings.dragonAttackInterval / (this.isCircling ? 1.2 : 1); // Ataca um pouco mais rápido ao circular
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
                    // Define o ângulo inicial da órbita para estar "atrás" do jogador e se mover para frente
                    this.orbitAngle = Math.atan2(
                        (playerRef.y + playerRef.height / 2) - (this.y + this.height / 2),
                        (playerRef.x + playerRef.width / 2) - (this.x + this.width / 2)
                    ) + Math.PI; // Começa do lado oposto
                }
            }
        }
    }

    performAttack(settings, playerRef) {
        const roll = Math.random();
        if (roll < settings.tripleAttackChance) {
            this.tripleAttack(settings, playerRef);
        } else {
            this.standardAttack(settings, playerRef);
        }
    }

    // Helper para criar e adicionar projéteis do dragão
    fireProjectile(posX, posY, settings, isLaserOverride = false, targetPlayer = false, playerRef = null, fixedAngleDeg = null) {
        let pColor = 'orange';
        let pWidth = 10;
        let pHeight = 10;
        let pBaseSpeed = 3; // Velocidade base antes do multiplicador da onda
        let dx = 0, dy = 0;

        if (isLaserOverride || Math.random() < settings.laserChance) {
            pColor = 'red';
            pWidth = 5;
            pHeight = 20;
            pBaseSpeed = 5;
        }
        const actualSpeed = pBaseSpeed * settings.projectileSpeedMultiplier;

        if (targetPlayer && playerRef) {
            const angleToPlayer = Math.atan2(
                (playerRef.y + playerRef.height / 2) - (posY + pHeight / 2),
                (playerRef.x + playerRef.width / 2) - (posX + pWidth / 2)
            );
            dx = Math.cos(angleToPlayer) * actualSpeed;
            dy = Math.sin(angleToPlayer) * actualSpeed;
        } else if (fixedAngleDeg !== null) {
            const angleRad = fixedAngleDeg * (Math.PI / 180);
            dx = Math.cos(angleRad) * actualSpeed;
            dy = Math.sin(angleRad) * actualSpeed;
        }
         else { // Padrão: atira para baixo
            dy = actualSpeed;
        }

        const projectile = new Projectile(
            posX - pWidth / 2, posY,
            pWidth, pHeight, pColor,
            actualSpeed, 'dragon', dx, dy
        );
        dragonProjectiles.push(projectile);
    }

    standardAttack(settings, playerRef) {
        const shouldTarget = this.isCircling || Math.random() < 0.3; // Mira mais se estiver circulando ou aleatoriamente
        for (let i = 0; i < settings.numProjectiles; i++) {
            setTimeout(() => {
                const projSpawnX = this.x + this.width / 2;
                const projSpawnY = this.y + this.height;
                this.fireProjectile(projSpawnX, projSpawnY, settings, false, shouldTarget, playerRef);
            }, i * 120); // Pequeno atraso entre projéteis em uma rajada
        }
    }

    tripleAttack(settings, playerRef) {
        const projSpawnX = this.x + this.width / 2;
        const projSpawnY = this.y + this.height;
        const spreadAngle = 15; // Graus de abertura para os projéteis laterais

        // Projétil Central (mira se estiver circulando, senão reto)
        this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90);

        // Projétil Esquerdo
        this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90 - spreadAngle);

        // Projétil Direito
        this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90 + spreadAngle);
    }


    takeDamage(amount) {
        this.health -= amount;
        score += 10;
        updateUI();
        if (this.health <= 0) {
            this.health = 0;
            score += 100 * currentWave;
            nextWave();
        }
    }
}

class Projectile extends GameObject {
    constructor(x, y, width, height, color, speed, owner, dx = 0, dy = 0) {
        super(x, y, width, height, color);
        this.speed = speed; // Magnitude, pode não ser usada se dx/dy fornecidos
        this.owner = owner;
        this.dx = dx;
        this.dy = dy;

        if (this.owner === 'player') { // Projéteis do jogador sempre para cima
            this.dy = -this.speed; // speed aqui é currentProjectileSpeed do player
            this.dx = 0;
        } else { // Projéteis do dragão
            if (dx === 0 && dy === 0) { // Se não houver direção específica, vai para baixo
                this.dy = this.speed; // speed aqui é a actualSpeed calculada no fireProjectile
                this.dx = 0;
            }
            // Se dx e dy foram fornecidos, eles já têm a magnitude da velocidade embutida
        }
    }

    update() {
        this.x += this.dx;
        this.y += this.dy;
        this.draw();
    }
}

// Funções do Jogo
function initGame() {
    gameOver = false;
    waveTransition = false;
    score = 0;
    currentWave = 1;
    playerProjectiles = [];
    dragonProjectiles = [];
    keys = {};

    gameOverScreen.style.display = 'none';
    victoryScreen.style.display = 'none';

    const initialSettings = waveSettings[currentWave];
    player = new Player(canvas.width / 2 - 25, canvas.height - 70, 50, 30, 'lime', 7, 100);
    player.currentShootCooldown = initialSettings.playerShootCooldown; // Seta inicial
    player.currentProjectileSpeed = initialSettings.playerProjectileSpeed; // Seta inicial

    setupWave(currentWave);
    updateUI();
    gameLoop();
}

function setupWave(waveNum) {
    const settings = waveSettings[waveNum] || waveSettings[MAX_WAVES];

    dragon = new Dragon(
        canvas.width / 2 - 50, 30, 100, 80, 'purple',
        settings.dragonHealth,
        settings.dragonAttackInterval,
        settings.dragonMoveSpeedBase
    );
    dragon.attackTimer = settings.dragonAttackInterval;
    // O circlingCheckTimer é resetado aleatoriamente no construtor do dragão

    // Atualiza as capacidades do jogador para a nova onda
    player.currentShootCooldown = settings.playerShootCooldown;
    player.currentProjectileSpeed = settings.playerProjectileSpeed;
    if (waveNum > 1) player.health = player.maxHealth; // Restaura vida após a primeira onda

    playerProjectiles = [];
    dragonProjectiles = [];
    updateUI();
}

function nextWave() {
    if (currentWave >= MAX_WAVES) {
        triggerGameWin();
        return;
    }
    currentWave++;
    waveTransition = true;
    victoryScreen.innerHTML = `<h2>Você Venceu a Onda ${currentWave-1}!</h2><p>Próxima onda em breve...</p>`;
    victoryScreen.style.display = 'block';

    setTimeout(() => {
        victoryScreen.style.display = 'none';
        setupWave(currentWave);
        waveTransition = false;
        if (!gameOver) gameLoop();
    }, 3000);
}

function triggerGameWin() {
    gameOver = true;
    gameOverScreen.innerHTML = `
        <h2>VOCÊ VENCEU!</h2>
        <p>Todos os dragões foram derrotados!</p>
        <p>Pontuação Final: <span id="finalScoreWin">${score}</span></p>
        <button id="restartButtonWin">Jogar Novamente</button>
    `;
    document.getElementById('finalScoreWin').textContent = score;
    gameOverScreen.style.display = 'block';
    document.getElementById('restartButtonWin').addEventListener('click', initGame);
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
        if (dragon && !dragon.isSpawning && // Adicionar um estado de spawn se quiser invulnerabilidade
            p.x < dragon.x + dragon.width &&
            p.x + p.width > dragon.x &&
            p.y < dragon.y + dragon.height &&
            p.y + p.height > dragon.y
        ) {
            dragon.takeDamage(10);
            playerProjectiles.splice(i, 1);
        }
    }

    // Projéteis do Dragão vs Jogador
    for (let i = dragonProjectiles.length - 1; i >= 0; i--) {
        const p = dragonProjectiles[i];
        if (
            p.x < player.x + player.width &&
            p.x + p.width > player.x &&
            p.y < player.y + player.height &&
            p.y + p.height > player.y
        ) {
            player.takeDamage(15); // Projéteis do dragão podem dar um pouco mais de dano
            dragonProjectiles.splice(i, 1);
        }
    }
}

function triggerGameOver() {
    gameOver = true;
    gameOverScreen.innerHTML = `
        <h2>Fim de Jogo!</h2>
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

    const currentWaveSettings = waveSettings[currentWave] || waveSettings[MAX_WAVES];

    player.update(currentWaveSettings);
    if (dragon) dragon.update(currentWaveSettings, player);

    // Atualizar e remover projéteis fora da tela
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
    // Prevenir scroll da página com Espaço e Setas se o jogo estiver ativo
    if (!gameOver && (e.code === 'Space' || e.code.startsWith('Arrow'))) {
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// Iniciar o jogo
initGame();
