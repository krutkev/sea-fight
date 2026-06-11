from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import random
import string
from typing import List, Dict

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

active_rooms: Dict[str, Dict] = {}
# active_rooms = {
#   "room_code": {
#       "players": [p1, p2],
#       "boards": {
#           soket1: [BOARD_INFO],
#           soket2: [BOARD_INFO],
#       },
#   }

def generate_room_code():
    """Generate random 4-character room code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    current_room = None
    
    try:
        while True:
            data = await websocket.receive_text()
            request = json.loads(data)
            print(request)

            # Creating room
            if request["action"] == "create_room":
                room_code = generate_room_code()
                # Check if name not busy
                while room_code in active_rooms:
                    room_code = generate_room_code()

                active_rooms[room_code] = {
                    "players": [websocket],
                    "boards": {},
                }
                current_room = room_code
                # Notify and send code
                await websocket.send_text(json.dumps({"type": "room_created", "room_code": room_code}))

            elif request["action"] == "join_room":
                room_code = request["room_code"]
                # Check if room exists
                if room_code in active_rooms:
                    # Check if not full
                    if len(active_rooms[room_code]["players"]) < 2:
                        # Add connection to the room
                        active_rooms[room_code]["players"].append(websocket)
                        current_room = room_code

                        await websocket.send_text(json.dumps({"type": "room_joined", "room_code": room_code}))
                        
                        # Start game
                        if len(active_rooms[room_code]["players"]) >= 2:
                            for player_socket in active_rooms[room_code]["players"]:
                                await player_socket.send_text(json.dumps({"type": "game_start"}))

                    else:
                        await websocket.send_text(json.dumps({"type": "error", "text": "Room is already full"}))
                else:
                    await websocket.send_text(json.dumps({"type": "error", "text": "Non-existent room code"}))

            elif request["action"] == "send_board":
                room_code = request["room_code"]
                board_data = request["board_data"]
                active_rooms[room_code]["boards"][websocket] = board_data
                
                if len(active_rooms[room_code]["boards"]) == 2:
                    print(f"Both players in {room_code} are ready! Starting battle.")
                    
                    players = active_rooms[room_code]["players"]
                    active_rooms[room_code]["current_turn"] = players[0]
                    
                    await players[0].send_text(json.dumps({"type": "all_ready", "my_turn": True}))
                    await players[1].send_text(json.dumps({"type": "all_ready", "my_turn": False}))

            elif request["action"] == "fire":
                room_code = request["room_code"]
                x = request["x"]
                y = request["y"]
                
                room = active_rooms[room_code]

                if room.get("current_turn") != websocket:
                    await websocket.send_text(json.dumps({"type": "error", "text": "Hold your fire! It's not your turn."}))
                    continue
                
                opponent_socket = None
                for player in room["players"]:
                    if player != websocket:
                        opponent_socket = player
                        break
                
                if opponent_socket and opponent_socket in room["boards"]:
                    opponent_board = room["boards"][opponent_socket]
                    
                    if opponent_board[y][x] == 2 or opponent_board[y][x] == -1:
                        await websocket.send_text(json.dumps({"type": "error", "text": "Coordinates already bombarded!"}))
                        continue
                    
                    is_hit = (opponent_board[y][x] == 1)
                    status = "hit" if is_hit else "miss"
                    
                    if is_hit:
                        opponent_board[y][x] = 2 # 2 = Destroyed
                        
                        # Victory check
                        has_ships_left = any(1 in row for row in opponent_board)
                        
                        if not has_ships_left:
                            await websocket.send_text(json.dumps({"type": "game_over", "winner": "me"}))
                            await opponent_socket.send_text(json.dumps({"type": "game_over", "winner": "opponent"}))
                            continue

                    else:
                        opponent_board[y][x] = -1 # -1 = Missed Water
                        room["current_turn"] = opponent_socket
                        
                    shooter_keeps_turn = is_hit
                    
                    await websocket.send_text(json.dumps({
                        "type": "fire_result",
                        "shooter": "me",
                        "x": x, "y": y,
                        "status": status,
                        "my_turn": shooter_keeps_turn
                    }))

                    await opponent_socket.send_text(json.dumps({
                        "type": "fire_result",
                        "shooter": "opponent",
                        "x": x, "y": y,
                        "status": status,
                        "my_turn": not shooter_keeps_turn
                    }))

            else:
                await websocket.send_text(json.dumps({"type": "error", "text": "Unregistered action"}))

    except WebSocketDisconnect:
        # Handle user disconnecting
        if current_room and current_room in active_rooms:
            if websocket in active_rooms[current_room]["players"]:
                active_rooms[current_room]["players"].remove(websocket)
            # If the room is empty, delete it from memory
            if len(active_rooms[current_room]["players"]) == 0:
                del active_rooms[current_room]