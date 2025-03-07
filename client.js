let socket;
let gameId = null;
let playerId = null;
let playerRole = null;
let isHost = false;
let isAlive = true;
let cardFlipped = false;
let selectedPlayerId = null;

function connectToServer() {
  socket = io('https://juegolobo-backend.onrender.com', { // Reemplaza con la URL de tu backend
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    query: { playerId: localStorage.getItem('playerId'), gameId: localStorage.getItem('gameId') },
  });
  
  socket.on('connect', () => {
    console.log('Conectado al servidor con socket.id:', socket.id);
    restoreOrStartSession();
    if (playerId && gameId && isHost) socket.emit('updateHostSocket', { gameId, playerId });
  });
  
  socket.on('disconnect', (reason) => {
    console.log('Desconectado del servidor:', reason);
    showMessage('Desconectado del servidor. Intentando reconectar...', 'error');
  });
  
  socket.on('reconnect', () => {
    console.log('Reconectado al servidor con socket.id:', socket.id);
    restoreOrStartSession();
    if (playerId && gameId && isHost) socket.emit('updateHostSocket', { gameId, playerId });
  });
  
  socket.on('gameCreated', handleGameCreated);
  socket.on('gameJoined', handleGameJoined);
  socket.on('error', handleError);
  socket.on('updatePlayers', handleUpdatePlayers);
  socket.on('gameStarted', handleGameStarted);
  socket.on('hostGameStarted', handleHostGameStarted);
  socket.on('roleAssigned', handleRoleAssigned);
  socket.on('updateGameState', handleUpdateGameState);
  socket.on('cardFlipped', handleCardFlipped);
  socket.on('gameOver', handleGameOver);
  socket.on('playerDisconnected', handlePlayerDisconnected);
  socket.on('playerReconnected', handlePlayerReconnected);
  socket.on('sessionRestored', handleSessionRestored);
  socket.on('gameReset', handleGameReset);
  socket.on('displayPlayerRole', handleDisplayPlayerRole);
  socket.on('playersList', handlePlayersList);
  socket.on('voteUpdate', handleVoteUpdate);
  socket.on('dayEnd', handleDayEnd);
  socket.on('nightEnd', handleNightEnd);
}

function restoreOrStartSession() {
  const savedData = JSON.parse(localStorage.getItem('gameSession')) || {};
  const playerId = savedData.playerId;
  const gameId = savedData.gameId;
  const isHost = savedData.isHost || false;

  if (playerId && gameId) {
    socket.emit('restoreSession', { playerId, gameId });
  } else {
    showScreen('home');
  }
}

function saveSession() {
  if (playerId && gameId) {
    localStorage.setItem('gameSession', JSON.stringify({ playerId, gameId, isHost }));
    localStorage.setItem('playerId', playerId);
  }
}

function handleGameCreated(data) {
  gameId = data.gameId;
  playerId = data.playerId;
  isHost = true;
  saveSession();
  document.getElementById('gameCodeDisplay').textContent = gameId;
  showScreen('lobby');
  document.getElementById('startButton').style.display = 'block';
}

function handleGameJoined(data) {
  gameId = data.gameId;
  playerId = data.playerId;
  isHost = false;
  saveSession();
  document.getElementById('gameCodeDisplay').textContent = gameId;
  showScreen('lobby');
  document.getElementById('startButton').style.display = 'none';
}

function handleSessionRestored(data) {
  gameId = data.gameId;
  playerId = data.playerId;
  playerRole = data.role;
  isHost = data.isHost;
  isAlive = data.alive;
  cardFlipped = false; // Reiniciar estado de la carta
  saveSession();
  if (isHost) {
    showScreen('host');
    handleHostGameStarted({ players: data.state.players });
  } else if (data.state.state === 'lobby') {
    showScreen('lobby');
  } else {
    showScreen('game');
    handleRoleAssigned({ role: playerRole });
    handleUpdateGameState(data.state);
    // Reasignar evento de volteo de carta
    document.getElementById('roleCard').removeEventListener('click', flipCard);
    document.getElementById('roleCard').addEventListener('click', flipCard);
  }
  showMessage('Sesión restaurada con éxito', 'success');
}

