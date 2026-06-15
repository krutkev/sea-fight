// const socket = new WebSocket("wss://sea-fight-g0yi.onrender.com/ws");
const socket = new WebSocket("ws://localhost:8000/ws");

const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const btnCreate = document.getElementById("btn-create");
const btnJoin = document.getElementById("btn-join");
const btnMainMenu = document.getElementById("btn-main-menu");
const roomInput = document.getElementById("room-input");
const battleArea = document.getElementById("battle-area");
const menuArea = document.querySelector(".menu-container");

let currentRoomCode = null;
let myTurn = false;
let myShots = 0, myHits = 0, enemyShots = 0, enemyHits = 0;

let myPivot = null;
let enemyPivot = null;
let myBoardRecords = [];
let enemyBoardRecords = [];
let myBoardData = Array(10).fill(null).map(() => Array(10).fill(0));

// SHIP PLACEMENT STATE
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

const btnRotate = document.getElementById("btn-rotate");
const shipNameDisplay = document.getElementById("ship-name-display");

btnRotate.addEventListener("click", () => {
    isHorizontal = !isHorizontal;
    btnRotate.innerText = isHorizontal ? "🔄 Rotate (Current: Horizontal)" : "🔄 Rotate (Current: Vertical)";
});

// WebSocket

socket.addEventListener("open", () => {
    statusDot.classList.add("connected");
    statusText.innerText = "Connected to Server";
    console.log("🟢 WebSocket Connected");
});

socket.addEventListener("close", () => {
    statusDot.classList.remove("connected");
    statusText.innerText = "Disconnected from Server";
    console.log("🔴 WebSocket Disconnected");
});

btnCreate.addEventListener("click", () => {
    socket.send(JSON.stringify({ action: "create_room" }));
});

btnJoin.addEventListener("click", () => {
    const roomCode = roomInput.value.trim();
    if (!roomCode) return alert("Please enter a room code!");
    socket.send(JSON.stringify({ action: "join_room", room_code: roomCode }));
});

btnMainMenu.addEventListener("click", () => {
    if (confirm("Are you sure you want to abandon the match? This will disconnect you from the room.")) {
        window.location.reload();
    }
});

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
        menuArea.style.display = "none";
        battleArea.style.display = "flex";
        requestAnimationFrame(() => initBoards());

    } else if (data.type === "all_ready") {
        document.getElementById("placement-controls").style.display = "none";
        myTurn = data.my_turn;
        alert(myTurn ? "All fleets deployed! You fire first." : "All fleets deployed! Enemy fires first.");

    } else if (data.type === "fire_result") {
        const isMyShot = data.shooter === "me";
        const records = isMyShot ? enemyBoardRecords : myBoardRecords;
        const pivot = isMyShot ? enemyPivot : myPivot;
        const newState = data.status === "hit" ? 2 : -1;

        setRecordState(records, data.y, data.x, newState);
        pivot.updateData({ data: records });

        if (isMyShot) {
            myShots++;
            if (data.status === "hit") myHits++;
        } else {
            enemyShots++;
            if (data.status === "hit") enemyHits++;
        }

        myTurn = data.my_turn;

    } else if (data.type === "game_over") {
        myTurn = false;
        const isWinner = data.winner === "me";

        if (isWinner) {
            statusText.innerText = "🏆 VICTORY! Enemy fleet annihilated!";
            statusText.style.color = "#fbbf24";
            setTimeout(() => { alert("Congratulations Captain, you won the match!"); showPostGameStats(); }, 100);
        } else {
            statusText.innerText = "💀 DEFEAT! Your fleet sleeps with the fishes...";
            statusText.style.color = "#ef4444";
            setTimeout(() => { alert("All ships lost. You have been defeated."); showPostGameStats(); }, 100);
        }
    }
});

// Board data helpers

// State values: 0=water, 1=ship, 2=hit, -1=miss
function initBoardData() {
    const records = [];
    for (let r = 0; r < 10; r++)
        for (let c = 0; c < 10; c++)
            records.push({ Row: String(r), Col: String(c), State: 0 });
    return records;
}

function getRecord(records, row, col) {
    return records.find(r => r.Row === String(row) && r.Col === String(col));
}

function setRecordState(records, row, col, state) {
    const rec = getRecord(records, row, col);
    if (rec) rec.State = state;
}

// WDR customizeCell

