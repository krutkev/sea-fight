const socket = new WebSocket("ws://localhost:8000/ws");

const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");

const btnCreate = document.getElementById("btn-create");
const btnJoin = document.getElementById("btn-join");
const btnMainMenu = document.getElementById("btn-main-menu");
const roomInput = document.getElementById("room-input");

const myGrid = document.getElementById("my-grid");
const enemyGrid = document.getElementById("enemy-grid");
const battleArea = document.getElementById("battle-area");
const menuArea = document.querySelector(".menu-container");

let currentRoomCode = null;
let myTurn = false;

// Listen for connection open
socket.addEventListener("open", (event) => {
    statusDot.classList.add("connected");
    statusText.innerText = "Connected to Server";
    console.log("🟢 WebSocket Connected");
});

// Listen for connection close
socket.addEventListener("close", (event) => {
    statusDot.classList.remove("connected");
    statusText.innerText = "Disconnected from Server";
    console.log("🔴 WebSocket Disconnected");
});

// Handle button clicks
btnCreate.addEventListener("click", () => {
    let payload = {"action": "create_room"};
    let responce = socket.send(JSON.stringify(payload));
    console.log("Creating room...");
});

btnJoin.addEventListener("click", () => {
    const roomCode = roomInput.value.trim();
    if (!roomCode) return alert("Please enter a room code!");
    let payload = {"action": "join_room", "room_code": roomCode}
    socket.send(JSON.stringify(payload));
    console.log(`Joining room: ${roomCode}`);
});

btnMainMenu.addEventListener("click", () => {
    const confirmLeave = confirm("Are you sure you want to abandon the match? This will disconnect you from the room.");
    
    if (confirmLeave) {
        window.location.reload();
    }
});

// Receiving Data

socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    console.log("📥 Server says:", data);

    if (data.type === "room_created") {
        alert(`Room Created! Share this code: ${data.room_code}`);
        currentRoomCode = data.room_code;
        
    } else if (data.type === "room_joined") {
        console.log(`Successfully joined room: ${data.room_code}`);
        currentRoomCode = data.room_code;
        
    } else if (data.type === "error") {
        alert(data.text);
        
    } else if (data.type === "game_start") {
        alert("Match found! The game is starting!");
        // Hide the main menu
        menuArea.style.display = 'none';
        
        // Show the 10x10 grids
        battleArea.style.display = 'flex';
    } else if (data.type === "all_ready") {
        document.getElementById("placement-controls").style.display = "none";
        
        myTurn = data.my_turn;
        updateTurnDisplay();
        
        alert(myTurn ? "All fleets deployed! You fire first." : "All fleets deployed! Enemy fires first.");
        
    } else if (data.type === "fire_result") {
        const targetGrid = data.shooter === "me" ? enemyGrid : myGrid;
        const cellElement = targetGrid.querySelector(`.cell[data-x="${data.x}"][data-y="${data.y}"]`);
        
        if (data.status === "hit") {
            cellElement.style.backgroundColor = "#ef4444"; 
            cellElement.innerText = "💥";
        } else {
            cellElement.style.backgroundColor = "#334155"; 
            cellElement.innerText = "✖";
        }
        
        myTurn = data.my_turn;
        updateTurnDisplay();
    } else if (data.type === "game_over") {
        const isWinner = data.winner === "me";
        
        myTurn = false;
        
        if (isWinner) {
            statusText.innerText = "🏆 VICTORY! Enemy fleet annihilated!";
            statusText.style.color = "#fbbf24";
            
            setTimeout(() => alert("Congratulations Captain, you won the match!"), 100);
        } else {
            statusText.innerText = "💀 DEFEAT! Your fleet sleeps with the fishes...";
            statusText.style.color = "#ef4444";
            
            setTimeout(() => alert("All ships lost. You have been defeated."), 100);
        }
    }
});

function createBoard(gridElement, isEnemy) {
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            const cell = document.createElement("div");
            cell.classList.add("cell");
            cell.dataset.x = x;
            cell.dataset.y = y;

            if (isEnemy) {
                cell.addEventListener("click", () => handleFire(x, y));
            } else {
                cell.addEventListener("click", () => handleMyBoardClick(x, y));
                
                cell.addEventListener("mouseover", () => handlePreview(x, y, true));
                cell.addEventListener("mouseout", () => handlePreview(x, y, false));
            }

            gridElement.appendChild(cell);
        }
    }
}