function handleGameReset(data) {
  gameId = data.gameId;
  playerRole = null;
  isAlive = true;
  cardFlipped = false;
  saveSession();
  showScreen('lobby');
  document.getElementById('gameCodeDisplay').textContent = gameId;
  document.getElementById('startButton').style.display = isHost ? 'block' : 'none';
  handleUpdatePlayers(data.players);
  if (!isHost) {
    const roleCard = document.getElementById('roleCard');
    roleCard.classList.remove('flipping');
    document.getElementById('playerRole').textContent = '-';
    document.getElementById('roleDescription').textContent = 'Haz clic en la carta para voltearla';
  }
  showMessage('Partida reiniciada', 'success');
}

function handlePlayerReconnected(data) {
  showMessage(`Jugador ${data.name} se ha reconectado`, 'success');
}

function handleError(data) {
  showMessage(data.message, 'error');
  localStorage.removeItem('gameSession');
  localStorage.removeItem('playerId');
  showScreen('home');
}

function handleUpdatePlayers(players) {
  const playerList = document.getElementById('playerList');
  playerList.innerHTML = '';
  players.forEach(player => {
    if (!player.disconnected) {
      const playerItem = document.createElement('div');
      playerItem.className = 'player-item';
      playerItem.textContent = player.name + (player.isHost ? ' (Anfitrión)' : '');
      playerList.appendChild(playerItem);
    }
  });
  if (isHost) {
    updateHostPlayersList(players); // Actualizar la lista del host con roles
  }
}

function handleGameStarted() {
  if (!isHost) showScreen('game');
  showMessage('¡El juego ha comenzado!', 'info');
}

function handleHostGameStarted(data) {
  showScreen('host');
  showMessage('¡Controla la partida desde aquí!', 'info');
  document.getElementById('hostGameDay').textContent = 1;
  document.getElementById('hostGameTime').textContent = 'Noche';
  updateHostPlayersList(data.players); // Usar los datos con roles
}

function handleRoleAssigned(data) {
  playerRole = data.role;
  const roleElement = document.getElementById('playerRole');
  const roleImageElement = document.getElementById('roleImage');
  roleElement.textContent = '-'; // Inicialmente un guión
  roleImageElement.src = `images/${playerRole}.png`;
  roleImageElement.alt = translateRole(playerRole);
  document.getElementById('roleDescription').textContent = 'Haz clic en la carta para voltearla';
}

function handleCardFlipped() {
  const roleCard = document.getElementById('roleCard');
  cardFlipped = !cardFlipped;
  if (cardFlipped) {
    roleCard.classList.add('flipping');
    document.getElementById('playerRole').textContent = translateRole(playerRole);
    document.getElementById('roleDescription').textContent = getRoleDescription(playerRole);
    document.getElementById('roleDescription').style.display = 'block';
  } else {
    roleCard.classList.remove('flipping');
    document.getElementById('playerRole').textContent = '-';
    document.getElementById('roleDescription').textContent = 'Haz clic en la carta para voltearla';
  }
}

function handleUpdateGameState(state) {
  if (isHost) {
    document.getElementById('hostGameDay').textContent = state.day;
    document.getElementById('hostGameTime').textContent = translateTime(state.time);
    updateHostPlayersList(state.players);
  } else {
    document.getElementById('gameDay').textContent = state.day;
    document.getElementById('gameTime').textContent = translateTime(state.time);
    isAlive = state.players.find(p => p.id === playerId)?.alive ?? true;
    const roleCross = document.getElementById('roleCross');
    roleCross.style.display = isAlive ? 'none' : 'block';

    const playersList = document.getElementById('gamePlayersList');
    playersList.innerHTML = '';
    state.players.forEach(player => {
      if (!player.isHost && player.alive) {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        if (player.id === playerId) playerItem.classList.add('self');
        playerItem.textContent = player.name;
        playerItem.dataset.id = player.id;
        if (state.time === 'day' && isAlive && player.id !== playerId) {
          playerItem.addEventListener('click', () => selectPlayer(player.id, player.name));
        }
        playersList.appendChild(playerItem);
      }
    });

    updateControls(state.time);
  }
}