const STATE_COLORS = {
    0:  "#1e3a5f",
    1:  "#2563eb",
    2:  "#ef4444",
    "-1": "#334155"
};

function customizeCell(cellBuilder, cellData) {
    if (cellData.type !== "value") return;
    try {
        const state = cellData.value ?? 0;
        cellBuilder.addClass("wdr-game-cell");
        cellBuilder.addClass(state === -1 ? "wdr-miss" : `wdr-s${state}`);
        const emoji = state === 2 ? "💥" : state === -1 ? "✖" : "​";
        cellBuilder.text(emoji);
    } catch (e) { console.error("customizeCell error:", e, cellData); }
}

// Board init

function buildReport(records) {
    return {
        dataSource: {
            dataSourceType: "json",
            data: records
        },
        slice: {
            rows: [{ uniqueName: "Row", width: 50 }],
            columns: [{ uniqueName: "Col", width: 55 }],
            measures: [{ uniqueName: "State", aggregation: "sum", width: 55 }]
        },
        options: {
            showGrandTotals: "off",
            showTotals: "off",
            grid: { columnsWidth: 44 }
        }
    };
}

function initBoards() {
    myBoardRecords = initBoardData();
    enemyBoardRecords = initBoardData();
    myBoardData = Array(10).fill(null).map(() => Array(10).fill(0));
    currentShipIndex = 0;

    myPivot = new WebDataRocks({
        container: "#my-wdr",
        toolbar: false,
        width: "100%",
        height: 420,
        customizeCell
    });

    enemyPivot = new WebDataRocks({
        container: "#enemy-wdr",
        toolbar: false,
        width: "100%",
        height: 420,
        customizeCell
    });

    myPivot.on("ready", () => {
        myPivot.setReport(buildReport(myBoardRecords));
        myPivot.on("reportcomplete", () => {
            assignDataAttrs("my-wdr");
            styleAllCells("my-wdr", myBoardRecords);
        });
        myPivot.on("cellclick", (cell) => {
            if (cell.type !== "value") return;
            const row = cell.rows?.[0]?.caption ?? cell.rowData?.["Row"]?.caption;
            const col = cell.columns?.[0]?.caption ?? cell.columnData?.["Col"]?.caption;
            console.log("[WDR] my cellclick row=%s col=%s", row, col, cell);
            if (row == null || col == null) return;
            handleMyBoardClick(Number(col), Number(row));
        });
    });

    enemyPivot.on("ready", () => {
        enemyPivot.setReport(buildReport(enemyBoardRecords));
        enemyPivot.on("reportcomplete", () => {
            assignDataAttrs("enemy-wdr");
            styleAllCells("enemy-wdr", enemyBoardRecords);
        });
        enemyPivot.on("cellclick", (cell) => {
            if (cell.type !== "value") return;
            const row = cell.rows?.[0]?.caption ?? cell.rowData?.["Row"]?.caption;
            const col = cell.columns?.[0]?.caption ?? cell.columnData?.["Col"]?.caption;
            console.log("[WDR] enemy cellclick row=%s col=%s", row, col, cell);
            if (row == null || col == null) return;
            handleFire(Number(col), Number(row));
        });
    });

    setupBoardInteraction();
}

function assignDataAttrs(containerId) {
    const container = document.getElementById(containerId);

    let dataTable = null;
    let maxTds = 0;
    container.querySelectorAll("table").forEach(t => {
        const n = t.querySelectorAll("td").length;
        if (n > maxTds) { maxTds = n; dataTable = t; }
    });

    if (!dataTable) return;

    const dataRows = [...dataTable.querySelectorAll("tr")]
        .filter(tr => tr.querySelectorAll("td").length > 0)
        .slice(0, 10);

    dataRows.forEach((tr, rowIdx) => {
        [...tr.querySelectorAll("td")].forEach((td, colIdx) => {
            td.setAttribute("data-row", String(rowIdx));
            td.setAttribute("data-col", String(colIdx));
        });
    });

    console.log(`[WDR] ${containerId}: tagged ${dataRows.length} rows`);
}

function styleAllCells(containerId, records) {
    document.querySelectorAll(`#${containerId} td[data-row]`).forEach(td => {
        const rec = getRecord(records, Number(td.dataset.row), Number(td.dataset.col));
        const state = rec ? rec.State : 0;
        td.style.cssText = [
            `background:${STATE_COLORS[state] ?? "#1e3a5f"}`,
            "cursor:pointer",
            "text-align:center",
            "vertical-align:middle",
            "border:1px solid #2a4a6b",
            "box-sizing:border-box",
            "font-size:1.15rem"
        ].join(";");
        td.textContent = state === 2 ? "💥" : state === -1 ? "✖" : "";
    });
}

