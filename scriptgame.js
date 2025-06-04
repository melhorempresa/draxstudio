const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elementos da UI
const playerHealthUI = document.getElementById('playerHealth');
const dragonHealthUI = document.getElementById('dragonHealth');
const waveUI = document.getElementById('wave');
const scoreUI = document.getElementById('score');
const gameOverScreen = document.getElementById('gameOverScreen');
const victoryScreen = document.getElementById('victoryScreen');
const finalScoreUI = document.getElementById('finalScore');
const restartButton = document.getElementById('restartButton');

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

// Parâmetros de dificuldade por onda
const waveSettings = {
    1: { dragonHealth: 100, dragonAttackInterval: 100, projectileSpeedMultiplier: 1, numProjectiles: 1 }, // ticks para ataque (60 ticks = 1s)
    2: { dragonHealth: 120, dragonAttackInterval: 85, projectileSpeedMultiplier: 1.1, numProjectiles: 1 },
    3: { dragonHealth: 150, dragonAttackInterval: 70, projectileSpeedMultiplier: 1.2, numProjectiles: 2 },
    4: { dragonHealth: 180, dragonAttackInterval: 60, projectileSpeedMultiplier: 1.3, numProjectiles: 2, laserChance: 0.3 },
    5: { dragonHealth: 220, dragonAttackInterval: 50, projectileSpeedMultiplier: 1.4, numProjectiles: 3, laserChance: 0.5 }
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
        this.shootCooldown = 20; // Ticks entre disparos
        this.shootTimer = 0;
    }

    update() {
        if (this.shootTimer > 0) this.shootTimer--;

        if (keys['ArrowLeft'] && this.x > 0) {
            this.x -= this.speed;
        }
        if (keys['ArrowRight'] && this.x < canvas.width - this.width) {
            this.x += this.speed;
        }
        if (keys['Space'] && this.shootTimer === 0) {
            this.shoot();
            this.shootTimer = this.shootCooldown;
        }
        this.draw();
    }

    shoot() {
        const projectile = new Projectile(this.x + this.width / 2 - 2.5, this.y, 5, 10, 'cyan', 7, 'player');
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
    constructor(x, y, width, height, color, health, attackIntervalBase) {
        super(x, y, width, height, color);
        this.health = health;
        this.maxHealth = health;
        this.attackIntervalBase = attackIntervalBase; // será ajustado pela onda
        this.attackTimer = this.attackIntervalBase;
        this.targetX = canvas.width / 2 - this.width / 2; // Posição X alvo
        this.moveSpeed = 0.5; // Velocidade de movimento lateral suave
    }

    update(settings) {
        // Movimento suave para a posição X alvo (centro)
        if (Math.abs(this.x - this.targetX) > this.moveSpeed) {
            if (this.x < this.targetX) this.x += this.moveSpeed;
            else this.x -= this.moveSpeed;
        }


        this.attackTimer--;
        if (this.attackTimer <= 0) {
            this.attack(settings);
            this.attackTimer = settings.dragonAttackInterval;
        }
        this.draw();
    }

    attack(settings) {
        for (let i = 0; i < settings.numProjectiles; i++) {
            setTimeout(() => { // Pequeno atraso entre projéteis se houver múltiplos
                let projectileType = 'fire';
                let projectileColor = 'orange';
                let projectileWidth = 10;
                let projectileHeight = 10;
                let projectileSpeed = 3 * settings.projectileSpeedMultiplier;

                if (settings.laserChance && Math.random() < settings.laserChance) {
                    projectileType = 'laser';
                    projectileColor = 'red';
                    projectileWidth = 5;
                    projectileHeight = 20;
                    projectileSpeed = 5 * settings.projectileSpeedMultiplier;
                }

                const projectile = new Projectile(
                    this.x + this.width / 2 - projectileWidth / 2,
                    this.y + this.height,
                    projectileWidth, projectileHeight,
                    projectileColor,
                    projectileSpeed,
                    'dragon'
                );
                dragonProjectiles.push(projectile);
            }, i * 150); // Atraso de 150ms entre projéteis em uma rajada
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        score += 10; // Ganha pontos por acertar o dragão
        updateUI();
        if (this.health <= 0) {
            this.health = 0;
            score += 100 * currentWave; // Bônus por derrotar o dragão
            nextWave();
        }
    }
}

class Projectile extends GameObject {
    constructor(x, y, width, height, color, speed, owner) {
        super(x, y, width, height, color);
        this.speed = speed;
        this.owner = owner; // 'player' ou 'dragon'
    }

    update() {
        if (this.owner === 'player') {
            this.y -= this.speed;
        } else {
            this.y += this.speed;
        }
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

    player = new Player(canvas.width / 2 - 25, canvas.height - 60, 50, 30, 'lime', 7, 100);
    setupWave(currentWave);
    updateUI();
    gameLoop();
}

function setupWave(waveNum) {
    const settings = waveSettings[waveNum] || waveSettings[MAX_WAVES]; // Usa a última configuração se passar do máximo

    dragon = new Dragon(
        canvas.width / 2 - 50, 30, 100, 80, 'purple',
        settings.dragonHealth,
        settings.dragonAttackInterval
    );
    dragon.attackTimer = settings.dragonAttackInterval; // Reseta o timer de ataque do dragão para a nova onda
    
    player.health = player.maxHealth; // Restaura a vida do jogador no início de cada onda (opcional)
    
    playerProjectiles = []; // Limpa projéteis da tela
    dragonProjectiles = [];

    updateUI();
}

function nextWave() {
    if (currentWave >= MAX_WAVES) {
        triggerGameWin(); // Uma função para caso o jogador vença todas as ondas
        return;
    }
    currentWave++;
    waveTransition = true;
    victoryScreen.style.display = 'block';

    setTimeout(() => {
        victoryScreen.style.display = 'none';
        setupWave(currentWave);
        waveTransition = false;
        if (!gameOver) gameLoop(); // Resume o loop se não for game over
    }, 3000); // 3 segundos de transição
}

function triggerGameWin() {
    gameOver = true;
    gameOverScreen.innerHTML = `
        <h2>VOCÊ VENCEU!</h2>
        <p>Todos os dragões foram derrotados!</p>
        <p>Pontuação Final: <span id="finalScore">${score}</span></p>
        <button id="restartButtonWin">Jogar Novamente</button>
    `;
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
        if (dragon &&
            p.x < dragon.x + dragon.width &&
            p.x + p.width > dragon.x &&
            p.y < dragon.y + dragon.height &&
            p.y + p.height > dragon.y
        ) {
            dragon.takeDamage(10); // Dano do projétil do jogador
            playerProjectiles.splice(i, 1); // Remove projétil
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
            player.takeDamage(10); // Dano do projétil do dragão
            dragonProjectiles.splice(i, 1); // Remove projétil
        }
    }
}

function triggerGameOver() {
    gameOver = true;
    finalScoreUI.textContent = score;
    gameOverScreen.style.display = 'block';
}

// Game Loop
function gameLoop() {
    if (gameOver || waveTransition) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentWaveSettings = waveSettings[currentWave] || waveSettings[MAX_WAVES];

    player.update();
    if (dragon) dragon.update(currentWaveSettings);

    // Atualizar e remover projéteis fora da tela
    playerProjectiles = playerProjectiles.filter(p => p.y > 0);
    playerProjectiles.forEach(p => p.update());

    dragonProjectiles = dragonProjectiles.filter(p => p.y < canvas.height);
    dragonProjectiles.forEach(p => p.update());

    checkCollisions();
    updateUI(); // Atualiza a UI a cada frame

    requestAnimationFrame(gameLoop);
}

// Event Listeners
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

restartButton.addEventListener('click', initGame);

// Iniciar o jogo
initGame();