function handleDisplayPlayerRole(data) {
  const roleOverlay = document.getElementById('roleOverlay');
  document.getElementById('overlayPlayerName').textContent = data.name;
  document.getElementById('overlayPlayerRole').textContent = translateRole(data.role);
  document.getElementById('overlayRoleImage').src = `images/${data.role}.png`;
  roleOverlay.style.display = 'flex';
}

function handlePlayersList(players) {
  // Esta función no hace nada aquí, se usa en showManagePlayers y showPlayerRoles directamente
}

function handleVoteUpdate(data) {
  showMessage(`${data.playerName} ha votado contra ${data.targetName}`, 'info');
}

function handleNightEnd(data) {
  if (data.deadPlayers && data.deadPlayers.length > 0) {
    data.deadPlayers.forEach(playerName => {
      showMessage(`${playerName} ha muerto durante la noche.`, 'error');
    });
  } else {
    showMessage('Nadie ha muerto esta noche.', 'info');
  }
}

function handleDayEnd(data) {
  if (data.eliminatedPlayer) {
    showMessage(`El pueblo ha decidido eliminar a ${data.eliminatedPlayer}.`, 'error');
  } else {
    showMessage('El pueblo no ha eliminado a nadie hoy.', 'info');
  }
  resetActionButtons();
}

function updateHostPlayersList(players) {
  const hostPlayersList = document.getElementById('hostPlayersList');
  hostPlayersList.innerHTML = '';
  players.forEach(player => {
    if (!player.disconnected && !player.isHost) {
      const playerItem = document.createElement('div');
      playerItem.className = 'player-item';
      // Siempre mostrar la carta, incluso si el rol es null (usará null.png si no está asignado)
      const roleImage = player.role || 'default-card'; // Usa default-card si el rol es null
      playerItem.innerHTML = `
        <img src="images/${roleImage}.png" class="role-icon-small" alt="${translateRole(player.role || 'Desconocido')}">
        ${player.name}: ${player.alive ? 'Vivo' : 'Muerto'}
      `;
      hostPlayersList.appendChild(playerItem);
    }
  });
}

function handleGameOver(data) {
  let message = data.winner === 'werewolves' ? '¡Los Lobos han ganado!' : '¡Los Aldeanos han ganado!';
  let rolesInfo = '';
  data.roles.forEach(p => {
    rolesInfo += `<div><img src="images/${p.role}.png" class="role-icon"> ${p.name}: ${translateRole(p.role)}</div>`;
  });
  document.getElementById('gameOverMessage').innerHTML = message;
  document.getElementById('gameOverRoles').innerHTML = rolesInfo;
  showScreen('gameOver');
  localStorage.removeItem('gameSession');
  localStorage.removeItem('playerId');
}

function handlePlayerDisconnected(data) {
  showMessage(`${data.name} se ha desconectado`, 'warning');
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => screen.style.display = 'none');
  document.getElementById(screenId + 'Screen').style.display = 'block';
}

function showMessage(message, type = 'info') {
  const messageContainer = document.getElementById('messageContainer');
  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  messageElement.textContent = message;
  messageContainer.appendChild(messageElement);
  setTimeout(() => {
    messageElement.classList.add('fade-out');
    setTimeout(() => messageContainer.removeChild(messageElement), 1000);
  }, 5000);
}