function updateTurnDisplay() {
    if (myTurn) {
        statusText.innerText = "🟢 YOUR TURN - Select a target!";
        statusText.style.color = "#22c55e"; // Green text
    } else {
        statusText.innerText = "🔴 ENEMY TURN - Brace for impact...";
        statusText.style.color = "#ef4444"; // Red text
    }
}

function handleFire(x, y) {
    if (!currentRoomCode) return;
    
    if (!myTurn) {
        alert("Hold your fire! It's not your turn.");
        return;
    }

    const cellElement = enemyGrid.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
    if (cellElement.innerText === "💥" || cellElement.innerText === "✖") {
        return;
    }
    
    let payload = {
        "action": "fire",
        "room_code": currentRoomCode,
        "x": x,
        "y": y
    };
    socket.send(JSON.stringify(payload));
}

createBoard(myGrid, false);
createBoard(enemyGrid, true);


// SHIP PLACEMENT STATE ==================================================

// The standard 5 ships
const fleet = [
    { name: "Carrier", size: 4 },
    { name: "Battleship 1", size: 3 },
    { name: "Battleship 2", size: 3 },
    { name: "Cruiser 1", size: 2 },
    { name: "Cruiser 2", size: 2 },
    { name: "Cruiser 3", size: 2 },
    { name: "Destroyer 1", size: 1 },
    { name: "Destroyer 2", size: 1 },
    { name: "Destroyer 3", size: 1 },
    { name: "Destroyer 4", size: 1 }
];

let currentShipIndex = 0;
let isHorizontal = true;

// Create a 10x10 array filled with 0s (0 = water, 1 = ship)
let myBoardData = Array(10).fill(null).map(() => Array(10).fill(0));

const btnRotate = document.getElementById("btn-rotate");
const shipNameDisplay = document.getElementById("ship-name-display");
const placementControls = document.getElementById("placement-controls");

btnRotate.addEventListener("click", () => {
    isHorizontal = !isHorizontal;
    btnRotate.innerText = isHorizontal ? "🔄 Rotate (Current: Horizontal)" : "🔄 Rotate (Current: Vertical)";
});

function canPlaceShip(startX, startY, size) {
    for (let i = 0; i < size; i++) {
        let x = isHorizontal ? startX + i : startX;
        let y = isHorizontal ? startY : startY + i;

        if (x >= 10 || y >= 10) return false;
        
        if (myBoardData[y][x] === 1) return false;
    }
    return true;
}

// place the ship
function handleMyBoardClick(x, y) {
    if (currentShipIndex >= fleet.length) return;

    const ship = fleet[currentShipIndex];

    if (canPlaceShip(x, y, ship.size)) {
        for (let i = 0; i < ship.size; i++) {
            let targetX = isHorizontal ? x + i : x;
            let targetY = isHorizontal ? y : y + i;

            myBoardData[targetY][targetX] = 1;
            
            // Find the specific HTML cell and color it
            const cellElement = document.querySelector(`#my-grid .cell[data-x="${targetX}"][data-y="${targetY}"]`);
            cellElement.classList.add("ship");
        }

        currentShipIndex++;

        if (currentShipIndex < fleet.length) {
            shipNameDisplay.innerText = `${fleet[currentShipIndex].name} (${fleet[currentShipIndex].size})`;
        } else {
            shipNameDisplay.innerText = "Fleet Deployed! Waiting for opponent...";
            btnRotate.style.display = "none";
            
            let payload = {
                "action": "send_board",
                "board_data": myBoardData,
                "room_code": currentRoomCode,
            };
            socket.send(JSON.stringify(payload));
            console.log("Final Board Data:", myBoardData);
        }
    } else {
        console.log("Captain, we cannot place the ship there!");
    }
}


function handlePreview(startX, startY, isHovering) {
    // clear all previous previews first
    document.querySelectorAll('#my-grid .cell').forEach(cell => {
        cell.classList.remove('preview-valid', 'preview-invalid');
    });

    if (currentShipIndex >= fleet.length || !isHovering) return;

    const ship = fleet[currentShipIndex];
    const isValid = canPlaceShip(startX, startY, ship.size);

    // Draw the new preview
    for (let i = 0; i < ship.size; i++) {
        let x = isHorizontal ? startX + i : startX;
        let y = isHorizontal ? startY : startY + i;

        if (x >= 10 || y >= 10) continue;

        const cellElement = document.querySelector(`#my-grid .cell[data-x="${x}"][data-y="${y}"]`);
        if (cellElement) {
            cellElement.classList.add(isValid ? 'preview-valid' : 'preview-invalid');
        }
    }
}