// Click & hover via DOM delegation

function setupBoardInteraction() {
    const myContainer = document.getElementById("my-wdr");

    // Clicks are handled by WDR's cellclick event (registered in initBoards)
    myContainer.addEventListener("mouseover", (e) => {
        const td = e.target.closest("td[data-row]");
        if (!td) return;
        drawPreview(Number(td.dataset.col), Number(td.dataset.row));
    });

    myContainer.addEventListener("mouseleave", () => {
        clearPreview();
    });
}

// Ship placement

function canPlaceShip(startX, startY, size) {
    const shipCells = [];
    for (let i = 0; i < size; i++) {
        const x = isHorizontal ? startX + i : startX;
        const y = isHorizontal ? startY : startY + i;
        if (x >= 10 || y >= 10) return false;
        if (myBoardData[y][x] === 1) return false;
        shipCells.push([x, y]);
    }

    // Ships must not touch each other, check all 8 neighbors of every ship cell
    for (const [cx, cy] of shipCells) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx < 0 || nx >= 10 || ny < 0 || ny >= 10) continue;
                if (shipCells.some(([sx, sy]) => sx === nx && sy === ny)) continue;
                if (myBoardData[ny][nx] === 1) return false;
            }
        }
    }

    return true;
}

function handleMyBoardClick(x, y) {
    if (currentShipIndex >= fleet.length) return;
    const ship = fleet[currentShipIndex];
    if (!canPlaceShip(x, y, ship.size)) return;

    for (let i = 0; i < ship.size; i++) {
        const tx = isHorizontal ? x + i : x;
        const ty = isHorizontal ? y : y + i;
        myBoardData[ty][tx] = 1;
        setRecordState(myBoardRecords, ty, tx, 1);
    }

    myPivot.updateData({ data: myBoardRecords });
    currentShipIndex++;

    if (currentShipIndex < fleet.length) {
        shipNameDisplay.innerText = `${fleet[currentShipIndex].name} (${fleet[currentShipIndex].size})`;
    } else {
        shipNameDisplay.innerText = "Fleet Deployed! Waiting for opponent...";
        btnRotate.style.display = "none";
        socket.send(JSON.stringify({
            action: "send_board",
            board_data: myBoardData,
            room_code: currentRoomCode
        }));
        console.log("Final Board Data:", myBoardData);
    }
}


function clearPreview() {
    document.querySelectorAll("#my-wdr td.wdr-preview").forEach(el => {
        el.style.background = el.dataset.origBg || STATE_COLORS[0];
        el.classList.remove("wdr-preview");
    });
}

// Fire

function handleFire(x, y) {
    if (!currentRoomCode) return;
    if (!myTurn) {
        alert("Hold your fire! It's not your turn.");
        return;
    }
    const rec = getRecord(enemyBoardRecords, y, x);
    if (rec && (rec.State === 2 || rec.State === -1)) return;

    socket.send(JSON.stringify({ action: "fire", room_code: currentRoomCode, x, y }));
}

// Post-game stats

function showPostGameStats() {
    battleArea.style.display = "none";

    const statsContainer = document.createElement("div");
    statsContainer.id = "wdr-stats";
    statsContainer.style.cssText = "width:100%;max-width:900px;margin:2rem auto;";
    document.body.appendChild(statsContainer);

    new WebDataRocks({
        container: "#wdr-stats",
        toolbar: true,
        report: {
            dataSource: {
                data: [
                    { Player: "Me", "Shots Fired": myShots, Hits: myHits, Misses: myShots - myHits },
                    { Player: "Opponent", "Shots Fired": enemyShots, Hits: enemyHits, Misses: enemyShots - enemyHits }
                ]
            },
            slice: {
                rows: [{ uniqueName: "Player" }],
                columns: [{ uniqueName: "Measures" }],
                measures: [
                    { uniqueName: "Shots Fired", aggregation: "sum" },
                    { uniqueName: "Hits", aggregation: "sum" },
                    { uniqueName: "Misses", aggregation: "sum" }
                ]
            }
        }
    });
}