function translateRole(role) {
  const roles = {
    'werewolf': 'Lobo',
    'villager': 'Aldeano',
    'seer': 'Vidente',
    'doctor': 'Protector',
    'witch': 'Bruja',
    'hunter': 'Cazador',
    'girl': 'Niña',
    'cupid': 'Cupido',
    'fox': 'Zorro',
  };
  return roles[role] || role;
}

function getRoleDescription(role) {
  const descriptions = {
    'werewolf': 'Tu objetivo es eliminar a todos los aldeanos.',
    'villager': 'Tu objetivo es descubrir quiénes son los lobos.',
    'seer': 'Puedes descubrir el rol de un jugador al inicio de cada ronda.',
    'doctor': 'Puedes proteger a un jugador del ataque de los lobos.',
    'witch': 'Usa pociones para revivir o matar en función de lo que te diga la madre.',
    'hunter': 'Si mueres, puedes eliminar a un jugador directamente.',
    'girl': 'En la ronda de los lobos puedes abrir los ojos SIN QUE SE NOTE y recopilar información',
    'cupid': 'Une a dos jugadores en amor.',
    'fox': 'Investiga si hay lobos cerca.',
  };
  return descriptions[role] || 'Sin descripción disponible.';
}

function translateTime(time) {
  return time === 'day' ? 'Día' : 'Noche';
}

function flipCard() {
  socket.emit('flipCard', { gameId, playerId });
}

function updateControls(time) {
  const actionButtons = document.getElementById('actionButtons');
  actionButtons.innerHTML = '';

  if (!isAlive) {
    const actionText = document.createElement('div');
    actionText.textContent = 'Estás muerto. No puedes realizar acciones.';
    actionText.className = 'action-text';
    actionButtons.appendChild(actionText);
    return;
  }

  if (time === 'day') {
    const actionText = document.createElement('div');
    actionText.textContent = 'Vota por alguien para eliminar:';
    actionText.className = 'action-text';
    actionButtons.appendChild(actionText);

    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Confirmar voto';
    confirmButton.className = 'action-button';
    confirmButton.id = 'confirmButton';
    confirmButton.disabled = true;
    confirmButton.onclick = () => {
      if (selectedPlayerId) confirmVote();
    };
    actionButtons.appendChild(confirmButton);
  } else {
    const actionText = document.createElement('div');
    actionText.textContent = 'Es de noche. Espera al día para votar.';
    actionText.className = 'action-text';
    actionButtons.appendChild(actionText);
  }
}

function selectPlayer(id, name) {
  const previousSelected = document.querySelector('.player-item.selected');
  if (previousSelected) previousSelected.classList.remove('selected');
  const playerElement = document.querySelector(`.player-item[data-id="${id}"]`);
  if (playerElement) {
    playerElement.classList.add('selected');
    selectedPlayerId = id;
    const confirmButton = document.getElementById('confirmButton');
    if (confirmButton) confirmButton.disabled = false;
  }
}

function confirmVote() {
  if (!selectedPlayerId) {
    showMessage('Por favor, selecciona un jugador antes de confirmar.', 'error');
    return;
  }
  socket.emit('dayVote', { gameId, targetId: selectedPlayerId });
  disablePlayerSelection();
  showMessage(`Has votado por ${document.querySelector(`.player-item[data-id="${selectedPlayerId}"]`).textContent}`, 'info');
}

function disablePlayerSelection() {
  const players = document.querySelectorAll('.player-item');
  players.forEach(player => {
    player.removeEventListener('click', selectPlayer);
    player.classList.add('disabled');
  });
  const confirmButton = document.getElementById('confirmButton');
  if (confirmButton) confirmButton.disabled = true;
}

function resetActionButtons() {
  selectedPlayerId = null;
  const players = document.querySelectorAll('.player-item');
  players.forEach(player => {
    player.classList.remove('selected');
    player.classList.remove('disabled');
    if (!player.classList.contains('self')) {
      player.addEventListener('click', () => selectPlayer(player.dataset.id, player.textContent));
    }
  });
  const confirmButton = document.getElementById('confirmButton');
  if (confirmButton) confirmButton.disabled = true;
}

function showManagePlayers() {
  socket.emit('requestPlayers', gameId);
  socket.once('playersList', (players) => {
    const modal = document.getElementById('managePlayersModal');
    const playerList = document.getElementById('managePlayersList');
    playerList.innerHTML = '';
    const nonHostPlayers = players.filter(p => !p.isHost && !p.disconnected);
    nonHostPlayers.forEach(player => {
      const div = document.createElement('div');
      div.className = 'player-manage-item';
      div.innerHTML = `
        ${player.name} (${translateRole(player.role)}) 
        <button class="action-button" onclick="togglePlayerStatus('${player.id}', ${!player.alive})">${player.alive ? 'Marcar como Muerto' : 'Marcar como Vivo'}</button>
      `;
      playerList.appendChild(div);
    });
    modal.style.display = 'flex';
  });
}

function showPlayerRoles() {
  socket.emit('requestPlayers', gameId);
  socket.once('playersList', (players) => {
    const modal = document.getElementById('playerRolesModal');
    const playerList = document.getElementById('playerRolesList');
    playerList.innerHTML = '';
    const alivePlayers = players.filter(p => !p.isHost && p.alive && !p.disconnected);
    alivePlayers.forEach(player => {
      const div = document.createElement('div');
      div.className = 'player-item modal-player-item';
      div.textContent = player.name;
      div.onclick = () => {
        socket.emit('showPlayerRole', { gameId, playerId: player.id });
        closeModal();
      };
      playerList.appendChild(div);
    });
    modal.style.display = 'flex';
  });
}

function togglePlayerStatus(playerId, alive) {
  socket.emit('updatePlayerStatus', { gameId, playerId, alive });
  closeModal();
}

function closeModal() {
  document.getElementById('managePlayersModal').style.display = 'none';
  document.getElementById('playerRolesModal').style.display = 'none';
}

function hideRoleOverlay() {
  document.getElementById('roleOverlay').style.display = 'none';
}

function createGame() {
  const playerName = document.getElementById('playerNameCreate').value.trim();
  if (!playerName) return showMessage('Introduce tu nombre', 'error');
  socket.emit('createGame', playerName);
}

function joinGame() {
  const playerName = document.getElementById('playerNameJoin').value.trim();
  const gameCode = document.getElementById('gameCode').value.trim();
  if (!playerName || !gameCode) return showMessage('Introduce tu nombre y el código', 'error');
  socket.emit('joinGame', { gameId: gameCode, playerName });
}

function startGame() {
  socket.emit('startGame', { gameId, playerId });
}

function playAgain() {
  if (gameId) socket.emit('playAgain', gameId);
}

document.addEventListener('DOMContentLoaded', () => {
  connectToServer();
  document.getElementById('createGameButton').addEventListener('click', () => {
    document.getElementById('createGameForm').style.display = 'block';
    document.getElementById('joinGameForm').style.display = 'none';
  });
  document.getElementById('joinGameButton').addEventListener('click', () => {
    document.getElementById('createGameForm').style.display = 'none';
    document.getElementById('joinGameForm').style.display = 'block';
  });
  document.getElementById('submitCreateGame').addEventListener('click', createGame);
  document.getElementById('submitJoinGame').addEventListener('click', joinGame);
  document.getElementById('startButton').addEventListener('click', startGame);
  document.getElementById('playAgainButton').addEventListener('click', playAgain);
  document.getElementById('hostAdvancePhase').addEventListener('click', () => socket.emit('advancePhase', gameId));
  document.getElementById('hostManagePlayers').addEventListener('click', showManagePlayers);
  document.getElementById('hostShowRoles').addEventListener('click', showPlayerRoles);
  document.getElementById('roleCard').addEventListener('click', flipCard);
  document.getElementById('roleOverlay').addEventListener('click', hideRoleOverlay);
});